import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { canAccessMuaByRole, muaInRegion } from "@/lib/mua-access";
import type { Region } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: muaId } = await params;

  const [mua] = await sql<{ region: Region | null; city: string | null }[]>`
    SELECT NULL::region AS region, city FROM muas WHERE id = ${muaId}::uuid
  `;
  if (!mua) {
    return NextResponse.json({ data: null, error: "MUA not found" }, { status: 404 });
  }

  const regionOk = auth.session.region
    ? await muaInRegion(muaId, auth.session.region as Region)
    : true;
  if (!canAccessMuaByRole(auth.session, regionOk)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const rows = await sql`
    SELECT
      id,
      ticket_number AS "ticketNumber",
      category,
      status::text AS status,
      urgency::text AS urgency,
      created_at AS "createdAt",
      closed_at AS "closedAt"
    FROM support.tickets
    WHERE mua_id = ${muaId}::uuid
    ORDER BY created_at DESC
    LIMIT 50
  `;

  return NextResponse.json({ data: rows, error: null });
}
