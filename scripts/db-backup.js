/**
 * Backup rm schema before migrations.
 * Usage: npm run db:backup
 *
 * Writes to db/backups/:
 *   rm_full_<timestamp>.sql     — pg_dump (if installed)
 *   rm_data_<timestamp>.json    — full rm table rows (fallback / supplement)
 *   rm_snapshot_<timestamp>.json — metadata + row counts
 */
import { spawnSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backupsDir = join(__dirname, "../db/backups");

const RM_TABLES = [
  "audit_log",
  "bookings",
  "bride_leads",
  "city_regions",
  "comms",
  "feedback_referrals",
  "lead_events",
  "lead_feedback",
  "mua_plan_history",
  "mua_prospects",
  "mua_push_event_prices",
  "mua_pushes",
  "mua_regions",
  "muas",
  "notifications",
  "plan_tiers",
  "rm_targets",
  "rm_tasks",
  "sla_config",
  "staff",
];

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

try {
  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(process.cwd());
} catch {
  /* optional */
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL required (.env.local)");
  process.exit(1);
}

mkdirSync(backupsDir, { recursive: true });
const ts = stamp();
const sqlPath = join(backupsDir, `rm_full_${ts}.sql`);
const dataPath = join(backupsDir, `rm_data_${ts}.json`);
const jsonPath = join(backupsDir, `rm_snapshot_${ts}.json`);

const pgDump = spawnSync(
  "pg_dump",
  [
    url,
    "--schema=rm",
    "--no-owner",
    "--no-privileges",
    "--format=plain",
    "--file",
    sqlPath,
  ],
  { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }
);

const pgDumpOk = pgDump.status === 0;
if (pgDumpOk) {
  console.log("pg_dump OK:", sqlPath);
} else {
  console.warn(
    "pg_dump not available:",
    pgDump.stderr?.trim() || pgDump.error?.message || "ENOENT"
  );
}

const sep = url.includes("?") ? "&" : "?";
const sql = postgres(
  url.includes("search_path") ? url : `${url}${sep}options=-c%20search_path%3Drm`,
  { ssl: url.includes("supabase.co") ? "require" : false, max: 1 }
);

try {
  const data = { exportedAt: new Date().toISOString(), schema: "rm", tables: {} };
  const counts = {};

  for (const table of RM_TABLES) {
    try {
      const rows = await sql.unsafe(`SELECT * FROM rm.${table}`);
      data.tables[table] = rows;
      counts[table] = rows.length;
    } catch (e) {
      counts[table] = null;
      data.tables[table] = {
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  writeFileSync(dataPath, JSON.stringify(data));
  console.log("Data export OK:", dataPath);

  const snapshot = {
    createdAt: new Date().toISOString(),
    schema: "rm",
    databaseUrlHost: (() => {
      try {
        return new URL(url).host;
      } catch {
        return "unknown";
      }
    })(),
    pgDumpFile: pgDumpOk ? sqlPath : null,
    dataFile: dataPath,
    tableCounts: counts,
  };

  writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2));
  console.log("Snapshot OK:", jsonPath);
} finally {
  await sql.end();
}
