import { inferRegionFromCity } from "@/lib/mua-region";
import type { Sql } from "@/db/index";
import type { CityRegion, Region } from "@/lib/types";

export type CeremonyLocationInput = {
  name: string;
  date?: string | null;
  location?: string | null;
  region?: Region | null;
};

function regionFromState(name: string, cities: CityRegion[]): Region | null {
  const norm = name.trim().toLowerCase();
  if (!norm) return null;
  const match = cities.find((c) => c.state?.trim().toLowerCase() === norm);
  return match?.region ?? null;
}

/** Match city_regions list, state name, or static city map. */
export function resolveRegionFromLocation(
  location: string,
  cities: CityRegion[]
): Region | null {
  const trimmed = location.trim();
  if (!trimmed) return null;

  const exact = cities.find(
    (c) => c.city.toLowerCase() === trimmed.toLowerCase()
  );
  if (exact) return exact.region;

  const fromState = regionFromState(trimmed, cities);
  if (fromState) return fromState;

  const inferred = inferRegionFromCity(trimmed);
  if (inferred) return inferred;

  const comma = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
  const last = comma[comma.length - 1];
  if (last) {
    const fromLastCity = cities.find(
      (c) => c.city.toLowerCase() === last.toLowerCase()
    );
    if (fromLastCity) return fromLastCity.region;

    const fromLastState = regionFromState(last, cities);
    if (fromLastState) return fromLastState;

    return inferRegionFromCity(last);
  }

  return null;
}

export function uniqueRegions(regions: (Region | null | undefined)[]): Region[] {
  const set = new Set<Region>();
  for (const r of regions) {
    if (r) set.add(r);
  }
  return [...set];
}

/** Earliest dated ceremony; else first in list. */
export function pickPrimaryCeremonyIndex(
  ceremonies: CeremonyLocationInput[]
): number {
  let best = 0;
  let bestDate = ceremonies[0]?.date ?? null;
  for (let i = 1; i < ceremonies.length; i++) {
    const d = ceremonies[i]?.date;
    if (!d) continue;
    if (!bestDate || d < bestDate) {
      bestDate = d;
      best = i;
    }
  }
  return best;
}

export function deriveLeadPrimaryRegion(params: {
  ceremonies: CeremonyLocationInput[];
  assignmentRegion?: Region | null;
  /** When ceremonies have no region yet, use lead/upload region instead of defaulting north. */
  fallbackRegion?: Region | null;
}): { region: Region; conflict: boolean; regions: Region[] } {
  const regions = uniqueRegions(
    params.ceremonies.map((c) => c.region ?? null)
  );
  const conflict = regions.length > 1;

  if (params.assignmentRegion && conflict) {
    return {
      region: params.assignmentRegion,
      conflict: true,
      regions,
    };
  }

  if (regions.length === 1) {
    return { region: regions[0]!, conflict: false, regions };
  }

  if (regions.length === 0) {
    const fb = params.fallbackRegion ?? "north";
    return { region: fb, conflict: false, regions: fb ? [fb] : [] };
  }

  const idx = pickPrimaryCeremonyIndex(params.ceremonies);
  const primary = params.ceremonies[idx]?.region;
  return {
    region: primary ?? regions[0]!,
    conflict: true,
    regions,
  };
}

export function leadEventLocationSummary(
  ceremonies: CeremonyLocationInput[]
): string {
  const locs = [
    ...new Set(
      ceremonies
        .map((c) => c.location?.trim())
        .filter((x): x is string => !!x)
    ),
  ];
  if (locs.length === 0) return "";
  if (locs.length === 1) return locs[0]!;
  return "Multiple venues";
}

export function regionsForEventIds(
  eventIds: string[],
  events: { id: string; region?: Region | null }[]
): Region[] {
  const byId = new Map(events.map((e) => [e.id, e.region ?? null]));
  return uniqueRegions(eventIds.map((id) => byId.get(id) ?? null));
}

/** Regions to filter Push MUA list — ceremony location, not RM home region. */
export async function resolvePushCeremonyRegions(
  db: Sql,
  leadId: string,
  eventIds: string[],
): Promise<Region[]> {
  if (eventIds.length > 0) {
    const rows = await db<{ id: string; region: string | null }[]>`
      SELECT id, region::text AS region
      FROM lead_events
      WHERE lead_id = ${leadId}::uuid
        AND id = ANY(${db.array(eventIds)}::uuid[])
    `;
    return regionsForEventIds(
      eventIds,
      rows.map((r) => ({ id: r.id, region: r.region as Region | null })),
    );
  }

  const openRows = await db<{ id: string; region: string | null }[]>`
    SELECT id, region::text AS region
    FROM lead_events
    WHERE lead_id = ${leadId}::uuid AND status = 'open'
  `;
  const fromOpen = regionsForEventIds(
    openRows.map((r) => r.id),
    openRows.map((r) => ({ id: r.id, region: r.region as Region | null })),
  );
  if (fromOpen.length > 0) return fromOpen;

  const [lead] = await db<{ region: string | null }[]>`
    SELECT region::text AS region FROM bride_leads WHERE id = ${leadId}::uuid
  `;
  return lead?.region ? [lead.region as Region] : [];
}
