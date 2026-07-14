import { NextResponse } from "next/server";
import { withTransaction, type TransactionSql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import {
  isScopeError,
  pipelineAssigneeFilter,
  resolveSalesReportScope,
} from "@/lib/sales-report-scope";
import {
  pipelineReportActiveFilter,
  salesReportPendingTaskFilter,
} from "@/lib/sales-reports-queries";

function taskStaffFilter(tx: TransactionSql, userIds: string[]) {
  if (userIds.length === 0) return tx`TRUE`;
  return tx`t.staff_id = ANY(${userIds}::uuid[])`;
}

export async function GET(request: Request) {
  const auth = await requireRoles(["salesRm", "salesTl", "admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const assignee = searchParams.get("assignee");
  const muaTypeRaw = searchParams.get("mua_type");
  const muaType =
    muaTypeRaw && ["candidate", "renewal", "re_engage"].includes(muaTypeRaw) ? muaTypeRaw : null;

  try {
    const data = await withTransaction(async (tx) => {
      const scope = await resolveSalesReportScope(tx, auth.session, assignee);
      if (isScopeError(scope)) {
        throw Object.assign(new Error(scope.error), { status: scope.status });
      }
      const scoped = pipelineAssigneeFilter(tx, scope.userIds);
      const taskScoped = taskStaffFilter(tx, scope.userIds);
      const activePipeline = pipelineReportActiveFilter(tx);
      const pendingTasks = salesReportPendingTaskFilter(tx);
      const muaTypeFilter = muaType ? tx`p.mua_type = ${muaType}` : tx`TRUE`;

      const [priorityTagColumn] = await tx<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'sales' AND table_name = 'pipeline' AND column_name = 'priority_tag'
        ) AS "exists"
      `;
      const priorityTagSelect = priorityTagColumn?.exists
        ? tx`p.priority_tag AS "priorityTag",`
        : tx`NULL::text AS "priorityTag",`;

      const closingSoon = await tx`
        SELECT
          p.id,
          m.name AS "muaName",
          m.city AS "muaCity",
          m.phone AS "muaPhone",
          m.whatsapp AS "muaWhatsapp",
          p.stage,
          p.mua_type AS "muaType",
          ${priorityTagSelect}
          s.name AS "assignedToName",
          DATE_PART('day', NOW() - p.updated_at)::int AS "daysInStage",
          DATE_PART(
            'day',
            NOW() - COALESCE((SELECT MAX(created_at) FROM sales.comms_log cl WHERE cl.pipeline_id = p.id), p.created_at)
          )::int AS "daysSinceLastContact",
          COALESCE(o.quoted_amount, o.avg_revenue_target)::numeric AS "priceOffered",
          lc.outcome AS "lastCallOutcome",
          COALESCE(na.total_repeated_no_answer, 0)::int AS "totalRepeatedNoAnswer"
        FROM sales.pipeline p
        JOIN muas m ON m.id = p.mua_id
        LEFT JOIN staff s ON s.id = p.assigned_to
        LEFT JOIN LATERAL (
          SELECT amount FROM sales.payment_records pr
          WHERE pr.pipeline_id = p.id ORDER BY pr.created_at DESC LIMIT 1
        ) pr ON TRUE
        LEFT JOIN sales.onboarding o ON o.pipeline_id = p.id
        LEFT JOIN LATERAL (
          SELECT cl.outcome FROM sales.call_logs cl
          WHERE cl.pipeline_id = p.id
          ORDER BY cl.called_at DESC NULLS LAST, cl.created_at DESC LIMIT 1
        ) lc ON TRUE
        LEFT JOIN LATERAL (
          SELECT SUM(
            CASE WHEN LOWER(COALESCE(t.outcome, '')) IN ('no_answer', 'missed', 'unanswered') THEN 1 ELSE 0 END
          )::int AS total_repeated_no_answer
          FROM (
            SELECT outcome FROM sales.call_logs cl
            WHERE cl.pipeline_id = p.id
            ORDER BY cl.called_at DESC NULLS LAST, cl.created_at DESC LIMIT 3
          ) t
        ) na ON TRUE
        LEFT JOIN LATERAL (
          SELECT sl.next_touch_point
          FROM sales.stage_log sl
          WHERE sl.pipeline_id = p.id
            AND sl.next_touch_point IS NOT NULL
            AND (
              sl.to_stage = 'Demo Scheduled'
              OR (p.stage = 'Demo Scheduled' AND sl.to_stage IN ('Demo Scheduled', 'Demo Done', 'Details Shared', 'Call Back', 'Follow Up'))
            )
          ORDER BY
            CASE WHEN sl.to_stage = 'Demo Scheduled' THEN 0 ELSE 1 END,
            sl.created_at DESC
          LIMIT 1
        ) demo ON TRUE
        WHERE ${activePipeline}
          AND ${scoped}
          AND ${muaTypeFilter}
          AND (
            p.stage IN ('Confirm', 'Senior Call', 'Senior Call Done', 'Demo Done')
            OR (
              p.stage = 'Demo Scheduled'
              AND demo.next_touch_point IS NOT NULL
              AND demo.next_touch_point::date <= CURRENT_DATE
            )
          )
        ORDER BY
          CASE p.stage
            WHEN 'Demo Scheduled' THEN 0
            WHEN 'Senior Call' THEN 1
            WHEN 'Senior Call Done' THEN 2
            WHEN 'Confirm' THEN 3
            WHEN 'Demo Done' THEN 4
            ELSE 5
          END,
          p.updated_at ASC
      `;

      const leftOut = await tx`
        SELECT
          p.id,
          m.name AS "muaName",
          m.city AS "muaCity",
          m.phone AS "muaPhone",
          m.whatsapp AS "muaWhatsapp",
          p.stage,
          p.mua_type AS "muaType",
          ${priorityTagSelect}
          s.name AS "assignedToName",
          DATE_PART('day', NOW() - p.updated_at)::int AS "daysInStage",
          DATE_PART(
            'day',
            NOW() - COALESCE((SELECT MAX(created_at) FROM sales.comms_log cl WHERE cl.pipeline_id = p.id), p.created_at)
          )::int AS "daysSinceLastContact",
          COALESCE(o.quoted_amount, o.avg_revenue_target)::numeric AS "priceOffered",
          lc.outcome AS "lastCallOutcome",
          COALESCE(na.total_repeated_no_answer, 0)::int AS "totalRepeatedNoAnswer",
          ARRAY_REMOVE(ARRAY[
            CASE WHEN DATE_PART('day', NOW() - p.updated_at) >= 7 THEN 'stale' END,
            CASE WHEN p.stage = 'Untouched' AND DATE_PART('day', NOW() - p.updated_at) >= 3 THEN 'untouched' END,
            CASE WHEN DATE_PART(
              'day',
              NOW() - COALESCE((SELECT MAX(created_at) FROM sales.comms_log cl2 WHERE cl2.pipeline_id = p.id), p.created_at)
            ) >= 3 THEN 'no_contact' END,
            CASE WHEN COALESCE(na.total_repeated_no_answer, 0) >= 3 THEN 'no_answer' END
          ]::text[], NULL) AS reasons
        FROM sales.pipeline p
        JOIN muas m ON m.id = p.mua_id
        LEFT JOIN staff s ON s.id = p.assigned_to
        LEFT JOIN LATERAL (
          SELECT amount FROM sales.payment_records pr
          WHERE pr.pipeline_id = p.id ORDER BY pr.created_at DESC LIMIT 1
        ) pr ON TRUE
        LEFT JOIN sales.onboarding o ON o.pipeline_id = p.id
        LEFT JOIN LATERAL (
          SELECT cl.outcome FROM sales.call_logs cl
          WHERE cl.pipeline_id = p.id
          ORDER BY cl.called_at DESC NULLS LAST, cl.created_at DESC LIMIT 1
        ) lc ON TRUE
        LEFT JOIN LATERAL (
          SELECT SUM(
            CASE WHEN LOWER(COALESCE(t.outcome, '')) IN ('no_answer', 'missed', 'unanswered') THEN 1 ELSE 0 END
          )::int AS total_repeated_no_answer
          FROM (
            SELECT outcome FROM sales.call_logs cl
            WHERE cl.pipeline_id = p.id
            ORDER BY cl.called_at DESC NULLS LAST, cl.created_at DESC LIMIT 3
          ) t
        ) na ON TRUE
        WHERE ${activePipeline}
          AND ${scoped}
          AND ${muaTypeFilter}
          AND (
            DATE_PART('day', NOW() - p.updated_at) >= 7
            OR (p.stage = 'Untouched' AND DATE_PART('day', NOW() - p.updated_at) >= 3)
            OR DATE_PART(
              'day',
              NOW() - COALESCE((SELECT MAX(created_at) FROM sales.comms_log cl3 WHERE cl3.pipeline_id = p.id), p.created_at)
            ) >= 3
            OR COALESCE(na.total_repeated_no_answer, 0) >= 3
          )
          AND p.stage NOT IN ('Confirm', 'Senior Call', 'Senior Call Done', 'Demo Done', 'Demo Scheduled')
        ORDER BY
          CASE
            WHEN COALESCE(na.total_repeated_no_answer, 0) >= 3 THEN 1
            WHEN DATE_PART('day', NOW() - p.updated_at) >= 7 THEN 2
            WHEN p.stage = 'Untouched' THEN 3
            ELSE 4
          END,
          p.updated_at ASC
      `;

      const [taskStats] = await tx<{ todayTasks: number; overdueTasks: number }[]>`
        SELECT
          COUNT(*) FILTER (WHERE t.due_date = CURRENT_DATE)::int AS "todayTasks",
          COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE)::int AS "overdueTasks"
        FROM rm_tasks t
        WHERE t.status = 'pending'
          AND ${pendingTasks}
          AND ${taskScoped}
      `;

      const dueTodayTasks = await tx`
        SELECT
          t.id,
          t.title,
          t.task_type AS "taskType",
          t.due_date AS "dueDate",
          s.name AS "staffName",
          FALSE AS "overdue"
        FROM rm_tasks t
        JOIN staff s ON s.id = t.staff_id
        WHERE t.status = 'pending'
          AND ${pendingTasks}
          AND t.due_date = CURRENT_DATE
          AND ${taskScoped}
        ORDER BY t.created_at ASC
      `;

      const overdueTasks = await tx`
        SELECT
          t.id,
          t.title,
          t.task_type AS "taskType",
          t.due_date AS "dueDate",
          s.name AS "staffName",
          (CURRENT_DATE - t.due_date)::int AS "daysOverdue",
          TRUE AS "overdue"
        FROM rm_tasks t
        JOIN staff s ON s.id = t.staff_id
        WHERE t.status = 'pending'
          AND ${pendingTasks}
          AND t.due_date < CURRENT_DATE
          AND ${taskScoped}
        ORDER BY t.due_date ASC
      `;

      return {
        scopeLabel: scope.label,
        counts: {
          closingSoon: closingSoon.length,
          leftOut: leftOut.length,
          todayTasks: taskStats?.todayTasks ?? 0,
          overdueTasks: taskStats?.overdueTasks ?? 0,
        },
        closingSoon,
        leftOut,
        dueTodayTasks,
        overdueTasks,
      };
    });

    return NextResponse.json({ data, error: null });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 500;
    const message = error instanceof Error ? error.message : "Failed to load priorities";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
