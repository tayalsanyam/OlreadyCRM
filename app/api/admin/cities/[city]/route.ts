import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import type { CityRegion, Region } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ city: string }> }
) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { city: cityParam } = await params;
  const city = decodeURIComponent(cityParam);
  const body = (await request.json()) as { region?: Region; state?: string | null };
  if (!body.region && body.state === undefined) {
    return NextResponse.json({ data: null, error: "Region or state required" }, { status: 400 });
  }

  const [row] = await sql<CityRegion[]>`
    UPDATE city_regions SET
      region = COALESCE(${body.region ?? null}::region, region),
      state = CASE WHEN ${body.state !== undefined} THEN ${body.state?.trim() || null} ELSE state END
    WHERE city = ${city}
    RETURNING city, region::text AS region, state
  `;
  if (!row) {
    return NextResponse.json({ data: null, error: "City not found" }, { status: 404 });
  }
  return NextResponse.json({ data: row, error: null });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ city: string }> }
) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { city: cityParam } = await params;
  const city = decodeURIComponent(cityParam);
  await sql`DELETE FROM city_regions WHERE city = ${city}`;
  return NextResponse.json({ data: { ok: true }, error: null });
}
