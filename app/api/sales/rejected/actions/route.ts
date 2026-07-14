import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import {
  junkRejectedPipeline,
  reassignRejectedPipeline,
  resolveTeamScopeForStaff,
} from "@/lib/sales-pipeline-rejected";
import {
  assertSalesTlCanAssignTo,
  loadActiveSalesPipelineAssignee,
} from "@/lib/sales-pipeline-assignee";

export async function POST(request: Request) {
  const auth = await requireRoles(["admin", "owner", "salesTl"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: "reassign" | "junk";
    pipelineId?: string;
    pipelineIds?: string[];
    salesRmId?: string;
    junkReason?: string;
    note?: string;
  };

  const ids = body.pipelineIds?.length ? body.pipelineIds : body.pipelineId ? [body.pipelineId] : [];
  if (!ids.length || !body.action) {
    return NextResponse.json({ data: null, error: "action and pipelineId(s) required" }, { status: 400 });
  }

  try {
    const data = await withTransaction(async (tx) => {
      const tlScope =
        auth.session.role === "salesTl"
          ? await resolveTeamScopeForStaff(tx, auth.session.userId, auth.session.role)
          : null;

      const results: Array<{ pipelineId: string; ok: boolean; error?: string }> = [];

      for (const pipelineId of ids) {
        try {
          const [pipe] = await tx<{
            stage: string;
            status: string;
            assignedTo: string | null;
          }[]>`
            SELECT stage, status, assigned_to AS "assignedTo"
            FROM sales.pipeline WHERE id = ${pipelineId}::uuid
          `;
          if (!pipe || pipe.status !== "active" || pipe.stage !== "Rejected") {
            throw Object.assign(new Error("Not in Rejected queue"), { status: 400 });
          }

          if (tlScope?.teamId) {
            if (pipe.assignedTo) {
              const [member] = await tx<{ id: string }[]>`
                SELECT id FROM staff
                WHERE id = ${pipe.assignedTo}::uuid AND team_id = ${tlScope.teamId}::uuid
              `;
              if (!member && pipe.assignedTo !== auth.session.userId) {
                throw Object.assign(new Error("Pipeline not in your team"), { status: 403 });
              }
            }
          } else if (auth.session.role === "salesTl" && !tlScope?.teamId) {
            if (pipe.assignedTo && pipe.assignedTo !== auth.session.userId) {
              throw Object.assign(new Error("Pipeline not assigned to you"), { status: 403 });
            }
          }

          if (body.action === "reassign") {
            if (!body.salesRmId) throw Object.assign(new Error("salesRmId required"), { status: 400 });
            const assignee = await loadActiveSalesPipelineAssignee(tx, body.salesRmId);
            if (!assignee) throw Object.assign(new Error("Invalid salesperson"), { status: 400 });

            if (tlScope?.memberIds?.length) {
              assertSalesTlCanAssignTo(tlScope.memberIds, body.salesRmId);
            }

            await reassignRejectedPipeline(tx, {
              pipelineId,
              salesRmId: body.salesRmId,
              actorId: auth.session.userId,
              assigneeName: assignee.name,
              note: body.note,
            });
          } else {
            await junkRejectedPipeline(tx, {
              pipelineId,
              actorId: auth.session.userId,
              junkReason: body.junkReason,
            });
          }
          results.push({ pipelineId, ok: true });
        } catch (e) {
          results.push({
            pipelineId,
            ok: false,
            error: e instanceof Error ? e.message : "Failed",
          });
        }
      }

      return results;
    });

    const failed = data.filter((r) => !r.ok);
    if (failed.length === data.length) {
      return NextResponse.json({ data: null, error: failed[0]?.error ?? "All actions failed" }, { status: 400 });
    }

    return NextResponse.json({ data: { results: data }, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action failed";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
