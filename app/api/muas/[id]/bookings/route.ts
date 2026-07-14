import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { canAccessMuaByRole, muaInRegion } from "@/lib/mua-access";
import {
  fetchMuaBookingsLedger,
  MUA_BOOKING_CSV_HEADERS,
  muaBookingRowsToCsv,
} from "@/lib/mua-bookings";
import { csvResponse } from "@/lib/report-utils";
import type { Region } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: muaId } = await params;
  const format = new URL(request.url).searchParams.get("format");

  const [mua] = await sql<{ city: string | null }[]>`
    SELECT city FROM muas WHERE id = ${muaId}::uuid
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

  const data = await fetchMuaBookingsLedger(muaId);

  if (format === "csv") {
    const [profile] = await sql<{ displayId: string; name: string }[]>`
      SELECT display_id AS "displayId", name FROM muas WHERE id = ${muaId}::uuid
    `;
    const slug = profile?.displayId?.replace(/[^a-zA-Z0-9-]+/g, "-") ?? muaId.slice(0, 8);
    return csvResponse(
      `mua-bookings-${slug}`,
      [...MUA_BOOKING_CSV_HEADERS],
      muaBookingRowsToCsv(data.rows)
    );
  }

  return NextResponse.json({ data, error: null });
}
