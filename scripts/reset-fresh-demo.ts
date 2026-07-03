/**
 * Wipe all CRM transactional data (keeps staff/users + config), then seed:
 * - 50 leads in pending_verification
 * - 20 MUAs (10 expired plan + history, 10 with no plan history)
 *
 * npm run db:reset-fresh
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { clearRmTransactionalData } from "@/lib/clear-rm-data";
import { seedFreshData } from "@/lib/fresh-seed";

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
  console.log("Clearing transactional data (staff & config preserved)…\n");
  const cleared = await clearRmTransactionalData(sql);
  console.log(`  Removed ${cleared.bookings} booking(s)`);
  console.log(`  Remaining leads: ${cleared.brideLeads}, MUAs: ${cleared.muas}, tasks: ${cleared.tasks}`);

  if (cleared.brideLeads > 0 || cleared.muas > 0) {
    throw new Error("Clear incomplete — check FK constraints");
  }

  console.log("\nSeeding fresh demo data…\n");
  const seeded = await seedFreshData(sql);
  console.log(`  Leads: ${seeded.leads} (all pending verification: ${seeded.pendingLeads})`);
  console.log(`  MUAs: ${seeded.muas}`);
  console.log(`    Expired plan: ${seeded.expiredMuas}`);
  console.log(`    No plan history: ${seeded.noPlanHistoryMuas}`);
  console.log("\nLogins unchanged (password: demo1234):");
  console.log("  admin@olready.in — verify queue / admin");
  console.log("  uploader@olready.in — uploaded leads");
  console.log("  kanika@olready.in — RM (no assigned leads in this seed)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 5 }));
