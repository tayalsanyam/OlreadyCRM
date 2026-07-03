/**
 * Seed demo leads/MUAs into Supabase rm.*
 * npm run db:seed-demo
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { seedDemoData } from "@/lib/demo-seed";

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

seedDemoData(sql)
  .then((r) => {
    console.log("Demo seed OK:");
    console.log("  Leads:", r.leads.join(", "));
    console.log("  MUAs:", r.muas.join(", "));
    console.log("Login kanika@olready.in → /rm/queue");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 2 }));
