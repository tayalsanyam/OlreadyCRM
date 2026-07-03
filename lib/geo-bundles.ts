import type { CityRegion, Region } from "@/lib/types";

/** Metro bundle label — picker only; never persisted as a legal state. */
export const GEO_BUNDLE_DELHI_NCR = "Delhi NCR";
export const GEO_BUNDLE_CHANDIGARH_TRICITY = "Chandigarh Tricity";

export const DELHI_NCR_CITIES = [
  "Delhi",
  "Gurugram",
  "Noida",
  "Ghaziabad",
  "Faridabad",
  "Panipat",
] as const;

export const CHANDIGARH_TRICITY_CITIES = ["Chandigarh", "Mohali", "Panchkula"] as const;

type GeoBundleDef = {
  label: string;
  region: Region;
  cities: readonly string[];
  pickerKeys: readonly string[];
};

const GEO_BUNDLE_DEFS: GeoBundleDef[] = [
  {
    label: GEO_BUNDLE_DELHI_NCR,
    region: "north",
    cities: DELHI_NCR_CITIES,
    pickerKeys: ["delhi ncr", "ncr"],
  },
  {
    label: GEO_BUNDLE_CHANDIGARH_TRICITY,
    region: "north",
    cities: CHANDIGARH_TRICITY_CITIES,
    pickerKeys: ["chandigarh tricity", "tricity"],
  },
];

const BUNDLE_PICKER_KEYS = new Set(
  GEO_BUNDLE_DEFS.flatMap((b) => [b.label.toLowerCase(), ...b.pickerKeys]),
);

const CITY_CANONICAL: Record<string, string> = {
  gurgaon: "Gurugram",
  gurugram: "Gurugram",
  pondicherry: "Puducherry",
  puducherry: "Puducherry",
};

/**
 * States/UTs where the city name equals the state name and is real coverage
 * (not a catalog placeholder). These must survive save normalization.
 */
const HOMONYM_STATE_CITIES = new Set(
  ["Delhi", "Chandigarh", "Puducherry", "Goa"].map((c) => c.toLowerCase()),
);

/** Legal state when catalog row is missing (e.g. server-side expand). */
const LEGAL_STATE_BY_CITY: Record<string, string> = {
  Delhi: "Delhi",
  Gurugram: "Haryana",
  Gurgaon: "Haryana",
  Noida: "Uttar Pradesh",
  Ghaziabad: "Uttar Pradesh",
  Faridabad: "Haryana",
  Panipat: "Haryana",
  Chandigarh: "Chandigarh",
  Mohali: "Punjab",
  Panchkula: "Haryana",
  Goa: "Goa",
  Puducherry: "Puducherry",
};

export const GEO_BUNDLE_OPTIONS = GEO_BUNDLE_DEFS.map((b) => b.label);

function findBundleDef(label: string): GeoBundleDef | undefined {
  const key = label.trim().toLowerCase();
  return GEO_BUNDLE_DEFS.find(
    (b) => b.label.toLowerCase() === key || b.pickerKeys.includes(key),
  );
}

export function canonicalCityName(city: string): string {
  const trimmed = city.trim();
  if (!trimmed) return trimmed;
  return CITY_CANONICAL[trimmed.toLowerCase()] ?? trimmed;
}

/** City doubles as the state/UT name (Delhi, Goa, etc.) — valid coverage, not a placeholder. */
export function isHomonymStateCity(city: string): boolean {
  return HOMONYM_STATE_CITIES.has(canonicalCityName(city).toLowerCase());
}

/**
 * Drop state names accidentally stored as cities (e.g. catalog "Rajasthan" placeholder).
 * Keep homonym UT cities that share the state name.
 */
export function shouldDropStatePlaceholderCity(city: string, states: string[]): boolean {
  const canon = canonicalCityName(city).toLowerCase();
  const stateKeys = new Set(states.map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (!stateKeys.has(canon)) return false;
  return !isHomonymStateCity(city);
}

export function isBundlePickerLabel(value: string): boolean {
  return BUNDLE_PICKER_KEYS.has(value.trim().toLowerCase());
}

export function isCatalogBundleRow(row: CityRegion): boolean {
  return isBundlePickerLabel(row.city);
}

export function resolveGeoBundle(label: string): string[] | null {
  const def = findBundleDef(label);
  if (!def) return null;
  return [...def.cities];
}

export function geoBundleRegion(label: string): Region | null {
  return findBundleDef(label)?.region ?? null;
}

export function findCatalogCity(
  catalog: CityRegion[],
  city: string,
): CityRegion | undefined {
  const canon = canonicalCityName(city).toLowerCase();
  return catalog.find((c) => canonicalCityName(c.city).toLowerCase() === canon);
}

export function legalStateForCity(
  catalog: CityRegion[],
  city: string,
): string | null {
  const canon = canonicalCityName(city);
  const row = findCatalogCity(catalog, canon);
  if (row?.state?.trim()) return row.state.trim();
  return LEGAL_STATE_BY_CITY[canon] ?? null;
}

/** Persisted plan states — legal only, derived from selected cities. */
export function deriveLegalStatesFromCities(
  catalog: CityRegion[],
  cityNames: string[],
): string[] {
  const states = new Set<string>();
  for (const raw of cityNames) {
    const city = canonicalCityName(raw);
    if (isBundlePickerLabel(city)) continue;
    const state = legalStateForCity(catalog, city);
    if (state) states.add(state);
  }
  return [...states].sort((a, b) => a.localeCompare(b, "en-IN"));
}

/** Cities auto-added when a legal state is picked (excludes metro bundle pseudo-rows). */
export function citiesForLegalState(
  catalog: CityRegion[],
  state: string,
): string[] {
  const normState = state.trim().toLowerCase();
  const cities: string[] = [];

  for (const row of catalog) {
    if (isCatalogBundleRow(row)) continue;
    if (row.state?.trim().toLowerCase() !== normState) continue;
    const city = canonicalCityName(row.city);
    if (!cities.includes(city)) cities.push(city);
  }

  return cities.sort((a, b) => a.localeCompare(b, "en-IN"));
}

export function normalizeCityList(cities: string[]): string[] {
  const out: string[] = [];
  for (const raw of cities) {
    const city = raw.trim();
    if (!city || isBundlePickerLabel(city)) continue;
    const canon = canonicalCityName(city);
    if (!out.includes(canon)) out.push(canon);
  }
  return out;
}

export function expandBundleIntoCities(cities: string[]): string[] {
  const out: string[] = [];
  for (const raw of cities) {
    const city = raw.trim();
    if (!city) continue;
    const bundle = resolveGeoBundle(city);
    if (bundle) {
      for (const c of bundle) {
        const canon = canonicalCityName(c);
        if (!out.includes(canon)) out.push(canon);
      }
      continue;
    }
    const canon = canonicalCityName(city);
    if (!out.includes(canon)) out.push(canon);
  }
  return out;
}
