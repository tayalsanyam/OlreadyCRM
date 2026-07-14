import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";

import { parseAdminSalesReportFilters } from "@/lib/admin-sales-report-filters";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  const f = parseAdminSalesReportFilters(new URL(request.url).searchParams);

  const rows = await withTransaction(async (tx) => tx`
    SELECT COALESCE(m.source, 'Unknown') AS source,
           COUNT(*)::int AS total,
           SUM(CASE WHEN p.stage IN ('Confirm','Deal Closed') THEN 1 ELSE 0 END)::int AS confirm_or_closed,
           SUM(CASE WHEN p.stage IN ('Onboarding', 'Deal Closed') THEN 1 ELSE 0 END)::int AS deal_closed,
           COALESCE(AVG(pr.amount),0)::numeric(12,2) AS "avgDealValue"
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    LEFT JOIN sales.payment_records pr ON pr.pipeline_id = p.id
    WHERE (${f.stage}::text IS NULL OR p.stage = ${f.stage})
      AND (${f.muaType}::text IS NULL OR p.mua_type = ${f.muaType})
      AND (${f.source}::text IS NULL OR m.source = ${f.source})
      AND (${f.city}::text IS NULL OR m.city = ${f.city})
      AND (${f.unassignedOnly}::boolean IS FALSE OR p.assigned_to IS NULL)
      AND (
        ${f.assignedOnly}::boolean IS FALSE
        OR EXISTS (
          SELECT 1 FROM staff _asf
          WHERE _asf.id = p.assigned_to
            AND _asf.role IN ('sales_rm', 'sales_tl')
        )
      )
      AND (${f.assignedTo}::text IS NULL OR p.assigned_to = ${f.assignedTo}::uuid)
      AND (${f.teamId}::text IS NULL OR m.team_id = ${f.teamId}::uuid)
      AND (${f.dateFrom}::date IS NULL OR p.updated_at::date >= ${f.dateFrom}::date)
      AND (${f.dateTo}::date IS NULL OR p.updated_at::date <= ${f.dateTo}::date)
    GROUP BY COALESCE(m.source, 'Unknown')
    ORDER BY total DESC
  `);

  return NextResponse.json({ data: rows, error: null });
}
