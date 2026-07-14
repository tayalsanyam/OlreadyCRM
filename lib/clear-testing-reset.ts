import type postgres from "postgres";

export type Sql = postgres.Sql<Record<string, unknown>>;

export type ClearTestingResetResult = {
  staffRemoved: number;
  leadsRemaining: number;
  muasRemaining: number;
  tasksRemaining: number;
  pipelinesRemaining: number;
  ticketsRemaining: number;
};

/** Support tickets, chat, inquiries — keeps templates, policy docs, category + SLA config. */
export async function clearSupportTransactionalData(sql: Sql): Promise<void> {
  await sql`DELETE FROM support.public_chat_messages`;
  await sql`DELETE FROM support.public_chat_sessions`;
  await sql`DELETE FROM support.lead_usage_rows`;
  await sql`DELETE FROM support.lead_usage_uploads`;
  await sql`DELETE FROM support.ticket_updates`;
  await sql`DELETE FROM support.ticket_email_threads`;
  await sql`DELETE FROM support.ticket_lead_candidates`;
  await sql`DELETE FROM support.lead_reversal_reviews`;
  await sql`DELETE FROM support.ticket_ai_logs`;
  await sql`DELETE FROM support.ticket_email_responses`;
  await sql`DELETE FROM support.ticket_escalations`;
  await sql`DELETE FROM support.ticket_interventions`;
  await sql`DELETE FROM support.ticket_status_history`;
  await sql`DELETE FROM support.ticket_attachments`;
  await sql`DELETE FROM support.ticket_comments`;
  await sql`DELETE FROM support.ticket_tasks`;
  await sql`DELETE FROM support.tickets`;
  await sql`DELETE FROM support.support_inquiries`;
}

/** Sales CRM rows — keeps ai_persona, ai_domain_overrides, and sales.teams. */
export async function clearSalesTransactionalDataKeepTeams(sql: Sql): Promise<void> {
  await sql`DELETE FROM sales.comms_log`;
  await sql`DELETE FROM sales.call_logs`;
  await sql`DELETE FROM sales.stage_log`;
  await sql`DELETE FROM sales.assignment_log`;
  await sql`DELETE FROM sales.pipeline_rejection_log`;
  await sql`DELETE FROM sales.payment_records`;
  await sql`DELETE FROM sales.onboarding`;
  await sql`DELETE FROM sales.training`;
  await sql`DELETE FROM sales.activation_log`;
  await sql`DELETE FROM sales.renewal_attempt`;
  await sql`DELETE FROM sales.pipeline_junk`;
  await sql`DELETE FROM sales.pipeline`;
  await sql`DELETE FROM sales.targets`;
  await sql`
    UPDATE muas
    SET team_id = NULL, sales_closed_by = NULL
    WHERE team_id IS NOT NULL OR sales_closed_by IS NOT NULL
  `;
}

/** Sales CRM rows — keeps ai_persona + ai_domain_overrides (not ai_documents; re-seed after users). */
export async function clearSalesTransactionalDataKeepAi(sql: Sql): Promise<void> {
  await sql`DELETE FROM sales.comms_log`;
  await sql`DELETE FROM sales.call_logs`;
  await sql`DELETE FROM sales.stage_log`;
  await sql`DELETE FROM sales.assignment_log`;
  await sql`DELETE FROM sales.pipeline_rejection_log`;
  await sql`DELETE FROM sales.payment_records`;
  await sql`DELETE FROM sales.onboarding`;
  await sql`DELETE FROM sales.training`;
  await sql`DELETE FROM sales.activation_log`;
  await sql`DELETE FROM sales.renewal_attempt`;
  await sql`DELETE FROM sales.pipeline_junk`;
  await sql`DELETE FROM sales.pipeline`;
  await sql`DELETE FROM sales.targets`;
  await sql`DELETE FROM sales.teams`;
}

/**
 * RM operational data — keeps sla_config, plan_tiers, city_regions,
 * custom_report_templates, mua_service_catalog.
 */
export async function clearRmOperationalData(sql: Sql): Promise<void> {
  await sql`DELETE FROM rm.ops_task_attachments`;
  await sql`DELETE FROM rm.ops_tasks`;
  await sql`DELETE FROM rm.day_end_checkouts`;
  await sql`DELETE FROM rm.callyzer_sync_state`;
  await sql`DELETE FROM rm.feedback_referral_intake`;
  await sql`DELETE FROM rm.lead_verification_connect_attempts`;
  await sql`DELETE FROM rm.lead_confirmation_attempts`;
  await sql`DELETE FROM call_logs`;
  await sql`DELETE FROM feedback_referrals`;
  await sql`DELETE FROM mua_prospects`;
  await sql`DELETE FROM rm_tasks`;
  await sql`DELETE FROM notifications`;
  await sql`DELETE FROM lead_feedback`;
  await sql`DELETE FROM bookings`;
  await sql`DELETE FROM mua_push_event_prices`;
  await sql`DELETE FROM mua_pushes`;
  await sql`DELETE FROM lead_makeup_reference_images`;
  await sql`DELETE FROM bride_makeup_look_profiles`;
  await sql`DELETE FROM comms`;
  await sql`DELETE FROM lead_events`;
  await sql`DELETE FROM bride_leads`;
  await sql`DELETE FROM mua_portfolio_items`;
  await sql`DELETE FROM mua_plan_history`;
  await sql`DELETE FROM mua_regions`;
  await sql`DELETE FROM muas`;
  await sql`DELETE FROM rm_targets`;
  await sql`DELETE FROM audit_log`;
}

export type ClearOperationalKeepConfigResult = {
  leadsRemaining: number;
  muasRemaining: number;
  tasksRemaining: number;
  pipelinesRemaining: number;
  ticketsRemaining: number;
  notificationsRemaining: number;
  staffKept: number;
  teamsKept: number;
};

/**
 * Wipe operational CRM data while keeping users, teams, AI, and all templates/config.
 */
export async function clearOperationalKeepConfig(
  sql: Sql
): Promise<ClearOperationalKeepConfigResult> {
  await clearSupportTransactionalData(sql);
  await clearSalesTransactionalDataKeepTeams(sql);
  await clearRmOperationalData(sql);

  await sql`
    UPDATE custom_report_templates
    SET created_by = NULL, updated_by = NULL
    WHERE created_by IS NOT NULL OR updated_by IS NOT NULL
  `;

  const [counts] = await sql<
    {
      leads: number;
      muas: number;
      tasks: number;
      pipelines: number;
      tickets: number;
      notifications: number;
      staff: number;
      teams: number;
    }[]
  >`
    SELECT
      (SELECT COUNT(*)::int FROM bride_leads) AS leads,
      (SELECT COUNT(*)::int FROM muas) AS muas,
      (SELECT COUNT(*)::int FROM rm_tasks) AS tasks,
      (SELECT COUNT(*)::int FROM sales.pipeline) AS pipelines,
      (SELECT COUNT(*)::int FROM support.tickets) AS tickets,
      (SELECT COUNT(*)::int FROM notifications) AS notifications,
      (SELECT COUNT(*)::int FROM staff) AS staff,
      (SELECT COUNT(*)::int FROM sales.teams) AS teams
  `;

  return {
    leadsRemaining: counts?.leads ?? 0,
    muasRemaining: counts?.muas ?? 0,
    tasksRemaining: counts?.tasks ?? 0,
    pipelinesRemaining: counts?.pipelines ?? 0,
    ticketsRemaining: counts?.tickets ?? 0,
    notificationsRemaining: counts?.notifications ?? 0,
    staffKept: counts?.staff ?? 0,
    teamsKept: counts?.teams ?? 0,
  };
}

/**
 * Wipe all testing/transactional data and **all staff users**.
 *
 * Preserved:
 * - AI persona + domain overrides (sales.ai_persona, sales.ai_domain_overrides)
 * - Knowledge bank (support.policy_documents)
 * - System config (rm.sla_config incl. WhatsApp templates, plan_tiers, city_regions, mua_service_catalog)
 * - Support config (support.category_config, support.sla_config, support.ticket_templates, email_integrations)
 * - Custom report templates (rm.custom_report_templates)
 *
 * After running: `npm run db:seed` then `npm run db:seed-ai-knowledge`
 */
export async function clearTestingEnvironment(sql: Sql): Promise<ClearTestingResetResult> {
  const [staffBefore] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM staff
  `;

  await clearSupportTransactionalData(sql);
  await clearSalesTransactionalDataKeepAi(sql);
  await clearRmOperationalData(sql);

  await sql`
    UPDATE custom_report_templates
    SET created_by = NULL, updated_by = NULL
    WHERE created_by IS NOT NULL OR updated_by IS NOT NULL
  `;
  await sql`UPDATE sales.ai_persona SET updated_by = NULL WHERE updated_by IS NOT NULL`;
  await sql`UPDATE sales.ai_domain_overrides SET updated_by = NULL WHERE updated_by IS NOT NULL`;
  await sql`DELETE FROM sales.ai_documents`;

  await sql`DELETE FROM staff`;

  const [counts] = await sql<
    {
      leads: number;
      muas: number;
      tasks: number;
      pipelines: number;
      tickets: number;
    }[]
  >`
    SELECT
      (SELECT COUNT(*)::int FROM bride_leads) AS leads,
      (SELECT COUNT(*)::int FROM muas) AS muas,
      (SELECT COUNT(*)::int FROM rm_tasks) AS tasks,
      (SELECT COUNT(*)::int FROM sales.pipeline) AS pipelines,
      (SELECT COUNT(*)::int FROM support.tickets) AS tickets
  `;

  return {
    staffRemoved: staffBefore?.n ?? 0,
    leadsRemaining: counts?.leads ?? 0,
    muasRemaining: counts?.muas ?? 0,
    tasksRemaining: counts?.tasks ?? 0,
    pipelinesRemaining: counts?.pipelines ?? 0,
    ticketsRemaining: counts?.tickets ?? 0,
  };
}
