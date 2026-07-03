import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { fetchAdminTasksOverview } from "@/lib/admin-tasks-overview";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const params = new URL(request.url).searchParams;
  const staffId = params.get("staffId");

  const data = await fetchAdminTasksOverview({
    staffId: staffId || null,
  });

  const allStaff = await sql<{ id: string; name: string; role: string }[]>`
    SELECT id, name, role::text AS role FROM staff WHERE active = true ORDER BY name
  `;

  const totals = {
    staffWithWork: data.filter((s) => s.pending > 0).length,
    pending: data.reduce((n, s) => n + s.pending, 0),
    dueToday: data.reduce((n, s) => n + s.dueToday, 0),
    overdue: data.reduce((n, s) => n + s.overdue, 0),
  };

  return NextResponse.json({ data: { staff: data, allStaff, totals }, error: null });
}
