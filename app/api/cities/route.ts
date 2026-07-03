import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { expandCityCatalog } from "@/lib/city-catalog";
import { USE_MOCK } from "@/lib/mock-data";
import type { CityRegion } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (USE_MOCK) {
    return NextResponse.json({
      data: expandCityCatalog([
        { city: "Delhi", region: "north", state: "Delhi" },
        { city: "Mumbai", region: "west", state: "Maharashtra" },
        { city: "Bengaluru", region: "south", state: "Karnataka" },
        { city: "Kolkata", region: "east", state: "West Bengal" },
        { city: "Panaji", region: "west", state: "Goa" },
      ]),
      error: null,
    });
  }

  const rows = await sql<CityRegion[]>`
    SELECT city, region::text AS region, state FROM city_regions ORDER BY city ASC
  `;
  return NextResponse.json({ data: expandCityCatalog(rows), error: null });
}
