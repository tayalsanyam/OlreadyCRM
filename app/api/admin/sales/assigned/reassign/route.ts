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
    pipelineId?: string;
    salesRmId?: string;
    stage?: string;
  };
  if (!body.pipelineId || !body.salesRmId) {
    return NextResponse.json({ data: null, error: "pipelineId and salesRmId are required" }, { status: 400 });
  }

  const stage = parseAdminReassignStage(body.stage);

  try {
    await withTransaction(async (tx) => {
      const assignee = await loadActiveSalesPipelineAssignee(tx, body.salesRmId!);
      if (!assignee) throw Object.assign(new Error("Invalid salesperson"), { status: 400 });

      const [pipe] = await tx<{ id: string; assignedTo: string; stage: string }[]>`
        SELECT id, assigned_to AS "assignedTo", stage
        FROM sales.pipeline
        WHERE id = ${body.pipelineId}::uuid
          AND assigned_to IS NOT NULL
          AND status = 'active'
          AND stage <> 'Rejected'
      `;
      if (!pipe) {
        throw Object.assign(new Error("Pipeline not found or not assigned"), { status: 404 });
      }

      await adminReassignPipeline(tx, {
        pipelineId: body.pipelineId!,
        salesRmId: body.salesRmId!,
        actorId: auth.session.userId,
        assigneeName: assignee.name,
        fromStaffId: pipe.assignedTo,
        currentStage: pipe.stage,
        stage,
      });
    });

    return NextResponse.json({ data: { ok: true }, error: null });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 500;
    const message = error instanceof Error ? error.message : "Reassign failed";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
