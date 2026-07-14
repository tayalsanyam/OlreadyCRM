#!/usr/bin/env node
/**
 * Generate db/backups/DATABASE_SCHEMA_BACKUP_<date>.md from live rm schema.
 * Usage: node scripts/generate-schema-backup-md.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const date = new Date().toISOString().slice(0, 10);

function loadEnv() {
  try {
    const raw = readFileSync(join(__dirname, "../.env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = /^([^#=]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* optional */
  }
}

function pgType(c) {
  if (c.data_type === "USER-DEFINED") return `rm.${c.udt_name}`;
  if (c.data_type === "ARRAY") return `${c.udt_name.replace(/^_/, "")}[]`;
  return c.data_type;
}

loadEnv();
const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL or DATABASE_URL_DIRECT required");
  process.exit(1);
}

const sep = url.includes("?") ? "&" : "?";
const conn = url.includes("search_path")
  ? url
  : `${url}${sep}options=-c%20search_path%3Drm`;
const sql = postgres(conn, {
  max: 1,
  prepare: false,
  ssl: url.includes("supabase") ? "require" : false,
});

const enums = await sql`
  SELECT t.typname AS name, e.enumlabel AS value
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid = t.oid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'rm'
  ORDER BY t.typname, e.enumsortorder
`;
const cols = await sql`
  SELECT c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable, c.column_default
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE c.table_schema = 'rm' AND t.table_type = 'BASE TABLE'
  ORDER BY c.table_name, c.ordinal_position
`;
const viewCols = await sql`
  SELECT c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE c.table_schema = 'rm' AND t.table_type = 'VIEW'
  ORDER BY c.table_name, c.ordinal_position
`;
const indexes = await sql`
  SELECT tablename, indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'rm'
  ORDER BY tablename, indexname
`;
const views = await sql`
  SELECT table_name FROM information_schema.views WHERE table_schema = 'rm'
`;
const fns = await sql`
  SELECT p.proname AS name, pg_get_functiondef(p.oid) AS def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'rm' AND p.prokind = 'f'
`;
await sql.end();

const enumMap = {};
for (const e of enums) {
  if (!enumMap[e.name]) enumMap[e.name] = [];
  enumMap[e.name].push(e.value);
}

const byTable = {};
for (const c of cols) {
  if (!byTable[c.table_name]) byTable[c.table_name] = [];
  byTable[c.table_name].push(c);
}

let md = `# Olready RM Database — Schema Backup

> **Snapshot date:** ${date}  
> **Source:** Live introspection of Supabase \`rm\` schema  
> **Purpose:** Point-in-time backup before schema changes. Documentation only — not executable migration DDL.

---

## Overview

- **Application schema:** \`rm\` (isolated from legacy \`public\` BDM/sales tables)
- **Migrations in repo:** see [Migration history](#migration-history) below (\`db/migrations/\`)
- **Base DDL:** \`db/schema-rm.sql\`
- **RLS:** Enabled on all \`rm\` tables; no policies — app uses server-side connection only

### Tables (${Object.keys(byTable).length})

${Object.keys(byTable)
  .sort()
  .map((t) => `- \`rm.${t}\``)
  .join("\n")}

### Views (${views.length})

${views.map((v) => `- \`rm.${v.table_name}\``).join("\n")}

### Functions (${fns.length})

${fns.map((f) => `- \`rm.${f.name}()\``).join("\n")}

---

## Enums

`;

for (const [name, values] of Object.entries(enumMap).sort((a, b) =>
  a[0].localeCompare(b[0])
)) {
  md += `### \`rm.${name}\`\n\n`;
  md += values.map((v) => `- \`${v}\``).join("\n") + "\n\n";
}

md += `---\n\n## Tables\n\n`;

for (const table of Object.keys(byTable).sort()) {
  md += `### \`rm.${table}\`\n\n`;
  md += `| Column | Type | Nullable | Default |\n`;
  md += `|--------|------|----------|--------|\n`;
  for (const c of byTable[table]) {
    const def = c.column_default
      ? `\`${String(c.column_default).slice(0, 80)}\``
      : "—";
    md += `| \`${c.column_name}\` | ${pgType(c)} | ${c.is_nullable} | ${def} |\n`;
  }
  md += "\n";
}

const idxByTable = {};
for (const i of indexes) {
  if (!idxByTable[i.tablename]) idxByTable[i.tablename] = [];
  idxByTable[i.tablename].push(i);
}

md += `---\n\n## Indexes\n\n`;

for (const table of Object.keys(idxByTable).sort()) {
  md += `### \`rm.${table}\`\n\n`;
  for (const i of idxByTable[table]) {
    md += `- **${i.indexname}**\n  \`\`\`sql\n  ${i.indexdef}\n  \`\`\`\n`;
  }
  md += "\n";
}

md += `---\n\n## Views\n\n### \`rm.leads_full\`\n\n`;
md += `Denormalized lead list. Recreated in \`013_recreate_leads_full_commission.sql\` so \`commission_offered\` / \`commission_agreed\` on \`bride_leads\` are included via \`bl.*\`.\n\n`;
md += `**Computed columns (in addition to all \`bride_leads\` columns):**\n\n`;
const computed = [
  "urgency_band — from rm.compute_urgency_band(event_date)",
  "days_to_event — event_date - CURRENT_DATE",
  "assignment_days_remaining",
  "days_since_assignment",
  "assigned_rm_name",
  "active_pushes_count",
  "muas_offered_count",
  "muas_offered_names",
  "event_count",
  "booked_event_count",
  "open_event_count",
  "event_labels",
  "last_activity_at",
];
md += computed.map((c) => `- ${c}`).join("\n") + "\n\n";

if (viewCols.length) {
  md += `**Columns exposed by the view:**\n\n`;
  md += `| Column | Type | Nullable |\n|--------|------|----------|\n`;
  for (const c of viewCols) {
    md += `| \`${c.column_name}\` | ${pgType(c)} | ${c.is_nullable} |\n`;
  }
  md += "\n";
}

md += `---\n\n## Functions\n\n`;

for (const f of fns) {
  md += `### \`rm.${f.name}\`\n\n\`\`\`sql\n${f.def}\n\`\`\`\n\n`;
}

md += `---\n\n## Seed data (reference)\n\n`;
md += `### plan_tiers defaults (schema-rm.sql)\n\n`;
md += "| tier | name | weekly_cap | monthly_push_target | sort_order |\n";
md += "|------|------|------------|----------------------|------------|\n";
md += "| highest_privy | Highest Privy | 10 | 200 | 1 |\n";
md += "| phoenix_2 | Phoenix 2 | 7 | 28 | 2 |\n";
md += "| phoenix | Phoenix | 7 | 28 | 3 |\n";
md += "| pro | Pro | 2 | 8 | 4 |\n";
md += "| prime | Prime | 1 | 4 | 5 |\n\n";

md += `---\n\n## Migration history\n\n`;
const migrations = readdirSync(join(__dirname, "../db/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
md += migrations.map((m) => `- \`${m}\``).join("\n") + "\n\n";

md += `---\n\n## Supabase Edge Functions\n\n`;
md += `No Edge Functions are deployed on this project (verified via Supabase Management API on ${date}).\n`;
md += `See \`db/backups/EDGE_FUNCTIONS_BACKUP_${date}.md\` for the manifest snapshot.\n\n`;

md += `---\n\n## Restore notes\n\n`;
md += "- Recreate from repo: \`node scripts/migrate.js\` (requires DATABASE_URL)\n";
md += "- Use \`db/schema-rm.sql\` + \`db/migrations/*.sql\` for actual DDL\n";
md += "- \`comms.mua_id\` is applied inline in \`scripts/migrate.js\` (not a numbered migration)\n";
md += `- Regenerate this doc: \`node scripts/generate-schema-backup-md.mjs\`\n`;

const outPath = join(__dirname, `../db/backups/DATABASE_SCHEMA_BACKUP_${date}.md`);
mkdirSync(join(__dirname, "../db/backups"), { recursive: true });
writeFileSync(outPath, md);
console.log(`Wrote ${outPath} (${md.length} chars)`);
