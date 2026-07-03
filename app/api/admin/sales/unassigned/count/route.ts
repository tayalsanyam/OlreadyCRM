import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  try {
    const [row] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM sales.pipeline p
      JOIN muas m ON m.id = p.mua_id
      WHERE p.assigned_to IS NULL
        AND p.status = 'active'
        AND p.stage <> 'Rejected'
        AND m.status = 'active'
    `;
    return NextResponse.json({ data: { count: row?.count ?? 0 }, error: null });
  } catch {
    return NextResponse.json({ data: { count: 0 }, error: null });
  }
}
