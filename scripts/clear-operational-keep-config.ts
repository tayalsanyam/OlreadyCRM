/**
 * Wipe operational data (MUAs, brides, tasks, tickets, logs, pipelines)
 * while keeping staff, teams, AI, and all system/care templates.
 *
 * ALWAYS run db:backup-pre-wipe first.
 *
 * npm run db:clear-operational
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { clearOperationalKeepConfig } from "@/lib/clear-testing-reset";

loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const sep = url.includes("?") ? "&" : "?";
const sql = postgres(`${url}${sep}options=-c%20search_path%3Drm`, {
  transform: postgres.camel,
  ssl: url.includes("supabase.co") ? "require" : false,
  max: 1,
  idle_timeout: 120,
});

async function main() {
  console.log("Clearing operational data (keeping users, teams, AI, templates)…\n");

  const result = await clearOperationalKeepConfig(sql);

  const [kept] = await sql<
    {
      staff: number;
      teams: number;
      policyDocs: number;
      ticketTemplates: number;
      planTiers: number;
      aiPersona: number;
      aiDomains: number;
      aiDocuments: number;
      customReports: number;
      slaConfig: number;
      categoryConfig: number;
    }[]
  >`
    SELECT
      (SELECT COUNT(*)::int FROM staff) AS staff,
      (SELECT COUNT(*)::int FROM sales.teams) AS teams,
      (SELECT COUNT(*)::int FROM support.policy_documents) AS "policyDocs",
      (SELECT COUNT(*)::int FROM support.ticket_templates) AS "ticketTemplates",
      (SELECT COUNT(*)::int FROM plan_tiers) AS "planTiers",
      (SELECT COUNT(*)::int FROM sales.ai_persona) AS "aiPersona",
      (SELECT COUNT(*)::int FROM sales.ai_domain_overrides) AS "aiDomains",
      (SELECT COUNT(*)::int FROM sales.ai_documents) AS "aiDocuments",
      (SELECT COUNT(*)::int FROM custom_report_templates) AS "customReports",
      (SELECT COUNT(*)::int FROM sla_config) AS "slaConfig",
      (SELECT COUNT(*)::int FROM support.category_config) AS "categoryConfig"
  `;

  console.log("Remaining operational rows (should all be 0):");
  console.log(`  leads: ${result.leadsRemaining}`);
  console.log(`  MUAs: ${result.muasRemaining}`);
  console.log(`  RM tasks: ${result.tasksRemaining}`);
  console.log(`  pipelines: ${result.pipelinesRemaining}`);
  console.log(`  tickets: ${result.ticketsRemaining}`);
  console.log(`  notifications: ${result.notificationsRemaining}`);

  if (
    result.leadsRemaining > 0 ||
    result.muasRemaining > 0 ||
    result.pipelinesRemaining > 0 ||
    result.ticketsRemaining > 0
  ) {
    throw new Error("Clear incomplete — check FK constraints");
  }

  console.log("\nPreserved:");
  console.log(`  staff: ${kept?.staff ?? 0}`);
  console.log(`  teams: ${kept?.teams ?? 0}`);
  console.log(`  policy docs: ${kept?.policyDocs ?? 0}`);
  console.log(`  ticket templates: ${kept?.ticketTemplates ?? 0}`);
  console.log(`  plan tiers: ${kept?.planTiers ?? 0}`);
  console.log(`  AI persona: ${kept?.aiPersona ?? 0}`);
  console.log(`  AI domain overrides: ${kept?.aiDomains ?? 0}`);
  console.log(`  AI documents: ${kept?.aiDocuments ?? 0}`);
  console.log(`  custom report templates: ${kept?.customReports ?? 0}`);
  console.log(`  sla_config rows: ${kept?.slaConfig ?? 0}`);
  console.log(`  category config rows: ${kept?.categoryConfig ?? 0}`);

  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 5 }));
