import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import { parseAdminSalesReportFilters } from "@/lib/admin-sales-report-filters";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const f = parseAdminSalesReportFilters(new URL(request.url).searchParams);
  const qPattern = f.q ? `%${f.q}%` : null;

  const rows = await withTransaction(async (tx) => tx`
    SELECT
      p.id AS "pipelineId",
      m.name AS "muaName",
      m.city AS "muaCity",
      s.name AS "assignedSales",
      t.updated_at AS "trainingUpdatedAt",
      DATE_PART('day', NOW() - t.updated_at)::int AS "daysPendingActivation",
      al.invoice_generated AS "invoiceGenerated",
      al.contract_generated AS "contractGenerated",
      al.activated_at AS "activatedAt"
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    JOIN sales.training t ON t.pipeline_id = p.id AND t.complete = true
    LEFT JOIN sales.activation_log al ON al.pipeline_id = p.id
    LEFT JOIN staff s ON s.id = p.assigned_to
    WHERE al.activated_at IS NULL
      AND (${f.city}::text IS NULL OR m.city = ${f.city})
      AND (${f.source}::text IS NULL OR m.source = ${f.source})
      AND (${f.assignedTo}::uuid IS NULL OR p.assigned_to = ${f.assignedTo}::uuid)
      AND (${f.teamId}::uuid IS NULL OR m.team_id = ${f.teamId}::uuid)
      AND (
        ${qPattern}::text IS NULL
        OR m.name ILIKE ${qPattern}
        OR m.city ILIKE ${qPattern}
        OR s.name ILIKE ${qPattern}
      )
    ORDER BY "daysPendingActivation" DESC, t.updated_at ASC
  `);

  return NextResponse.json({ data: rows, error: null });
}
