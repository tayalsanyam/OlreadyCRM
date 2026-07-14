/**
 * Production-style reset: wipe CRM data (keep RAG policy docs + docs/RAG files),
 * seed staff + MUAs + sales pipelines from Olready Anlysis/, refresh AI knowledge from RAG.
 *
 * npm run db:reset-analysis
 *
 * Env:
 *   ANALYSIS_SEED_PASSWORD — default Olready@2026
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { seedFromAnalysis, DEFAULT_SEED_PASSWORD, ANALYSIS_DIR } from "@/lib/analysis-seed";
import { clearDatabaseExceptRag } from "@/lib/clear-except-rag";
import { seedAiKnowledge } from "@/lib/ai-seed";
import { existsSync } from "node:fs";

loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

if (!existsSync(ANALYSIS_DIR)) {
  console.error(`Missing folder: ${ANALYSIS_DIR}`);
  process.exit(1);
}

const sep = url.includes("?") ? "&" : "?";
const sql = postgres(`${url}${sep}options=-c%20search_path%3Drm`, {
  transform: postgres.camel,
  ssl: url.includes("supabase.co") ? "require" : false,
  max: 1,
  idle_timeout: 120,
  connect_timeout: 60,
  connection: {
    statement_timeout: 600_000,
  },
});

async function main() {
  console.log("══ Olready Analysis seed reset ══\n");
  console.log("Preserves: docs/RAG/*, support.policy_documents, plan_tiers, city_regions\n");

  const [lock] = await sql<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(84729103) AS locked
  `;
  if (!lock?.locked) {
    throw new Error("Another analysis seed is already running. Wait for it to finish.");
  }

  try {
  console.log("1/3 Clearing transactional data + staff…");
  const wiped = await clearDatabaseExceptRag(sql);
  console.log(`     Staff removed: ${wiped.staffRemoved}`);
  console.log(`     Bookings cleared: ${wiped.transactional.bookings}`);

  const [check] = await sql<{ leads: number; muas: number; staff: number }[]>`
    SELECT
      (SELECT COUNT(*)::int FROM bride_leads) AS leads,
      (SELECT COUNT(*)::int FROM muas) AS muas,
      (SELECT COUNT(*)::int FROM staff) AS staff,
      (SELECT COUNT(*)::int FROM sales.pipeline) AS pipelines
  `;
  if ((check?.leads ?? 0) > 0 || (check?.muas ?? 0) > 0 || (check?.staff ?? 0) > 0 || (check?.pipelines ?? 0) > 0) {
    throw new Error(`Wipe incomplete — leads=${check?.leads} muas=${check?.muas} staff=${check?.staff} pipelines=${check?.pipelines}`);
  }

  console.log("\n2/3 Seeding from Olready Anlysis/ …");
  const seeded = await seedFromAnalysis(sql);
  console.log(`     Users: ${seeded.users}`);
  console.log(`     MUAs: ${seeded.muas} (${seeded.muasSkipped} skipped)`);
  console.log(`     Sales pipelines: ${seeded.pipelines} (${seeded.pipelinesSkipped} skipped)`);
  if (seeded.salesTeamId) console.log(`     Sales team linked (TL: Gaurav)`);

  console.log("\n3/3 Refreshing AI knowledge from docs/RAG…");
  await seedAiKnowledge();
  console.log("     support.policy_documents + sales.ai_documents updated");

  console.log("\n══ Done ══");
  console.log(`Default password for all users: ${DEFAULT_SEED_PASSWORD}`);
  console.log("Change passwords after first login.\n");
  console.log("Logins (from Olready User List.xlsx):");
  console.log("  admin@olready.in, owner@olready.in");
  console.log("  gauravchettri@olready.in (Sales TL)");
  console.log("  gurkirankaur@olready.in, harsha@olready.in, vishalbhardwaj@olready.in (Sales RM)");
  console.log("  care@olready.in, uploader@olready.in, feedback@olready.in");
  console.log("  neha.xp@olready.in, sheetal@olready.in (Regional RM)");
  } finally {
    await sql`SELECT pg_advisory_unlock(84729103)`;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 10 }));
