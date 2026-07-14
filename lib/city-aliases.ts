import {
  deriveLegalStatesFromCities,
  expandBundleIntoCities,
  geoBundleRegion,
  resolveGeoBundle,
} from "@/lib/geo-bundles";
import type { CityRegion, Region } from "@/lib/types";

/** Metro aliases → cities + legal states derived from those cities (not stored bundle name). */
export function resolveCityAlias(
  city: string,
  catalog: CityRegion[] = [],
): { region: Region; cities: string[]; states: string[] } | null {
  const bundle = resolveGeoBundle(city);
  if (!bundle) return null;
  const cities = expandBundleIntoCities(bundle);
  const region = geoBundleRegion(city) ?? "north";
  return {
    region,
    cities,
    states: deriveLegalStatesFromCities(catalog, cities),
  };
}
