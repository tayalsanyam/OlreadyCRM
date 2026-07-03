/**
 * Verifies rm.bookings has payment + commission columns (Supabase / Postgres).
 * Usage: npm run db:verify  (loads .env.local via dotenv if present)
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "../.env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing — set in .env.local");
  process.exit(1);
}

const required = [
  "payment_mode",
  "commission_amount",
  "commission_paid",
  "commission_paid_at",
  "bride_fully_paid_at",
];

const sep = url.includes("?") ? "&" : "?";
const sql = postgres(
  url.includes("search_path") ? url : `${url}${sep}options=-c%20search_path%3Drm`,
  { max: 1 }
);

try {
  const rows = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'rm' AND table_name = 'bookings'
  `;
  const have = new Set(rows.map((r) => r.column_name));
  const missing = required.filter((c) => !have.has(c));
  if (missing.length) {
    console.error("Missing columns on rm.bookings:", missing.join(", "));
    console.error("Run: npm run db:migrate");
    process.exit(1);
  }
  console.log("OK — rm.bookings has commission + payment columns");
  console.log("USE_MOCK_DATA =", process.env.USE_MOCK_DATA ?? "(unset)");
} catch (e) {
  console.error("DB check failed:", e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await sql.end();
}
