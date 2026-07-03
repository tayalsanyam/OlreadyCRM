import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireGrievanceAccess } from "@/lib/api-auth";
import { fromDbRole } from "@/lib/db-mappers";
import { DEMO_USER_ROLE_DB } from "@/lib/demo-users";
import type { UserRole } from "@/lib/types";

function appRolesToDbSlugs(appRoles: string[]): string[] {
  return appRoles
    .map((role) => DEMO_USER_ROLE_DB[role as UserRole])
    .filter((role): role is string => Boolean(role));
}

export async function GET(request: Request) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const rolesParam = new URL(request.url).searchParams.get("roles");
  const appRoleFilter = rolesParam
    ? rolesParam.split(",").map((r) => r.trim()).filter(Boolean)
    : null;
  const dbRoleFilter = appRoleFilter?.length ? appRolesToDbSlugs(appRoleFilter) : null;

  try {
    const rows =
      dbRoleFilter && dbRoleFilter.length > 0
        ? await sql<{ id: string; name: string; email: string; role: string }[]>`
            SELECT id, name, email, role::text AS role
            FROM rm.staff
            WHERE active = true
              AND role::text = ANY(${dbRoleFilter})
            ORDER BY name
            LIMIT 200
          `
        : await sql<{ id: string; name: string; email: string; role: string }[]>`
            SELECT id, name, email, role::text AS role
            FROM rm.staff
            WHERE active = true
            ORDER BY name
            LIMIT 200
          `;

    return NextResponse.json({
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: fromDbRole(String(r.role)),
      })),
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Staff lookup failed";
    console.error("[crm/staff]", message);
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
