import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import { parseAdminSalesReportFilters } from "@/lib/admin-sales-report-filters";
import { PIPELINE_STAGE_ORDER } from "@/lib/types";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  const f = parseAdminSalesReportFilters(new URL(request.url).searchParams);

  const counts = await withTransaction(async (tx) => tx<{ stage: string; total: number }[]>`
    SELECT p.stage, COUNT(*)::int AS total
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    WHERE p.status = 'active'
      AND p.stage NOT IN ('Rejected', 'Deal Closed', 'Onboarding', 'Part Payment')
      AND (${f.stage}::text IS NULL OR p.stage = ${f.stage})
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
    GROUP BY p.stage
  `);

  const map = new Map<string, number>(counts.map((r: { stage: string; total: number }) => [r.stage, r.total]));
  const base = map.get("Untouched") ?? 0;
  const data = PIPELINE_STAGE_ORDER.map((stage) => {
    const total = map.get(stage) ?? 0;
    const conversionPct = base > 0 ? Number(((total / base) * 100).toFixed(2)) : 0;
    return { stage, total, conversionPct };
  });

  return NextResponse.json({ data, error: null });
}
