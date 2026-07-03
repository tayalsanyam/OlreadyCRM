/**
 * Full pre-wipe backup: rm + sales + support (pg_dump when available) + rm JSON export.
 *
 * npm run db:backup-pre-wipe
 */
import { spawnSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backupsDir = join(__dirname, "../db/backups");

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

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL or DATABASE_URL_DIRECT required (.env.local)");
  process.exit(1);
}

mkdirSync(backupsDir, { recursive: true });
const ts = stamp();
const tag = `pre_operational_wipe_${ts}`;

const dumps = [
  { schema: "rm", file: join(backupsDir, `rm_full_${tag}.sql`) },
  {
    schema: "sales,support",
    file: join(backupsDir, `sales_support_full_${tag}.sql`),
    extraArgs: ["--schema=sales", "--schema=support"],
  },
];

const pgDumpResults = [];

for (const spec of dumps) {
  const args = [
    url,
    "--no-owner",
    "--no-privileges",
    "--format=plain",
    "--file",
    spec.file,
    ...(spec.extraArgs ?? [`--schema=${spec.schema}`]),
  ];
  const result = spawnSync("pg_dump", args, {
    encoding: "utf8",
    maxBuffer: 200 * 1024 * 1024,
  });
  const ok = result.status === 0;
  pgDumpResults.push({ file: spec.file, ok, error: result.stderr?.trim() || result.error?.message });
  if (ok) {
    console.log("pg_dump OK:", spec.file);
  } else {
    console.warn("pg_dump failed:", spec.file, pgDumpResults.at(-1)?.error);
  }
}

console.log("\nRunning JSON rm export (npm run db:backup)…");
const jsonBackup = spawnSync("npm", ["run", "db:backup"], {
  cwd: join(__dirname, ".."),
  encoding: "utf8",
  stdio: "inherit",
});

const manifest = {
  createdAt: new Date().toISOString(),
  purpose: "Pre operational wipe — live Supabase",
  databaseUrlHost: (() => {
    try {
      return new URL(url).host;
    } catch {
      return "unknown";
    }
  })(),
  pgDumps: pgDumpResults,
  jsonBackupExitCode: jsonBackup.status,
};

const manifestPath = join(backupsDir, `BACKUP_MANIFEST_${tag}.json`);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("\nManifest:", manifestPath);

if (!pgDumpResults.some((r) => r.ok)) {
  console.error("\nERROR: No pg_dump succeeded. Install libpq (brew install libpq) before wiping.");
  process.exit(1);
}

if (jsonBackup.status !== 0) {
  console.warn("\nWARN: JSON backup exited non-zero — pg_dump files are still valid.");
}

console.log("\nBackup complete. Safe to run: npm run db:clear-operational");
