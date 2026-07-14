import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import {
  CALL_REPORT_ROLES,
  callStaffFilter,
  isCallyzerScopeError,
  listCallyzerReportAssignees,
  resolveCallStaffUserIds,
  resolveCallyzerReportScope,
} from "@/lib/callyzer-report-scope";

export async function GET(request: Request) {
  const auth = await requireRoles(CALL_REPORT_ROLES);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const fromRaw = searchParams.get("date_from");
  const toRaw = searchParams.get("date_to");
  const from = fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : null;
  const to = toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? toRaw : null;
  const assignee = searchParams.get("assignee");

  try {
    const data = await withTransaction(async (tx) => {
      const scope = await resolveCallyzerReportScope(tx, auth.session, assignee);
      if (isCallyzerScopeError(scope)) {
        throw Object.assign(new Error(scope.error), { status: scope.status });
      }
      const creditUserIds = await resolveCallStaffUserIds(tx, scope.userIds);
      const scoped = callStaffFilter(tx, creditUserIds);

      const rows = await tx`
        SELECT cl.called_at::date AS day,
               COUNT(*)::int AS calls,
               COALESCE(SUM(cl.duration_sec), 0)::int AS "durationSec",
               COUNT(*) FILTER (WHERE cl.contact_type = 'lead')::int AS "leadCalls",
               COUNT(*) FILTER (WHERE cl.contact_type = 'mua')::int AS "muaCalls",
               COUNT(DISTINCT cl.lead_id) FILTER (WHERE cl.lead_id IS NOT NULL)::int AS "uniqueLeads",
               COUNT(DISTINCT cl.mua_id) FILTER (WHERE cl.mua_id IS NOT NULL)::int AS "uniqueMuas"
        FROM call_logs cl
        WHERE ${scoped}
          AND (${from}::date IS NULL OR cl.called_at::date >= ${from}::date)
          AND (${to}::date IS NULL OR cl.called_at::date <= ${to}::date)
        GROUP BY cl.called_at::date
        ORDER BY cl.called_at::date DESC
      `;

      const [totals] = await tx<
        {
          totalCalls: number;
          totalDurationSec: number;
          leadCalls: number;
          muaCalls: number;
          uniqueLeads: number;
          uniqueMuas: number;
        }[]
      >`
        SELECT
          COUNT(*)::int AS "totalCalls",
          COALESCE(SUM(cl.duration_sec), 0)::int AS "totalDurationSec",
          COUNT(*) FILTER (WHERE cl.contact_type = 'lead')::int AS "leadCalls",
          COUNT(*) FILTER (WHERE cl.contact_type = 'mua')::int AS "muaCalls",
          COUNT(DISTINCT cl.lead_id) FILTER (WHERE cl.lead_id IS NOT NULL)::int AS "uniqueLeads",
          COUNT(DISTINCT cl.mua_id) FILTER (WHERE cl.mua_id IS NOT NULL)::int AS "uniqueMuas"
        FROM call_logs cl
        WHERE ${scoped}
          AND (${from}::date IS NULL OR cl.called_at::date >= ${from}::date)
          AND (${to}::date IS NULL OR cl.called_at::date <= ${to}::date)
      `;

      return { rows, totals: totals ?? null, scopeLabel: scope.label };
    });

    return NextResponse.json({ data, error: null });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error
        ? Number((error as { status: number }).status)
        : 500;
    const message = error instanceof Error ? error.message : "Failed to load call activity";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
