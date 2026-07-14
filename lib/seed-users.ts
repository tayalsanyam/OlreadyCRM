import bcrypt from "bcryptjs";
import type postgres from "postgres";
import { DEMO_PASSWORD, DEMO_USER_ROLE_DB, DEMO_USERS } from "@/lib/demo-users";

type Sql = postgres.Sql<Record<string, unknown>>;

export async function seedDemoUsers(sql: Sql): Promise<{ count: number }> {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  let count = 0;

  for (const u of DEMO_USERS) {
    const dbRole = DEMO_USER_ROLE_DB[u.role];
    await sql`
      INSERT INTO staff (email, password_hash, name, role, region, callyzer_number, active)
      VALUES (
        ${u.email},
        ${hash},
        ${u.name},
        ${dbRole}::user_role,
        ${u.region ? sql`${u.region}::region` : null},
        ${u.callyzerNumber ?? null},
        true
      )
      ON CONFLICT (email) DO UPDATE SET
        password_hash = ${hash},
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        region = EXCLUDED.region,
        callyzer_number = COALESCE(EXCLUDED.callyzer_number, staff.callyzer_number),
        active = true,
        team_id = NULL
    `;
    count++;
  }

  return { count };
}

/** Link Sales TL + Sales RM for team reports and senior-call routing. */
export async function ensureDemoSalesTeam(sql: Sql): Promise<{ teamId: string | null }> {
  const [tl] = await sql<{ id: string }[]>`
    SELECT id FROM staff WHERE email = 'sales.tl@olready.in' LIMIT 1
  `;
  const [rm] = await sql<{ id: string }[]>`
    SELECT id FROM staff WHERE email = 'sales.rm@olready.in' LIMIT 1
  `;
  if (!tl?.id || !rm?.id) return { teamId: null };

  const [team] = await sql<{ id: string }[]>`
    INSERT INTO sales.teams (name, tl_id)
    VALUES ('Demo Sales Team', ${tl.id}::uuid)
    RETURNING id
  `;

  await sql`
    UPDATE staff
    SET team_id = ${team.id}::uuid
    WHERE id IN (${tl.id}::uuid, ${rm.id}::uuid)
  `;

  return { teamId: team.id };
}
