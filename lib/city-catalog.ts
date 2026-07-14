import { resolveRegionFromLocation } from "@/lib/ceremony-region";
import { findCatalogCity, isCatalogBundleRow } from "@/lib/geo-bundles";
import type { CityRegion, Region } from "@/lib/types";

/** Common shorthand brides/staff use — not always a city row in CSV. */
export const LOCATION_ALIASES: CityRegion[] = [
  { city: "Bombay", region: "west", state: "Maharashtra" },
  { city: "NCR", region: "north", state: null },
  { city: "BLR", region: "south", state: "Karnataka" },
  { city: "North Goa", region: "west", state: "Goa" },
  { city: "South Goa", region: "west", state: "Goa" },
];

/** Add state names + aliases to the DB city list for pickers and region lookup. */
export function expandCityCatalog(base: CityRegion[]): CityRegion[] {
  const out = [...base];
  const names = new Set(base.map((c) => c.city.trim().toLowerCase()));

  const stateToRegion = new Map<string, { region: Region; state: string }>();
  for (const row of base) {
    if (isCatalogBundleRow(row)) continue;
    const state = row.state?.trim();
    if (!state) continue;
    const key = state.toLowerCase();
    if (!stateToRegion.has(key)) {
      stateToRegion.set(key, { region: row.region, state });
    }
  }

  for (const { region, state } of stateToRegion.values()) {
    const key = state.toLowerCase();
    if (!names.has(key)) {
      out.push({ city: state, region, state });
      names.add(key);
    }
  }

  for (const alias of LOCATION_ALIASES) {
    const key = alias.city.trim().toLowerCase();
    if (!names.has(key)) {
      out.push(alias);
      names.add(key);
    }
  }

  return out.sort((a, b) => a.city.localeCompare(b.city, "en-IN"));
}

export function cityPickerLabels(catalog: CityRegion[]): string[] {
  return catalog.map((c) => c.city).filter(Boolean);
}

export function regionForState(
  stateName: string,
  catalog: CityRegion[],
): Region | null {
  const norm = stateName.trim().toLowerCase();
  if (!norm) return null;
  const row = catalog.find((c) => c.state?.trim().toLowerCase() === norm);
  return row?.region ?? null;
}

export type StatePickerOption = { state: string; region: Region };

/** Unique Indian states from catalog, sorted A–Z. */
export function uniqueStatesFromCatalog(catalog: CityRegion[]): StatePickerOption[] {
  const map = new Map<string, { state: string; region: Region }>();
  for (const row of catalog) {
    const state = row.state?.trim();
    if (!state) continue;
    const key = state.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { state, region: row.region });
    }
  }
  return [...map.values()].sort((a, b) =>
    a.state.localeCompare(b.state, "en-IN"),
  );
}

export function findCityCatalogMatch(
  value: string,
  catalog: CityRegion[],
): CityRegion | undefined {
  return findCatalogCity(catalog, value);
}

/** Picker match first, then state/alias inference from location string. */
export function resolveLocationFromCatalog(
  value: string,
  catalog: CityRegion[],
): { region: Region; state?: string | null } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = findCityCatalogMatch(trimmed, catalog);
  if (match) {
    return { region: match.region, state: match.state };
  }

  const region = resolveRegionFromLocation(trimmed, catalog);
  if (!region) return null;

  const fromState = catalog.find(
    (c) => c.state?.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  return { region, state: fromState?.state ?? null };
}
