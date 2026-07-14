import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { adminReassignPipeline } from "@/lib/admin-sales-pipeline-assign";
import { parseAdminReassignStage } from "@/lib/admin-reassign-stages";
import { loadActiveSalesPipelineAssignee } from "@/lib/sales-pipeline-assignee";

export async function POST(request: Request) {
  const auth = await requireRoles(["admin", "salesTl", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    pipelineIds?: string[];
    salesRmId?: string;
    stage?: string;
  };
  const ids = body.pipelineIds ?? [];
  if (!ids.length) {
    return NextResponse.json({ data: null, error: "pipelineIds required" }, { status: 400 });
  }
  if (ids.length > 100) {
    return NextResponse.json({ data: null, error: "Max 100 pipelines per request" }, { status: 400 });
  }
  if (!body.salesRmId) {
    return NextResponse.json({ data: null, error: "salesRmId required" }, { status: 400 });
  }

  const stage = parseAdminReassignStage(body.stage);

  try {
    const result = await withTransaction(async (tx) => {
      const assignee = await loadActiveSalesPipelineAssignee(tx, body.salesRmId!);
      if (!assignee) throw Object.assign(new Error("Invalid salesperson"), { status: 400 });

      const pipelines = await tx<{ id: string; assignedTo: string; stage: string }[]>`
        SELECT id, assigned_to AS "assignedTo", stage
        FROM sales.pipeline
        WHERE id = ANY(${ids}::uuid[])
          AND status = 'active'
          AND assigned_to IS NOT NULL
          AND stage <> 'Rejected'
      `;

      let reassigned = 0;
      for (const pipe of pipelines) {
        await adminReassignPipeline(tx, {
          pipelineId: pipe.id,
          salesRmId: body.salesRmId!,
          actorId: auth.session.userId,
          assigneeName: assignee.name,
          fromStaffId: pipe.assignedTo,
          currentStage: pipe.stage,
          stage,
        });
        reassigned += 1;
      }

      return { reassigned, requested: ids.length };
    });

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 500;
    const message = error instanceof Error ? error.message : "Bulk reassign failed";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
