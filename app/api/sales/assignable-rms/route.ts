import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { fromDbRole } from "@/lib/db-mappers";
import { listTeamSalesMembers, resolveTeamForUser } from "@/lib/sales-report-scope";

export async function GET() {
  const auth = await requireRoles(["admin", "owner", "salesTl"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const rows = await withTransaction(async (tx) => {
    if (auth.session.role === "salesTl") {
      const { teamId } = await resolveTeamForUser(tx, auth.session.userId);
      if (!teamId) {
        return [{ id: auth.session.userId, name: auth.session.name, role: "salesTl" as const }];
      }
      const members = await listTeamSalesMembers(tx, teamId, true);
      return members
        .filter((m) => m.role === "sales_rm" || m.role === "sales_tl")
        .map((m) => ({
          id: m.id,
          name: m.name,
          role: fromDbRole(m.role),
        }));
    }

    const staff = await tx<{ id: string; name: string; role: string }[]>`
      SELECT id, name, role::text AS role
      FROM staff
      WHERE active = true AND role IN ('sales_rm', 'sales_tl')
      ORDER BY name
    `;
    return staff.map((s: { id: string; name: string; role: string }) => ({
      id: s.id,
      name: s.name,
      role: fromDbRole(s.role),
    }));
  });

  return NextResponse.json({ data: rows, error: null });
}
