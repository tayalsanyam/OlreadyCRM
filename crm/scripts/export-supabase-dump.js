#!/usr/bin/env node
/**
 * Exports full Supabase schema + data to JSON files.
 * Run: cd crm && node scripts/export-supabase-dump.js
 * Output: crm/supabase-dump/ (or --out=path)
 * Share the supabase-dump folder for schema/data review.
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

const OUT_DIR = process.argv.find((a) => a.startsWith("--out="))?.split("=")[1] || path.join(__dirname, "..", "supabase-dump");

const KNOWN_TABLES = ["users", "bdms", "plans", "teams", "leads", "activity", "tasks", "bdm_log"];
const EXTRA_TABLES = ["payments", "payment_transactions", "pending_payments", "transactions"];

async function fetchOpenApiTables() {
  try {
    const base = url.replace(/\/$/, "");
    const res = await fetch(`${base}/rest/v1/`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/openapi+json",
      },
    });
    if (!res.ok) return [];
    const spec = await res.json();
    const paths = spec.paths || {};
    const tables = Object.keys(paths)
      .filter((p) => p.startsWith("/") && !p.includes("{"))
      .map((p) => p.replace(/^\//, "").split("/")[0])
      .filter(Boolean);
    return [...new Set(tables)];
  } catch {
    return [];
  }
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let allTables = await fetchOpenApiTables();
  if (allTables.length === 0) allTables = KNOWN_TABLES;

  const tried = new Set([...allTables, ...KNOWN_TABLES, ...EXTRA_TABLES]);
  const manifest = { exportedAt: new Date().toISOString(), project: url, tables: [] };

  for (const t of tried) {
    const { data, error } = await supabase.from(t).select("*");
    if (error) {
      manifest.tables.push({ name: t, error: error.message });
      continue;
    }
    const outPath = path.join(OUT_DIR, `${t}.json`);
    fs.writeFileSync(outPath, JSON.stringify(data ?? [], null, 2));
    manifest.tables.push({ name: t, rows: (data ?? []).length });
  }

  fs.writeFileSync(path.join(OUT_DIR, "_manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Exported to ${OUT_DIR}`);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
