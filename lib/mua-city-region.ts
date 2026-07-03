import type { TransactionSql } from "@/db/index";
import { inferRegionFromCity } from "@/lib/mua-region";
import { resolveCityAlias } from "@/lib/city-aliases";
import type { Region } from "@/lib/types";

/** Resolve region(s) from city_regions table, aliases, then static city map. */
export async function lookupRegionsForCity(
  tx: TransactionSql,
  city: string
): Promise<Region[]> {
  const trimmed = city.trim();
  if (!trimmed) return [];

  const alias = resolveCityAlias(trimmed);
  if (alias) return [alias.region];

  const [row] = await tx<{ region: string }[]>`
    SELECT region::text AS region
    FROM city_regions
    WHERE lower(trim(city)) = lower(trim(${trimmed}))
       OR lower(trim(state)) = lower(trim(${trimmed}))
    LIMIT 1
  `;
  if (row?.region) return [row.region as Region];

  const inferred = inferRegionFromCity(trimmed);
  return inferred ? [inferred] : [];
}

/** Cities covered when a metro alias is used (e.g. Delhi NCR). */
export function lookupCitiesForAlias(city: string): string[] | null {
  return resolveCityAlias(city)?.cities ?? null;
}
