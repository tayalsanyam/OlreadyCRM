/**
 * Full testing reset: removes all users, leads, MUAs, tasks, logs, tickets, etc.
 * Keeps AI config, knowledge bank, system settings, WhatsApp templates, email templates.
 *
 * npm run db:clear-testing
 *
 * Then recreate users:
 *   npm run db:seed
 *   npm run db:seed-ai-knowledge
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { clearTestingEnvironment } from "@/lib/clear-testing-reset";

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
  idle_timeout: 30,
});

async function main() {
  console.log("Clearing testing environment…");
  console.log("Keeping: AI persona/overrides, knowledge bank, sla_config, plan tiers,");
  console.log("         cities, WhatsApp config, ticket templates, category config.\n");

  const result = await clearTestingEnvironment(sql);

  const [kept] = await sql<
    {
      staff: number;
      policyDocs: number;
      ticketTemplates: number;
      planTiers: number;
      aiPersona: number;
      aiDomains: number;
    }[]
  >`
    SELECT
      (SELECT COUNT(*)::int FROM staff) AS staff,
      (SELECT COUNT(*)::int FROM support.policy_documents) AS "policyDocs",
      (SELECT COUNT(*)::int FROM support.ticket_templates) AS "ticketTemplates",
      (SELECT COUNT(*)::int FROM plan_tiers) AS "planTiers",
      (SELECT COUNT(*)::int FROM sales.ai_persona) AS "aiPersona",
      (SELECT COUNT(*)::int FROM sales.ai_domain_overrides) AS "aiDomains"
  `;

  console.log(`  Staff removed: ${result.staffRemoved}`);
  console.log(
    `  Remaining — leads: ${result.leadsRemaining}, MUAs: ${result.muasRemaining},`,
  );
  console.log(
    `              tasks: ${result.tasksRemaining}, pipelines: ${result.pipelinesRemaining}, tickets: ${result.ticketsRemaining}`,
  );

  if (
    result.leadsRemaining > 0 ||
    result.muasRemaining > 0 ||
    result.pipelinesRemaining > 0 ||
    result.ticketsRemaining > 0
  ) {
    throw new Error("Reset incomplete — check FK constraints");
  }

  console.log("\nPreserved:");
  console.log(`  Policy docs: ${kept?.policyDocs ?? 0}`);
  console.log(`  Ticket templates: ${kept?.ticketTemplates ?? 0}`);
  console.log(`  Plan tiers: ${kept?.planTiers ?? 0}`);
  console.log(`  AI persona rows: ${kept?.aiPersona ?? 0}`);
  console.log(`  AI domain overrides: ${kept?.aiDomains ?? 0}`);
  console.log(`  Staff (should be 0): ${kept?.staff ?? 0}`);

  console.log("\nDone. Recreate users:");
  console.log("  npm run db:seed");
  console.log("  npm run db:seed-ai-knowledge");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 5 }));
