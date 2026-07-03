/**
 * Create a single staff user (one-off / bootstrap).
 *
 * Usage:
 *   npx tsx scripts/create-staff-user.ts <email> <name> <password> <role>
 *
 * Example:
 *   npx tsx scripts/create-staff-user.ts owner@example.com "Jane Doe" "secret" owner
 */
import { loadEnvConfig } from "@next/env";
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { DEMO_USER_ROLE_DB } from "@/lib/demo-users";
import type { UserRole } from "@/lib/types";

loadEnvConfig(process.cwd());

const [, , emailArg, nameArg, passwordArg, roleArg] = process.argv;

if (!emailArg || !nameArg || !passwordArg || !roleArg) {
  console.error(
    "Usage: npx tsx scripts/create-staff-user.ts <email> <name> <password> <role>",
  );
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();
const name = nameArg.trim();
const password = passwordArg;
const role = roleArg.trim() as UserRole;

if (!(role in DEMO_USER_ROLE_DB)) {
  console.error(`Unknown role: ${role}`);
  process.exit(1);
}

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

async function main() {
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM staff WHERE email = ${email}
  `;

  const hash = await bcrypt.hash(password, 10);
  const dbRole = DEMO_USER_ROLE_DB[role];

  if (existing) {
    await sql`
      UPDATE staff
      SET password_hash = ${hash},
          name = ${name},
          role = ${dbRole}::user_role,
          active = true,
          updated_at = NOW()
      WHERE id = ${existing.id}::uuid
    `;
    console.log(`Updated existing user: ${email} (${role})`);
    return;
  }

  const [row] = await sql<{ id: string; email: string }[]>`
    INSERT INTO staff (email, password_hash, name, role, active)
    VALUES (${email}, ${hash}, ${name}, ${dbRole}::user_role, true)
    RETURNING id, email
  `;

  console.log(`Created user: ${row?.email} (${role}) id=${row?.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => sql.end({ timeout: 5 }));
