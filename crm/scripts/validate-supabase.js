#!/usr/bin/env node
/**
 * Validates Supabase schema - tables exist and are queryable.
 * Run: cd crm && node scripts/validate-supabase.js
 * (Load .env first: export $(grep -v '^#' .env | xargs) or use from Next.js context)
 */
const path = require("path");
const fs = require("fs");
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  });
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

async function validate() {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key);
  const tables = ["users", "bdms", "plans", "teams", "leads", "activity", "tasks", "bdm_log"];
  let ok = true;
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select("*").limit(1);
    if (error) {
      console.error(`❌ ${t}:`, error.message);
      ok = false;
    } else {
      console.log(`✓ ${t}`);
    }
  }
  if (ok) {
    console.log("\n✅ All tables validated.");
  } else {
    process.exit(1);
  }
}

validate().catch((e) => {
  console.error(e);
  process.exit(1);
});
