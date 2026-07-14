import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { exportListCsv, wantsCsv } from "@/lib/admin-csv-export";
import type { CityRegion, Region } from "@/lib/types";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const rows = await sql<CityRegion[]>`
    SELECT city, region::text AS region, state FROM city_regions ORDER BY city ASC
  `;

  if (wantsCsv(request)) {
    return exportListCsv("city-regions", [
      { header: "City", value: (r) => r.city },
      { header: "State", value: (r) => r.state ?? "" },
      { header: "Region", value: (r) => r.region },
    ], rows);
  }

  return NextResponse.json({ data: rows, error: null });
}

export async function POST(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as { city?: string; region?: Region; state?: string };
  const city = body.city?.trim();
  const state = body.state?.trim() || null;
  if (!city || !body.region) {
    return NextResponse.json(
      { data: null, error: "City and region are required" },
      { status: 400 }
    );
  }

  const [row] = await sql<CityRegion[]>`
    INSERT INTO city_regions (city, region, state)
    VALUES (${city}, ${body.region}::region, ${state})
    ON CONFLICT (city) DO UPDATE SET region = EXCLUDED.region, state = EXCLUDED.state
    RETURNING city, region::text AS region, state
  `;
  return NextResponse.json({ data: row, error: null });
}
