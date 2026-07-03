import type { TransactionSql } from "@/db/index";

/** Pending sales CRM tasks shown in report work-queue stats/lists. */
export function salesReportPendingTaskFilter(tx: TransactionSql) {
  return tx`t.task_type::text IN (
    'sales_follow_up',
    'sales_senior_call',
    'sales_onboarding',
    'sales_activation'
  )`;
}

/** Active pipeline rows for summary/funnel counts (excludes rejected). */
export function pipelineReportActiveFilter(tx: TransactionSql) {
  return tx`p.status = 'active' AND p.stage <> 'Rejected'`;
}

/** Best-effort closed date: first Onboarding/Deal Closed stage log, else first payment, else updated_at. */
export const PIPELINE_CLOSED_AT_SQL = `COALESCE(
  (
    SELECT MIN(sl.created_at)
    FROM sales.stage_log sl
    WHERE sl.pipeline_id = p.id
      AND sl.to_stage IN ('Onboarding', 'Deal Closed')
  ),
  (
    SELECT MIN(pr.payment_date)::timestamptz
    FROM sales.payment_records pr
    WHERE pr.pipeline_id = p.id
  ),
  p.updated_at
)`;
