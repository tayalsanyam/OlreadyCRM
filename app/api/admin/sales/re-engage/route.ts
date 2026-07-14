import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { loadActiveSalesPipelineAssignee } from "@/lib/sales-pipeline-assignee";

export async function POST(request: Request) {
  const auth = await requireRoles(["salesTl", "admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => ({}))) as {
    muaIds?: string[];
    assignedTo?: string;
    preserveSource?: boolean;
  };

  const muaIds = body.muaIds ?? [];
  if (!muaIds.length) {
    return NextResponse.json({ data: null, error: "muaIds required" }, { status: 400 });
  }

  try {
    const data = await withTransaction(async (tx) => {
      const created: Array<{ muaId: string; pipelineId: string }> = [];
      const skipped: Array<{ muaId: string; reason: string }> = [];

      for (const muaId of muaIds) {
        const [mua] = await tx<{ id: string; name: string; status: string; source: string | null }[]>`
          SELECT id, name, status::text AS status, source FROM muas WHERE id = ${muaId}::uuid
        `;
        if (!mua) {
          skipped.push({ muaId, reason: "MUA not found" });
          continue;
        }

        const [active] = await tx<{ id: string }[]>`
          SELECT id FROM sales.pipeline WHERE mua_id = ${muaId}::uuid AND status = 'active' LIMIT 1
        `;
        if (active) {
          skipped.push({ muaId, reason: "Active pipeline already exists" });
          continue;
        }

        const assignee =
          body.assignedTo ??
          (auth.session.role === "salesRm" ? auth.session.userId : null);

        if (assignee) {
          const valid = await loadActiveSalesPipelineAssignee(tx, assignee);
          if (!valid) {
            skipped.push({ muaId, reason: "Invalid salesperson" });
            continue;
          }
        }

        const [pipeline] = await tx<{ id: string }[]>`
          INSERT INTO sales.pipeline (mua_id, mua_type, stage, status, assigned_to)
          VALUES (
            ${muaId}::uuid,
            're_engage',
            'Untouched',
            'active',
            ${assignee}::uuid
          )
          RETURNING id
        `;

        const pipelineId = pipeline!.id;

        await tx`
          INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
          VALUES (
            ${pipelineId}::uuid,
            'stageChanged',
            ${`Re-engagement pipeline created${body.preserveSource !== false && mua.source ? ` (source: ${mua.source})` : ""}`},
            ${auth.session.userId}::uuid,
            ${tx.json({ reengagement: true, muaId })}
          )
        `;

        if (assignee) {
          const { createAssignFollowUpTask } = await import("@/lib/sales-pipeline-assign-tasks");
          await createAssignFollowUpTask(tx, {
            pipelineId,
            salesRmId: assignee,
            wasUnassigned: true,
          });
        }

        created.push({ muaId, pipelineId });
      }

      return { created, skipped };
    });

    return NextResponse.json({ data, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Re-engagement failed";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
