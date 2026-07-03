import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import { parseAdminSalesReportFilters } from "@/lib/admin-sales-report-filters";

function callDateFilters(
  f: ReturnType<typeof parseAdminSalesReportFilters>,
  days: number,
) {
  return {
    from: f.dateFrom,
    to: f.dateTo,
    days,
    hasCustomRange: Boolean(f.dateFrom || f.dateTo),
  };
}

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const searchParams = new URL(request.url).searchParams;
  const f = parseAdminSalesReportFilters(searchParams);
  const days = Math.min(90, Math.max(7, Number(searchParams.get("days") ?? "30") || 30));
  const qPattern = f.q ? `%${f.q}%` : null;
  const dates = callDateFilters(f, days);

  const data = await withTransaction(async (tx) => {
    const bySalesperson = await tx`
      SELECT
        s.name AS salesperson,
        COUNT(*)::int AS calls,
        COALESCE(SUM(cl.duration_sec), 0)::int AS "durationSec",
        SUM(
          CASE
            WHEN lower(COALESCE(cl.outcome, '')) IN ('connected', 'answered', 'interested')
            THEN 1
            ELSE 0
          END
        )::int AS "positiveCalls"
      FROM sales.call_logs cl
      JOIN staff s ON s.id = cl.salesperson_id
      WHERE s.active = true
        AND s.role IN ('sales_rm', 'sales_tl')
        AND (${f.unassignedOnly}::boolean IS FALSE)
        AND (${f.assignedTo}::uuid IS NULL OR cl.salesperson_id = ${f.assignedTo}::uuid)
        AND (${f.teamId}::uuid IS NULL OR s.team_id = ${f.teamId}::uuid)
        AND (${dates.from}::date IS NULL OR cl.called_at::date >= ${dates.from}::date)
        AND (${dates.to}::date IS NULL OR cl.called_at::date <= ${dates.to}::date)
        AND (
          ${dates.hasCustomRange}::boolean IS TRUE
          OR cl.called_at >= NOW() - (${dates.days} || ' days')::interval
        )
        AND (
          ${qPattern}::text IS NULL
          OR s.name ILIKE ${qPattern}
        )
      GROUP BY s.name
      ORDER BY calls DESC, s.name
    `;

    const byDay = await tx`
      SELECT
        DATE(cl.called_at) AS day,
        COUNT(*)::int AS calls,
        COALESCE(SUM(cl.duration_sec), 0)::int AS "durationSec"
      FROM sales.call_logs cl
      JOIN staff s ON s.id = cl.salesperson_id
      WHERE s.active = true
        AND s.role IN ('sales_rm', 'sales_tl')
        AND (${f.unassignedOnly}::boolean IS FALSE)
        AND (${f.assignedTo}::uuid IS NULL OR cl.salesperson_id = ${f.assignedTo}::uuid)
        AND (${f.teamId}::uuid IS NULL OR s.team_id = ${f.teamId}::uuid)
        AND (${dates.from}::date IS NULL OR cl.called_at::date >= ${dates.from}::date)
        AND (${dates.to}::date IS NULL OR cl.called_at::date <= ${dates.to}::date)
        AND (
          ${dates.hasCustomRange}::boolean IS TRUE
          OR cl.called_at >= NOW() - (${dates.days} || ' days')::interval
        )
        AND (
          ${qPattern}::text IS NULL
          OR s.name ILIKE ${qPattern}
        )
      GROUP BY DATE(cl.called_at)
      ORDER BY day ASC
    `;

    return [
      ...(bySalesperson as Record<string, unknown>[]).map((r) => ({
        section: "bySalesperson",
        ...r,
      })),
      ...(byDay as Record<string, unknown>[]).map((r) => ({ section: "byDay", ...r })),
    ];
  });

  return NextResponse.json({ data, error: null });
}
