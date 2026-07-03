import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import { resolveTlTeamMemberIds } from "@/lib/sales-report-scope";

function monthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const auth = await requireRoles(["salesTl", "admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  const { searchParams } = new URL(request.url);
  const fromRaw = searchParams.get("date_from");
  const toRaw = searchParams.get("date_to");
  const monthRaw = searchParams.get("month");
  const month = monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : monthKey();
  const from = fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : null;
  const to = toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? toRaw : null;

  const rows = await withTransaction(async (tx) => {
    let userScope = tx`s.role IN ('sales_rm', 'sales_tl')`;
    if (auth.session.role === "salesTl") {
      const memberIds = await resolveTlTeamMemberIds(tx, auth.session.userId);
      userScope = tx`s.id = ANY(${memberIds}::uuid[])`;
    }
    return tx`
      SELECT s.id, s.name,
             COUNT(p.id)::int AS "pipelineCount",
             SUM(CASE WHEN p.stage IN ('Onboarding', 'Deal Closed') THEN 1 ELSE 0 END)::int AS "dealsClosed",
             COALESCE(calls.calls_7d, 0)::int AS "callsThisWeek",
             COALESCE(calls.avg_calls_per_day, 0)::numeric(10,2) AS "avgCallsPerDay",
             COALESCE(calls.avg_talk_time_min_per_day, 0)::numeric(10,2) AS "avgTalkTimeMinPerDay",
             COALESCE(st.min_calls_per_day, 0)::int AS "minCallsPerDay",
             COALESCE(st.min_talk_time_min_per_day, 0)::int AS "minTalkTimeMinPerDay",
             COALESCE(st.target_potential_sold, 0)::int AS "targetPotentialSold",
             COALESCE(st.target_existing_sold, 0)::int AS "targetExistingSold",
             (COALESCE(st.target_potential_sold, 0) + COALESCE(st.target_existing_sold, 0))::int AS "targetSoldTotal",
             COALESCE(st.target_revenue, 0)::numeric AS "targetRevenue",
             COALESCE(ot.overdue_tasks, 0)::int AS "overdueTasks",
             COALESCE(closed.month_closed, 0)::int AS "dealsClosedMonth"
      FROM staff s
      LEFT JOIN sales.pipeline p
        ON p.assigned_to = s.id
       AND p.status = 'active'
       AND (${from}::date IS NULL OR p.updated_at::date >= ${from}::date)
       AND (${to}::date IS NULL OR p.updated_at::date <= ${to}::date)
      LEFT JOIN sales.targets st ON st.user_id = s.id AND st.month = ${month}
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS calls_7d,
          ROUND((COUNT(*)::numeric / 7.0), 2) AS avg_calls_per_day,
          ROUND((COALESCE(SUM(cl.duration_sec), 0)::numeric / 60.0) / 7.0, 2) AS avg_talk_time_min_per_day
        FROM sales.call_logs cl
        WHERE cl.salesperson_id = s.id
          AND cl.called_at::date >= CURRENT_DATE - INTERVAL '6 day'
      ) calls ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS overdue_tasks
        FROM rm_tasks t
        WHERE t.staff_id = s.id
          AND t.status = 'pending'
          AND t.task_type::text IN ('sales_follow_up', 'sales_senior_call')
          AND t.due_date < CURRENT_DATE
      ) ot ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS month_closed
        FROM sales.pipeline cp
        WHERE cp.sales_closed_by = s.id
          AND cp.stage IN ('Onboarding', 'Deal Closed')
          AND to_char(cp.updated_at, 'YYYY-MM') = ${month}
      ) closed ON TRUE
      WHERE ${userScope}
      GROUP BY s.id, s.name, calls.calls_7d, calls.avg_calls_per_day, calls.avg_talk_time_min_per_day,
        st.min_calls_per_day, st.min_talk_time_min_per_day, st.target_potential_sold, st.target_existing_sold,
        st.target_revenue, ot.overdue_tasks, closed.month_closed
      ORDER BY ot.overdue_tasks DESC, "dealsClosed" DESC, "pipelineCount" DESC
    `;
  });

  return NextResponse.json({ data: rows, error: null });
}
