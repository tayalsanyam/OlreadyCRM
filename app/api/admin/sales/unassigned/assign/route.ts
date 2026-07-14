import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { adminAssignPipeline } from "@/lib/admin-sales-pipeline-assign";
import { loadActiveSalesPipelineAssignee } from "@/lib/sales-pipeline-assignee";

export async function POST(request: Request) {
  const auth = await requireRoles(["admin", "salesTl", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as { pipelineId?: string; salesRmId?: string };
  if (!body.pipelineId || !body.salesRmId) {
    return NextResponse.json({ data: null, error: "pipelineId and salesRmId are required" }, { status: 400 });
  }

  try {
    await withTransaction(async (tx) => {
      const assignee = await loadActiveSalesPipelineAssignee(tx, body.salesRmId!);
      if (!assignee) throw Object.assign(new Error("Invalid salesperson"), { status: 400 });

      const [pipe] = await tx<{ id: string }[]>`
        SELECT p.id
        FROM sales.pipeline p
        JOIN muas m ON m.id = p.mua_id
        WHERE p.id = ${body.pipelineId}::uuid
          AND p.assigned_to IS NULL
          AND p.status = 'active'
          AND p.stage <> 'Rejected'
          AND m.status = 'active'
      `;
      if (!pipe) throw Object.assign(new Error("Pipeline not found or already assigned"), { status: 404 });

      await adminAssignPipeline(tx, {
        pipelineId: body.pipelineId!,
        salesRmId: body.salesRmId!,
        actorId: auth.session.userId,
        assigneeName: assignee.name,
        wasUnassigned: true,
      });
    });

    return NextResponse.json({ data: { ok: true }, error: null });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 500;
    const message = error instanceof Error ? error.message : "Assign failed";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
