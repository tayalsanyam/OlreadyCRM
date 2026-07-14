import { NextResponse } from "next/server";
import { setAuditActor, withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { adminAssignPipeline } from "@/lib/admin-sales-pipeline-assign";
import { loadActiveSalesPipelineAssignee } from "@/lib/sales-pipeline-assignee";
import { PIPELINE_STAGE_ORDER } from "@/lib/types";
import { isManualStageChangeTarget } from "@/lib/sales-stage-transitions";

export async function POST(request: Request) {
  const auth = await requireRoles(["salesTl", "admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => ({}))) as {
    pipelineIds?: string[];
    action?: "assign" | "priority" | "stage";
    assignedTo?: string;
    priorityTag?: string | null;
    stage?: string;
  };

  const ids = body.pipelineIds ?? [];
  if (!ids.length) {
    return NextResponse.json({ data: null, error: "pipelineIds required" }, { status: 400 });
  }
  if (ids.length > 100) {
    return NextResponse.json({ data: null, error: "Max 100 pipelines per request" }, { status: 400 });
  }

  try {
    const result = await withTransaction(async (tx) => {
      await setAuditActor(tx, auth.session.userId);
      let updated = 0;

      const rejected = await tx<{ id: string }[]>`
        SELECT id FROM sales.pipeline
        WHERE id = ANY(${ids}::uuid[]) AND status = 'active' AND stage = 'Rejected'
      `;
      if (rejected.length) {
        throw Object.assign(
          new Error("Rejected pipelines must be handled from the Rejected queue (re-assign or junk)"),
          { status: 400 },
        );
      }

      if (body.action === "assign") {
        if (!body.assignedTo) throw Object.assign(new Error("assignedTo required"), { status: 400 });
        const assignee = await loadActiveSalesPipelineAssignee(tx, body.assignedTo);
        if (!assignee) throw Object.assign(new Error("Invalid salesperson"), { status: 400 });

        const pipes = await tx<{ id: string; assignedTo: string | null }[]>`
          SELECT id, assigned_to AS "assignedTo"
          FROM sales.pipeline
          WHERE id = ANY(${ids}::uuid[]) AND status = 'active'
        `;

        if (auth.session.role === "admin" || auth.session.role === "owner") {
          for (const pipe of pipes) {
            await adminAssignPipeline(tx, {
              pipelineId: pipe.id,
              salesRmId: body.assignedTo,
              actorId: auth.session.userId,
              assigneeName: assignee.name,
              wasUnassigned: !pipe.assignedTo,
            });
          }
          updated = pipes.length;
        } else {
          const rows = await tx`
            UPDATE sales.pipeline
            SET assigned_to = ${body.assignedTo}::uuid, updated_at = NOW()
            WHERE id = ANY(${ids}::uuid[]) AND status = 'active'
            RETURNING id
          `;
          updated = rows.length;
          for (const row of rows as { id: string }[]) {
            await tx`
              INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id)
              VALUES (${row.id}::uuid, 'stageChanged', 'Bulk assigned', ${auth.session.userId}::uuid)
            `;
          }
        }
      } else if (body.action === "priority") {
        const tag = body.priorityTag ?? null;
        if (tag && !["hot", "follow_up", "nurturing", "cold"].includes(tag)) {
          throw Object.assign(new Error("Invalid priority tag"), { status: 400 });
        }
        const rows = await tx`
          UPDATE sales.pipeline
          SET priority_tag = ${tag}, updated_at = NOW()
          WHERE id = ANY(${ids}::uuid[]) AND status = 'active'
          RETURNING id
        `;
        updated = rows.length;
      } else if (body.action === "stage") {
        if (
          !body.stage ||
          !PIPELINE_STAGE_ORDER.includes(body.stage as (typeof PIPELINE_STAGE_ORDER)[number]) ||
          !isManualStageChangeTarget(body.stage as (typeof PIPELINE_STAGE_ORDER)[number])
        ) {
          throw Object.assign(
            new Error(
              body.stage === "Senior Call Done"
                ? "Senior Call Done is set automatically when the TL completes the senior call task"
                : "Invalid stage",
            ),
            { status: 400 },
          );
        }
        const before = await tx<{ id: string; stage: string }[]>`
          SELECT id, stage FROM sales.pipeline WHERE id = ANY(${ids}::uuid[]) AND status = 'active'
        `;
        const rows = await tx<{ id: string }[]>`
          UPDATE sales.pipeline
          SET stage = ${body.stage}, updated_at = NOW()
          WHERE id = ANY(${ids}::uuid[]) AND status = 'active'
          RETURNING id
        `;
        updated = rows.length;
        const fromMap = new Map(before.map((r: { id: string; stage: string }) => [r.id, r.stage]));
        for (const row of rows as { id: string }[]) {
          await tx`
            INSERT INTO sales.stage_log (pipeline_id, from_stage, to_stage, changed_by, note)
            VALUES (${row.id}::uuid, ${fromMap.get(row.id) ?? null}, ${body.stage}, ${auth.session.userId}::uuid, 'Bulk stage move')
          `;
        }
      } else {
        throw Object.assign(new Error("action must be assign, priority, or stage"), { status: 400 });
      }

      return { updated };
    });

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 500;
    const message = error instanceof Error ? error.message : "Bulk update failed";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
