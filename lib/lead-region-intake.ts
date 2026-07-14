import type { Sql } from "@/db/index";
import { resolveRegionFromLocation } from "@/lib/ceremony-region";
import type { CityRegion, Region } from "@/lib/types";

export async function loadCityRegionCatalog(db: Sql): Promise<CityRegion[]> {
  return db<CityRegion[]>`
    SELECT city, region::text AS region, state
    FROM city_regions
    ORDER BY city
  `;
}

/** Resolve region from a preloaded catalog (no DB round-trip). */
export function resolveLeadRegionFromCatalog(
  city: string,
  cityRows: CityRegion[],
): Region | null {
  const trimmed = city.trim();
  if (!trimmed) return null;
  return resolveRegionFromLocation(trimmed, cityRows);
}

/** Resolve lead region from city catalog when uploader omits region at intake. */
export async function resolveLeadRegionFromCity(
  db: Sql,
  city: string,
): Promise<Region | null> {
  const cityRows = await loadCityRegionCatalog(db);
  return resolveLeadRegionFromCatalog(city, cityRows);
}
