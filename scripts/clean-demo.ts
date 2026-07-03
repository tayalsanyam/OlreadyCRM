/**
 * Remove all demo_seed data from rm.*
 * npm run db:clean-demo
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { cleanDemoData } from "@/lib/demo-seed";

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
  idle_timeout: 5,
});

cleanDemoData(sql)
  .then((r) => {
    console.log(`Removed ${r.leadsRemoved} demo lead(s) and ${r.muasRemoved} demo MUA(s).`);
    console.log("Staff accounts (kanika@olready.in, etc.) were not touched.");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 2 }));
