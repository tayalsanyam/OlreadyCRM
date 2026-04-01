#!/usr/bin/env node
/**
 * Describes Supabase schema: tables, columns (from sample row), row counts.
 * Run: cd crm && node scripts/describe-schema.js
 * Requires .env with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */
const path = require("path");
const fs = require("fs");
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .forEach((line) => {
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

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key);

  const tables = ["users", "bdms", "plans", "teams", "leads", "activity", "tasks", "bdm_log", "subscriptions"];
  const out = { tables: [], project: url.replace(/https?:\/\//, "").split(".")[0] };

  for (const t of tables) {
    const { data: sample, error: sampleErr } = await supabase.from(t).select("*").limit(1);
    const { count, error: countErr } = await supabase.from(t).select("*", { count: "exact", head: true });

    if (sampleErr && countErr) {
      out.tables.push({ name: t, error: sampleErr?.message || countErr?.message });
      continue;
    }

    const columns = sample?.[0] ? Object.keys(sample[0]) : [];
    out.tables.push({
      name: t,
      columns,
      rowCount: count ?? 0,
    });
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
