import type { Region, SessionUser } from "@/lib/types";

export const REGION_CITIES: Record<Region, string[]> = {
  north: ["Delhi", "Jaipur", "Chandigarh", "Noida", "Gurgaon", "Gurugram", "Panipat", "Delhi NCR"],
  east: ["Kolkata", "Bhubaneswar", "Patna"],
  west: ["Mumbai", "Pune", "Ahmedabad", "Surat"],
  south: ["Bangalore", "Bengaluru", "Chennai", "Hyderabad", "Kochi"],
};

export const ALL_REGIONS: Region[] = ["north", "east", "west", "south"];

export const REGION_OPTIONS: { value: Region; label: string }[] = [
  { value: "north", label: "North" },
  { value: "east", label: "East" },
  { value: "west", label: "West" },
  { value: "south", label: "South" },
];

export function formatRegions(regions: Region[] | null | undefined): string {
  if (!regions?.length) return "—";
  if (regions.length === ALL_REGIONS.length) return "All regions";
  return regions.map((r) => REGION_OPTIONS.find((o) => o.value === r)?.label ?? r).join(", ");
}

/** Map a city name to a region when regions were not set explicitly. */
export function inferRegionFromCity(city: string): Region | null {
  const norm = city.trim().toLowerCase();
  if (!norm) return null;
  if (norm === "delhi ncr" || norm === "ncr") return "north";
  for (const region of ALL_REGIONS) {
    if (REGION_CITIES[region].some((c) => c.toLowerCase() === norm)) {
      return region;
    }
  }
  return null;
}

export function resolveMuaRegions(
  explicit: Region[] | undefined,
  city: string
): Region[] {
  const unique = [...new Set(explicit ?? [])].filter((r) =>
    ALL_REGIONS.includes(r)
  );
  if (unique.length > 0) return unique;
  const inferred = inferRegionFromCity(city);
  return inferred ? [inferred] : [];
}

/** Parse CSV/import text: "north, west" or "all". */
export function parseRegionsList(raw: string): Region[] {
  const s = raw.trim().toLowerCase();
  if (!s) return [];
  if (s === "all" || s === "all regions") return [...ALL_REGIONS];
  return s
    .split(/[,;/|]+/)
    .map((p) => p.trim())
    .filter((p): p is Region => ALL_REGIONS.includes(p as Region));
}

/** Whether an MUA is visible to a regional RM. */
export function muaMatchesRegion(
  mua: { regions?: Region[] | null; city: string },
  region: Region,
  hasPushInRegion?: boolean
): boolean {
  if (mua.regions?.length) return mua.regions.includes(region);
  const cities = REGION_CITIES[region] ?? [];
  if (cities.includes(mua.city)) return true;
  return hasPushInRegion === true;
}

export function citiesForRegions(regions: Region[]): string[] {
  const set = new Set<string>();
  for (const r of regions) {
    for (const c of REGION_CITIES[r] ?? []) set.add(c);
  }
  return [...set];
}

/** Client-side filter when one or more regions are selected (empty = all). */
export function muaMatchesAnyRegion(
  mua: { regions?: Region[] | null; city: string },
  selectedRegions: Region[],
  hasPushInRegion?: (region: Region) => boolean
): boolean {
  if (!selectedRegions.length) return true;
  return selectedRegions.some((r) =>
    muaMatchesRegion(mua, r, hasPushInRegion?.(r))
  );
}

/** Regions a regional RM may work in (from session JWT). */
export function sessionStaffRegions(
  session: Pick<SessionUser, "region" | "regions"> | null | undefined,
): Region[] {
  if (session?.regions?.length) return session.regions;
  if (session?.region) return [session.region];
  return ["north"];
}
