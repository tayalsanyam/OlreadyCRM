import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRoles(["feedbackRm"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const rows = await sql`
    SELECT
      t.id,
      t.ticket_number AS "ticketNumber",
      m.name AS "muaName",
      t.category,
      t.status::text AS status,
      t.urgency::text AS urgency,
      t.created_at AS "createdAt"
    FROM support.tickets t
    LEFT JOIN muas m ON m.id = t.mua_id
    WHERE t.created_by = ${auth.session.userId}::uuid
    ORDER BY t.created_at DESC
  `;

  return NextResponse.json({ data: rows, error: null });
}
