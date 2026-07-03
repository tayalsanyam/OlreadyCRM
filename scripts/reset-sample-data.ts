/**
 * Wipe transactional CRM data and seed a larger sample dataset.
 * Keeps staff, plan_tiers, sla_config, city_regions.
 *
 * npm run db:reset-sample
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { clearRmTransactionalData } from "@/lib/clear-rm-data";
import { seedSampleData } from "@/lib/sample-seed";

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
  console.log("Clearing transactional data (staff & config preserved)…");
  const cleared = await clearRmTransactionalData(sql);
  console.log(
    `  Removed ${cleared.bookings} booking(s); ${cleared.brideLeads} leads and ${cleared.muas} MUAs remain (should be 0).`
  );

  if (cleared.brideLeads > 0 || cleared.muas > 0) {
    throw new Error("Clear incomplete — check FK constraints");
  }

  console.log("\nSeeding sample data…");
  const seeded = await seedSampleData(sql);
  console.log(`  ${seeded.muas.length} MUAs (${seeded.muas.join(", ")})`);
  console.log(`  ${seeded.leads.length} lead display IDs (source=${"sample_seed"})`);

  const [counts] = await sql<
    {
      leads: number;
      muas: number;
      pushes: number;
      pending: number;
      assigned: number;
      commission: number;
    }[]
  >`
    SELECT
      (SELECT COUNT(*)::int FROM bride_leads) AS leads,
      (SELECT COUNT(*)::int FROM muas) AS muas,
      (SELECT COUNT(*)::int FROM mua_pushes) AS pushes,
      (SELECT COUNT(*)::int FROM bride_leads WHERE status = 'pending_verification') AS pending,
      (SELECT COUNT(*)::int FROM bride_leads WHERE status = 'assigned') AS assigned,
      (SELECT COUNT(*)::int FROM bride_leads WHERE status = 'commission_rm') AS commission
  `;

  console.log("\nCounts:");
  console.log(`  Leads: ${counts.leads} (pending ${counts.pending}, assigned ${counts.assigned}, commission ${counts.commission})`);
  console.log(`  MUAs: ${counts.muas}, Pushes: ${counts.pushes}`);
  console.log("\nLogins (password demo1234):");
  console.log("  kanika@olready.in → RM queue");
  console.log("  commission@olready.in → Commission queue");
  console.log("  uploader@olready.in → Upload leads");
  console.log("  Harsha partial book: LD-S017");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 3 }));
