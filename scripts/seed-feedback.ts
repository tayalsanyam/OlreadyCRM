/**
 * Seed 2 feedback-queue test leads (past ceremonies, no feedback logged).
 * npm run db:seed-feedback
 */
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { seedFeedbackData } from "@/lib/feedback-seed";

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

seedFeedbackData(sql)
  .then((r) => {
    console.log("Feedback seed OK (re-runnable — clears prior feedback_seed rows):\n");
    for (const lead of r.leads) {
      console.log(`  ${lead.displayId} — ${lead.brideName}`);
      console.log(`    ${lead.scenario}`);
    }
    console.log("\nLogin: feedback@olready.in → /feedback/queue → To call");
    console.log("Re-run anytime: npm run db:seed-feedback");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 5 }));
