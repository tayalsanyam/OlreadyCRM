import { sql, withTransaction } from "@/db/index";
import { syncActivationContractReminders } from "@/lib/sales-activation-contract-reminder";
import { syncActivationSendBackFollowUps } from "@/lib/sales-activation-send-back-reminder";
import {
  defaultOverviewDateRange,
  type OverviewDateRange,
} from "@/lib/admin-overview-date-range";

export type ActivationPendingRow = {
  id: string;
  muaName: string;
  muaCity: string;
  assignedSalesName: string | null;
  daysPending: number;
  profileLinkVerified: boolean;
  invoiceGenerated: boolean;
  contractGenerated: boolean;
  hasContract: boolean;
};

export type ActivationStaffRow = {
  staffId: string;
  name: string;
  activatedMtd: number;
  openTasks: number;
  overdueTasks: number;
  callsMtd: number;
  talkMinutesMtd: number;
};

export type AdminActivationOverview = {
  dateRange: OverviewDateRange;
  summary: {
    pendingActivation: number;
    sentBack: number;
    activatedMtd: number;
    revenueMtd: number;
    avgDaysPending: number;
    pendingOver7Days: number;
    pendingOver14Days: number;
    overdueTasks: number;
    atInvoiceStep: number;
    atContractStep: number;
  };
  pending: ActivationPendingRow[];
  staff: ActivationStaffRow[];
};

export async function fetchAdminActivationOverview(
  range: OverviewDateRange = defaultOverviewDateRange(),
): Promise<AdminActivationOverview> {
  const { dateFrom, dateTo } = range;

  return withTransaction(async (tx) => {
    await syncActivationContractReminders(tx);
    await syncActivationSendBackFollowUps(tx);

    const [summary] = await tx<
      {
        pendingActivation: number;
        sentBack: number;
        activatedMtd: number;
        revenueMtd: string;
        avgDaysPending: number | null;
        pendingOver7Days: number;
        pendingOver14Days: number;
        overdueTasks: number;
        atInvoiceStep: number;
        atContractStep: number;
      }[]
    >`
      SELECT
        (
          SELECT COUNT(*)::int
          FROM sales.activation_log al
          JOIN sales.training tr ON tr.pipeline_id = al.pipeline_id AND tr.complete = true
          WHERE al.activated_at IS NULL AND al.sent_back_at IS NULL
        ) AS pending_activation,
        (
          SELECT COUNT(*)::int
          FROM sales.activation_log al
          JOIN sales.training tr ON tr.pipeline_id = al.pipeline_id
          WHERE al.sent_back_at IS NOT NULL
            AND al.activated_at IS NULL
            AND tr.complete = false
        ) AS sent_back,
        (
          SELECT COUNT(*)::int
          FROM sales.activation_log al
          WHERE al.activated_at::date >= ${dateFrom}::date
            AND al.activated_at::date <= ${dateTo}::date
        ) AS activated_mtd,
        (
          SELECT COALESCE(SUM(o.quoted_amount), 0)::numeric(14,2)
          FROM sales.activation_log al
          JOIN sales.onboarding o ON o.pipeline_id = al.pipeline_id
          WHERE al.activated_at::date >= ${dateFrom}::date
            AND al.activated_at::date <= ${dateTo}::date
        ) AS revenue_mtd,
        (
          SELECT ROUND(AVG(DATE_PART('day', NOW() - tr.updated_at))::numeric, 1)::float
          FROM sales.activation_log al
          JOIN sales.training tr ON tr.pipeline_id = al.pipeline_id AND tr.complete = true
          WHERE al.activated_at IS NULL AND al.sent_back_at IS NULL
        ) AS avg_days_pending,
        (
          SELECT COUNT(*)::int
          FROM sales.activation_log al
          JOIN sales.training tr ON tr.pipeline_id = al.pipeline_id AND tr.complete = true
          WHERE al.activated_at IS NULL
            AND al.sent_back_at IS NULL
            AND DATE_PART('day', NOW() - tr.updated_at) >= 7
        ) AS pending_over_7_days,
        (
          SELECT COUNT(*)::int
          FROM sales.activation_log al
          JOIN sales.training tr ON tr.pipeline_id = al.pipeline_id AND tr.complete = true
          WHERE al.activated_at IS NULL
            AND al.sent_back_at IS NULL
            AND DATE_PART('day', NOW() - tr.updated_at) >= 14
        ) AS pending_over_14_days,
        (
          SELECT COUNT(*)::int
          FROM rm_tasks t
          JOIN staff s ON s.id = t.staff_id AND s.role = 'sales_activation'::user_role
          WHERE t.status = 'pending'
            AND t.task_type = 'sales_activation'
            AND t.due_date < CURRENT_DATE
        ) AS overdue_tasks,
        (
          SELECT COUNT(*)::int
          FROM sales.activation_log al
          JOIN sales.training tr ON tr.pipeline_id = al.pipeline_id AND tr.complete = true
          WHERE al.activated_at IS NULL
            AND al.sent_back_at IS NULL
            AND COALESCE(al.profile_link_verified, false) = true
            AND COALESCE(al.invoice_generated, false) = false
        ) AS at_invoice_step,
        (
          SELECT COUNT(*)::int
          FROM sales.activation_log al
          JOIN sales.training tr ON tr.pipeline_id = al.pipeline_id AND tr.complete = true
          WHERE al.activated_at IS NULL
            AND al.sent_back_at IS NULL
            AND COALESCE(al.invoice_generated, false) = true
            AND COALESCE(al.contract_generated, false) = false
        ) AS at_contract_step
    `;

    const pending = await tx<ActivationPendingRow[]>`
      SELECT
        p.id,
        m.name AS "muaName",
        m.city AS "muaCity",
        assignee.name AS "assignedSalesName",
        DATE_PART('day', NOW() - tr.updated_at)::int AS "daysPending",
        COALESCE(al.profile_link_verified, false) AS "profileLinkVerified",
        COALESCE(al.invoice_generated, false) AS "invoiceGenerated",
        COALESCE(al.contract_generated, false) AS "contractGenerated",
        COALESCE(BTRIM(al.contract_url) <> '', false) AS "hasContract"
      FROM sales.pipeline p
      JOIN muas m ON m.id = p.mua_id
      JOIN sales.training tr ON tr.pipeline_id = p.id AND tr.complete = true
      LEFT JOIN sales.activation_log al ON al.pipeline_id = p.id
      LEFT JOIN staff assignee ON assignee.id = p.assigned_to
      WHERE al.activated_at IS NULL
        AND al.sent_back_at IS NULL
      ORDER BY tr.updated_at ASC
      LIMIT 50
    `;

    const staff = await tx<ActivationStaffRow[]>`
      SELECT
        s.id AS "staffId",
        s.name,
        (
          SELECT COUNT(*)::int
          FROM sales.activation_log al
          WHERE al.activated_by = s.id
            AND al.activated_at::date >= ${dateFrom}::date
            AND al.activated_at::date <= ${dateTo}::date
        ) AS "activatedMtd",
        (
          SELECT COUNT(*)::int
          FROM rm_tasks t
          WHERE t.staff_id = s.id
            AND t.status = 'pending'
            AND t.task_type = 'sales_activation'
        ) AS "openTasks",
        (
          SELECT COUNT(*)::int
          FROM rm_tasks t
          WHERE t.staff_id = s.id
            AND t.status = 'pending'
            AND t.task_type = 'sales_activation'
            AND t.due_date < CURRENT_DATE
        ) AS "overdueTasks",
        (
          SELECT COUNT(*)::int
          FROM sales.call_logs cl
          WHERE cl.salesperson_id = s.id
            AND cl.called_at::date >= ${dateFrom}::date
            AND cl.called_at::date <= ${dateTo}::date
        ) AS "callsMtd",
        (
          SELECT ROUND(COALESCE(SUM(cl.duration_sec), 0) / 60.0)::int
          FROM sales.call_logs cl
          WHERE cl.salesperson_id = s.id
            AND cl.called_at::date >= ${dateFrom}::date
            AND cl.called_at::date <= ${dateTo}::date
        ) AS "talkMinutesMtd"
      FROM staff s
      WHERE s.role = 'sales_activation'::user_role
        AND s.active = true
      ORDER BY s.name
    `;

    return {
      dateRange: range,
      summary: {
        pendingActivation: summary?.pendingActivation ?? 0,
        sentBack: summary?.sentBack ?? 0,
        activatedMtd: summary?.activatedMtd ?? 0,
        revenueMtd: Number(summary?.revenueMtd ?? 0),
        avgDaysPending: Math.round(summary?.avgDaysPending ?? 0),
        pendingOver7Days: summary?.pendingOver7Days ?? 0,
        pendingOver14Days: summary?.pendingOver14Days ?? 0,
        overdueTasks: summary?.overdueTasks ?? 0,
        atInvoiceStep: summary?.atInvoiceStep ?? 0,
        atContractStep: summary?.atContractStep ?? 0,
      },
      pending,
      staff,
    };
  });
}
