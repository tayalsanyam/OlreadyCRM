import type postgres from "postgres";

export type Sql = postgres.Sql<Record<string, unknown>>;

export type ClearRmDataResult = {
  brideLeads: number;
  muas: number;
  bookings: number;
  tasks: number;
};

/** Remove sales CRM rows (pipelines, onboarding, etc.). Keeps sales.teams. */
export async function clearSalesTransactionalData(sql: Sql): Promise<void> {
  await sql`DELETE FROM sales.comms_log`;
  await sql`DELETE FROM sales.call_logs`;
  await sql`DELETE FROM sales.stage_log`;
  await sql`DELETE FROM sales.assignment_log`;
  await sql`DELETE FROM sales.payment_records`;
  await sql`DELETE FROM sales.onboarding`;
  await sql`DELETE FROM sales.training`;
  await sql`DELETE FROM sales.activation_log`;
  await sql`DELETE FROM sales.renewal_attempt`;
  await sql`DELETE FROM sales.pipeline_junk`;
  await sql`DELETE FROM sales.pipeline`;
  await sql`DELETE FROM sales.targets`;
  await sql`UPDATE staff SET team_id = NULL WHERE team_id IS NOT NULL`;
  await sql`DELETE FROM sales.teams`;
  await sql`UPDATE muas SET team_id = NULL, sales_closed_by = NULL WHERE team_id IS NOT NULL OR sales_closed_by IS NOT NULL`;
}

/**
 * Remove all transactional CRM data. Keeps staff, plan_tiers, sla_config, city_regions.
 */
export async function clearRmTransactionalData(
  sql: Sql
): Promise<ClearRmDataResult> {
  await clearSalesTransactionalData(sql);
  await sql`DELETE FROM call_logs`;
  const [bookingsBefore] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM bookings
  `;

  await sql`DELETE FROM feedback_referrals`;
  await sql`DELETE FROM mua_prospects`;
  await sql`DELETE FROM rm_tasks`;
  await sql`DELETE FROM notifications`;
  await sql`DELETE FROM lead_feedback`;
  await sql`DELETE FROM bookings`;
  await sql`DELETE FROM mua_push_event_prices`;
  await sql`DELETE FROM mua_pushes`;
  await sql`DELETE FROM comms`;
  await sql`DELETE FROM lead_events`;
  await sql`DELETE FROM bride_leads`;
  await sql`DELETE FROM mua_plan_history`;
  await sql`DELETE FROM mua_regions`;
  await sql`DELETE FROM muas`;
  await sql`DELETE FROM rm_targets`;
  await sql`DELETE FROM custom_report_templates`;
  await sql`DELETE FROM audit_log`;

  const [leads, muas, tasks] = await sql<
    { leads: number; muas: number; tasks: number }[]
  >`
    SELECT
      (SELECT COUNT(*)::int FROM bride_leads) AS leads,
      (SELECT COUNT(*)::int FROM muas) AS muas,
      (SELECT COUNT(*)::int FROM rm_tasks) AS tasks
  `;

  return {
    brideLeads: leads?.leads ?? 0,
    muas: muas?.muas ?? 0,
    bookings: bookingsBefore?.n ?? 0,
    tasks: tasks?.tasks ?? 0,
  };
}
