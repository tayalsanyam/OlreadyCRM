/**
 * Remove only sample_seed rows (without full DB wipe).
 * npm run db:clean-sample
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { cleanSampleData } from "@/lib/sample-seed";

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
});

cleanSampleData(sql)
  .then((r) => {
    console.log(`Removed ${r.leadsRemoved} sample lead(s) and ${r.muasRemoved} sample MUA(s).`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 2 }));
