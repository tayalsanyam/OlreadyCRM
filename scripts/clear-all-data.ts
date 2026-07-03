/**
 * Wipe all transactional CRM + sales data. Keeps staff (users), plan_tiers, sla_config, city_regions.
 *
 * npm run db:clear-all
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { clearRmTransactionalData } from "@/lib/clear-rm-data";

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
  idle_timeout: 10,
});

async function main() {
  const [staffBefore] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM staff
  `;

  console.log("Clearing all transactional data (staff preserved)…");
  const cleared = await clearRmTransactionalData(sql);

  const [counts] = await sql<
    {
      staff: number;
      leads: number;
      muas: number;
      pipelines: number;
      tasks: number;
      teams: number;
    }[]
  >`
    SELECT
      (SELECT COUNT(*)::int FROM staff) AS staff,
      (SELECT COUNT(*)::int FROM bride_leads) AS leads,
      (SELECT COUNT(*)::int FROM muas) AS muas,
      (SELECT COUNT(*)::int FROM sales.pipeline) AS pipelines,
      (SELECT COUNT(*)::int FROM rm_tasks) AS tasks,
      (SELECT COUNT(*)::int FROM sales.teams) AS teams
  `;

  console.log(`  Removed ${cleared.bookings} booking(s) from wipe batch`);
  console.log(`  Staff kept: ${counts.staff} (was ${staffBefore?.n ?? counts.staff})`);
  console.log(`  Remaining — leads: ${counts.leads}, MUAs: ${counts.muas}, pipelines: ${counts.pipelines}, tasks: ${counts.tasks}, teams: ${counts.teams}`);

  if (counts.leads > 0 || counts.muas > 0 || counts.pipelines > 0) {
    throw new Error("Clear incomplete — check FK constraints or run again");
  }

  console.log("\nDone. Only users (staff) and system config remain.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 5 }));
