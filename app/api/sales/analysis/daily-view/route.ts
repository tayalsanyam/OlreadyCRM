import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import { resolveTlTeamMemberIds } from "@/lib/sales-report-scope";

function monthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  const auth = await requireRoles(["salesTl", "admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const month = monthKey();
  const data = await withTransaction(async (tx) => {
    let staffScope = tx`s.role IN ('sales_rm', 'sales_tl') AND s.active = true`;
    let pipelineScope = tx`TRUE`;
    let taskScope = tx`TRUE`;

    if (auth.session.role === "salesTl") {
      const memberIds = await resolveTlTeamMemberIds(tx, auth.session.userId);
      staffScope = tx`s.id = ANY(${memberIds}::uuid[])`;
      pipelineScope = tx`p.assigned_to = ANY(${memberIds}::uuid[])`;
      taskScope = tx`t.staff_id = ANY(${memberIds}::uuid[])`;
    }

    const teamActivity = await tx`
      SELECT
        s.id,
        s.name,
        COALESCE(c.calls_today, 0)::int AS "callsToday",
        COALESCE(c.talk_time_today_sec, 0)::int AS "talkTimeTodaySec",
        COALESCE(sl.stage_moves_today, 0)::int AS "stageMovesToday",
        COALESCE(td.tasks_done_today, 0)::int AS "tasksDoneToday",
        COALESCE(st.min_calls_per_day, 0)::int AS "minCallsPerDay"
      FROM staff s
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS calls_today,
          COALESCE(SUM(cl.duration_sec), 0)::int AS talk_time_today_sec
        FROM sales.call_logs cl
        WHERE cl.salesperson_id = s.id
          AND cl.called_at::date = CURRENT_DATE
      ) c ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS stage_moves_today
        FROM sales.stage_log l
        WHERE l.changed_by = s.id
          AND l.created_at::date = CURRENT_DATE
      ) sl ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS tasks_done_today
        FROM rm_tasks t
        WHERE t.staff_id = s.id
          AND t.status = 'done'
          AND t.updated_at::date = CURRENT_DATE
      ) td ON TRUE
      LEFT JOIN sales.targets st ON st.user_id = s.id AND st.month = ${month}
      WHERE ${staffScope}
      ORDER BY s.name
    `;

    const stuckPipeline = await tx`
      SELECT
        p.id,
        m.name AS "muaName",
        p.stage,
        DATE_PART('day', NOW() - p.updated_at)::int AS "daysStuck",
        s.name AS "assignedToName",
        p.assigned_to AS "assignedToId"
      FROM sales.pipeline p
      JOIN muas m ON m.id = p.mua_id
      LEFT JOIN staff s ON s.id = p.assigned_to
      WHERE p.status = 'active'
        AND DATE_PART('day', NOW() - p.updated_at) >= 5
        AND ${pipelineScope}
      ORDER BY "daysStuck" DESC, m.name
      LIMIT 200
    `;

    const overdueTasks = await tx`
      SELECT
        t.id,
        t.title,
        t.task_type AS "taskType",
        t.due_date AS "dueDate",
        (CURRENT_DATE - t.due_date)::int AS "daysOverdue",
        s.name AS "staffName",
        t.staff_id AS "staffId"
      FROM rm_tasks t
      JOIN staff s ON s.id = t.staff_id
      WHERE t.status = 'pending'
        AND t.task_type::text IN ('sales_follow_up','sales_senior_call')
        AND t.due_date < CURRENT_DATE
        AND ${taskScope}
      ORDER BY t.due_date ASC
      LIMIT 300
    `;

    const closingSoon = await tx`
      SELECT
        p.id,
        m.name AS "muaName",
        m.city AS "muaCity",
        p.stage,
        p.mua_type AS "muaType",
        s.name AS "assignedToName",
        p.assigned_to AS "assignedToId",
        DATE_PART('day', NOW() - p.updated_at)::int AS "daysInStage",
        COALESCE(o.quoted_amount, o.avg_revenue_target)::numeric AS "priceOffered"
      FROM sales.pipeline p
      JOIN muas m ON m.id = p.mua_id
      LEFT JOIN staff s ON s.id = p.assigned_to
      LEFT JOIN LATERAL (
        SELECT amount FROM sales.payment_records pr
        WHERE pr.pipeline_id = p.id ORDER BY pr.created_at DESC LIMIT 1
      ) pr ON TRUE
      LEFT JOIN sales.onboarding o ON o.pipeline_id = p.id
      WHERE p.status = 'active'
        AND p.stage IN ('Confirm', 'Senior Call', 'Senior Call Done', 'Demo Done')
        AND ${pipelineScope}
      ORDER BY
        CASE p.stage WHEN 'Senior Call' THEN 1 WHEN 'Senior Call Done' THEN 2 WHEN 'Confirm' THEN 3 WHEN 'Demo Done' THEN 4 ELSE 5 END,
        p.updated_at ASC
      LIMIT 60
    `;

    const needsAction = (teamActivity as Array<{ callsToday?: number; minCallsPerDay?: number }>).filter(
      (r) => {
        const calls = Number(r.callsToday ?? 0);
        const min = Number(r.minCallsPerDay ?? 0);
        return calls === 0 || (min > 0 && calls < min);
      },
    ).length;

    return {
      teamActivity,
      stuckPipeline,
      overdueTasks,
      closingSoon,
      counts: {
        needsAction,
        stuck: stuckPipeline.length,
        overdueTasks: overdueTasks.length,
        closingSoon: closingSoon.length,
      },
    };
  });

  return NextResponse.json({ data, error: null });
}
