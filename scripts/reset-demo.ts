/**
 * Full demo reset: wipe transactional data + all users, recreate login quick-access
 * users, seed demo leads/MUAs/pipelines/tasks.
 *
 * npm run db:reset-demo
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { seedDemoData } from "@/lib/demo-seed";
import { DEMO_PASSWORD, DEMO_USERS } from "@/lib/demo-users";
import { ensureDemoSalesTeam, seedDemoUsers } from "@/lib/seed-users";
import { wipeDatabaseForDemoReset } from "@/lib/wipe-database";

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
  console.log("Wiping transactional data and all staff users…\n");
  const wiped = await wipeDatabaseForDemoReset(sql);
  console.log(`  Removed ${wiped.transactional.bookings} booking(s)`);
  console.log(`  Removed ${wiped.staffRemoved} staff user(s)`);

  const [counts] = await sql<
    { leads: number; muas: number; staff: number; pipelines: number }[]
  >`
    SELECT
      (SELECT COUNT(*)::int FROM bride_leads) AS leads,
      (SELECT COUNT(*)::int FROM muas) AS muas,
      (SELECT COUNT(*)::int FROM staff) AS staff,
      (SELECT COUNT(*)::int FROM sales.pipeline) AS pipelines
  `;

  if ((counts?.leads ?? 0) > 0 || (counts?.muas ?? 0) > 0 || (counts?.pipelines ?? 0) > 0) {
    throw new Error("Wipe incomplete — transactional rows remain");
  }
  if ((counts?.staff ?? 0) > 0) {
    throw new Error("Wipe incomplete — staff rows remain");
  }

  console.log("\nCreating demo users (login quick-access)…\n");
  const { count } = await seedDemoUsers(sql);
  console.log(`  ${count} users created — password: ${DEMO_PASSWORD}`);

  const team = await ensureDemoSalesTeam(sql);
  if (team.teamId) console.log("  Sales team linked (TL + RM)");

  console.log("\nSeeding demo CRM data…\n");
  const demo = await seedDemoData(sql);
  console.log(`  Leads: ${demo.leads.join(", ")}`);
  console.log(`  MUAs: ${demo.muas.join(", ")}`);

  console.log("\n── Quick login (/login) ──");
  for (const u of DEMO_USERS) {
    console.log(`  ${u.label.padEnd(16)} ${u.email}`);
  }
  console.log(`\nPassword for all: ${DEMO_PASSWORD}`);
  console.log("\nSuggested paths:");
  console.log("  kanika@olready.in      → /rm/queue (LD-00001 assigned)");
  console.log("  sales.rm@olready.in    → /sales/tasks");
  console.log("  commission@olready.in  → /rm/queue (commission tab)");
  console.log("  uploader@olready.in    → /upload (LD-00009 pending)");
  console.log("  activation@olready.in  → /sales/tasks (activation)");
  console.log("  admin@olready.in       → /admin/config");
  console.log("  care@olready.in        → /care/grievances");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 5 }));
