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

  const body = (await request.json().catch(() => ({}))) as {
    pipelineIds?: string[];
    salesRmId?: string;
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

  try {
    const result = await withTransaction(async (tx) => {
      const assignee = await loadActiveSalesPipelineAssignee(tx, body.salesRmId!);
      if (!assignee) throw Object.assign(new Error("Invalid salesperson"), { status: 400 });

      const pipelines = await tx<{ id: string; assignedTo: string | null }[]>`
        SELECT p.id, p.assigned_to AS "assignedTo"
        FROM sales.pipeline p
        JOIN muas m ON m.id = p.mua_id
        WHERE p.id = ANY(${ids}::uuid[])
          AND p.status = 'active'
          AND p.assigned_to IS NULL
          AND p.stage <> 'Rejected'
          AND m.status = 'active'
      `;

      let assigned = 0;
      for (const pipe of pipelines) {
        await adminAssignPipeline(tx, {
          pipelineId: pipe.id,
          salesRmId: body.salesRmId!,
          actorId: auth.session.userId,
          assigneeName: assignee.name,
          wasUnassigned: true,
        });
        assigned += 1;
      }

      return { assigned, requested: ids.length };
    });

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 500;
    const message = error instanceof Error ? error.message : "Bulk assign failed";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
