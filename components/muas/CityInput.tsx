"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/Input";
import { cityPickerLabels } from "@/lib/city-catalog";
import type { CityRegion } from "@/lib/types";

let catalogCache: CityRegion[] | null = null;
let catalogPromise: Promise<CityRegion[]> | null = null;

function loadCityCatalog(): Promise<CityRegion[]> {
  if (catalogCache) return Promise.resolve(catalogCache);
  if (!catalogPromise) {
    catalogPromise = fetch("/api/cities")
      .then((r) => r.json())
      .then((j: { data?: CityRegion[] }) => {
        catalogCache = j.data ?? [];
        return catalogCache;
      })
      .catch(() => {
        catalogCache = [];
        return catalogCache;
      });
  }
  return catalogPromise;
}

export function allKnownCityNames(catalog: CityRegion[]): string[] {
  return cityPickerLabels(catalog);
}

type CityInputProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
};

export function CityInput({
  label = "City",
  value,
  onChange,
  placeholder = "Start typing a city or state (e.g. Goa)…",
  hint = "Pick a city, state (Goa, Kerala), or common name (Bombay, NCR).",
  required,
}: CityInputProps) {
  const listId = useId();
  const [catalog, setCatalog] = useState<CityRegion[]>(catalogCache ?? []);

  useEffect(() => {
    let mounted = true;
    void loadCityCatalog().then((rows) => {
      if (mounted) setCatalog(rows);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const cityNames = useMemo(() => allKnownCityNames(catalog), [catalog]);

  const displayLabel = required && label ? `${label} *` : label;

  return (
    <div>
      <Input
        label={displayLabel}
        list={listId}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {cityNames.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>
      {hint ? <p className="mt-1 text-xs text-slate-muted">{hint}</p> : null}
    </div>
  );
}
