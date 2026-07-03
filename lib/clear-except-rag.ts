import type postgres from "postgres";
import { clearRmTransactionalData } from "@/lib/clear-rm-data";

type Sql = postgres.Sql<Record<string, unknown>>;

export type ClearExceptRagResult = {
  staffRemoved: number;
  transactional: Awaited<ReturnType<typeof clearRmTransactionalData>>;
};

/** Remove support transactional rows. Keeps policy_documents, templates, category_config, sla_config. */
export async function clearSupportTransactionalData(sql: Sql): Promise<void> {
  await sql`DELETE FROM support.ticket_updates`;
  await sql`DELETE FROM support.ticket_comments`;
  await sql`DELETE FROM support.ticket_attachments`;
  await sql`DELETE FROM support.ticket_tasks`;
  await sql`DELETE FROM support.ticket_email_responses`;
  await sql`DELETE FROM support.ticket_status_history`;
  await sql`DELETE FROM support.ticket_interventions`;
  await sql`DELETE FROM support.ticket_escalations`;
  await sql`DELETE FROM support.lead_reversal_reviews`;
  await sql`DELETE FROM support.ticket_ai_logs`;
  await sql`DELETE FROM support.ticket_lead_candidates`;
  await sql`DELETE FROM support.lead_usage_rows`;
  await sql`DELETE FROM support.lead_usage_uploads`;
  await sql`DELETE FROM support.ticket_email_threads`;
  await sql`DELETE FROM support.tickets`;
  await sql`DELETE FROM support.public_chat_messages`;
  await sql`DELETE FROM support.public_chat_sessions`;
  await sql`DELETE FROM support.support_inquiries`;
  await sql`DELETE FROM rm.ops_tasks`;
}

/**
 * Wipe CRM/sales/support transactional data and all staff.
 * Preserves: plan_tiers, city_regions, sla_config, support.policy_documents,
 * support.ticket_templates, support.category_config, docs/RAG files on disk.
 * Re-run `npm run db:seed-ai-knowledge` after to refresh sales.ai_documents from RAG files.
 */
export async function clearDatabaseExceptRag(sql: Sql): Promise<ClearExceptRagResult> {
  await clearSupportTransactionalData(sql);
  const transactional = await clearRmTransactionalData(sql);

  const removed = await sql<{ id: string }[]>`
    DELETE FROM staff RETURNING id
  `;

  return {
    staffRemoved: removed.length,
    transactional,
  };
}
