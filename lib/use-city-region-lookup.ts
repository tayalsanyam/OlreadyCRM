"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveRegionFromLocation } from "@/lib/ceremony-region";
import { inferRegionFromCity } from "@/lib/mua-region";
import type { CityRegion, Region } from "@/lib/types";

/** Lookup region from city_regions API + static map. */
export function useCityRegionLookup(city: string): {
  regions: Region[];
  loading: boolean;
} {
  const [cities, setCities] = useState<CityRegion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/cities")
      .then((r) => r.json())
      .then((j: { data?: CityRegion[] }) => setCities(j.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  const regions = useMemo((): Region[] => {
    const trimmed = city.trim();
    if (!trimmed || loading) return [];

    const fromDb = resolveRegionFromLocation(trimmed, cities);
    if (fromDb) return [fromDb];

    const inferred = inferRegionFromCity(trimmed);
    return inferred ? [inferred] : [];
  }, [city, cities, loading]);

  return { regions, loading };
}
