/**
 * Quick Supabase / Postgres connectivity check.
 * Usage: npm run db:test
 */
import { loadEnvConfig } from "@next/env";
import dns from "node:dns";
import postgres from "postgres";

loadEnvConfig(process.cwd());
dns.setDefaultResultOrder("ipv6first");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set in .env.local");
    process.exit(1);
  }

  const sql = postgres(url, {
    ssl: url.includes("supabase.co") ? "require" : false,
    connect_timeout: 30,
  });

  try {
    const rows = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM rm.staff
    `;
    console.log("Connected OK — rm.staff count:", rows[0]?.n ?? 0);
  } catch (e) {
    const err = e as Error & { code?: string };
    console.error("Connection failed:", err.code ?? "", err.message);
    console.error(
      "\nTips:\n" +
        "• Encode & as %26, $ as %24 in the password\n" +
        "• If db.*.supabase.co fails (ENOTFOUND), use the pooler URI from\n" +
        "  Supabase → Database → Connect (Session mode)\n" +
        "• This project uses aws-1-ap-southeast-2.pooler.supabase.com (not aws-0)"
    );
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main();
