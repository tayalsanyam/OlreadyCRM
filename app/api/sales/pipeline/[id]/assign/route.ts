import { NextResponse } from "next/server";
import { insertAuditLog, setAuditActor, withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { assertPipelineAccess, loadPipelineForAccess } from "@/lib/sales-pipeline-access";
import {
  assertSalesTlCanAssignTo,
  loadActiveSalesPipelineAssignee,
} from "@/lib/sales-pipeline-assignee";
import { resolveTeamScopeForStaff } from "@/lib/sales-pipeline-rejected";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(["salesTl", "admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { salesRmId?: string; reason?: string };
  if (!body.salesRmId) {
    return NextResponse.json({ data: null, error: "salesRmId required" }, { status: 400 });
  }
  const salesRmId = body.salesRmId;

  try {
    await withTransaction(async (tx) => {
      const pipe = await assertPipelineAccess(tx, auth.session, id);
      if (pipe.stage === "Rejected") {
        throw Object.assign(
          new Error("Rejected pipelines must be re-assigned from the Rejected queue"),
          { status: 400 },
        );
      }
      const assignee = await loadActiveSalesPipelineAssignee(tx, salesRmId);
      if (!assignee) throw Object.assign(new Error("Invalid salesperson"), { status: 400 });

      if (auth.session.role === "salesTl") {
        const tlScope = await resolveTeamScopeForStaff(tx, auth.session.userId, auth.session.role);
        if (tlScope.memberIds.length) {
          assertSalesTlCanAssignTo(tlScope.memberIds, salesRmId);
        }
      }

      const fromId = pipe.assignedTo;
      await setAuditActor(tx, auth.session.userId);
      await tx`
        UPDATE sales.pipeline
        SET assigned_to = ${salesRmId}::uuid, updated_at = NOW()
        WHERE id = ${id}::uuid
      `;
      await tx`
        INSERT INTO sales.assignment_log (pipeline_id, from_staff_id, to_staff_id, changed_by, reason)
        VALUES (
          ${id}::uuid,
          ${fromId ?? null}::uuid,
          ${body.salesRmId}::uuid,
          ${auth.session.userId}::uuid,
          ${body.reason?.trim() ?? null}
        )
      `;
      await insertAuditLog(tx, {
        tableName: "sales_pipeline",
        recordId: id,
        action: "reassign",
        actorId: auth.session.userId,
        changes: { from: fromId, to: body.salesRmId, reason: body.reason ?? null },
      });
      await tx`
        INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id)
        VALUES (
          ${id}::uuid,
          'stageChanged',
          ${`Reassigned to ${assignee.name}`},
          ${auth.session.userId}::uuid
        )
      `;
      const [pipeType] = await tx<{ muaType: string; muaName: string }[]>`
        SELECT p.mua_type AS "muaType", m.name AS "muaName"
        FROM sales.pipeline p
        JOIN rm.muas m ON m.id = p.mua_id
        WHERE p.id = ${id}::uuid
      `;
      const { createAssignFollowUpTask } = await import("@/lib/sales-pipeline-assign-tasks");
      if (pipeType) {
        await createAssignFollowUpTask(tx, {
          pipelineId: id,
          salesRmId: body.salesRmId!,
          wasUnassigned: false,
          muaType: pipeType.muaType,
          muaName: pipeType.muaName,
        });
      }
    });

    const updated = await withTransaction((tx) => loadPipelineForAccess(tx, id));
    return NextResponse.json({ data: { ok: true, pipeline: updated }, error: null });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 500;
    const message = error instanceof Error ? error.message : "Failed to reassign";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
