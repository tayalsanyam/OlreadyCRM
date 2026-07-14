"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  resolveLocationFromCatalog,
  uniqueStatesFromCatalog,
  regionForState,
} from "@/lib/city-catalog";
import type { CityRegion, Region } from "@/lib/types";

const REGIONS: { value: Region; label: string }[] = [
  { value: "north", label: "North" },
  { value: "east", label: "East" },
  { value: "west", label: "West" },
  { value: "south", label: "South" },
];

export type LeadCityGeo = { state?: string | null; region: Region } | null;

type LeadCityFieldProps = {
  label?: string;
  required?: boolean;
  cities: CityRegion[];
  city: string;
  onCityChange: (city: string) => void;
  onResolved: (geo: LeadCityGeo, regionLocked: boolean) => void;
  onStatePickerChange?: (active: boolean, pickedState: string) => void;
  /** Reset when parent form opens/closes */
  resetKey?: string | number | boolean;
  hint?: string;
  datalistId?: string;
};

export function LeadCityField({
  label = "City",
  required = false,
  cities,
  city,
  onCityChange,
  onResolved,
  onStatePickerChange,
  resetKey,
  hint,
  datalistId = "lead-bride-cities",
}: LeadCityFieldProps) {
  const [useStatePicker, setUseStatePicker] = useState(false);
  const [pickedState, setPickedState] = useState("");

  const stateOptions = useMemo(
    () => uniqueStatesFromCatalog(cities),
    [cities],
  );

  useEffect(() => {
    setUseStatePicker(false);
    setPickedState("");
    onStatePickerChange?.(false, "");
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function switchToStateMode() {
    setUseStatePicker(true);
    setPickedState("");
    onResolved(null, false);
    onStatePickerChange?.(true, "");
  }

  function switchToCityList() {
    setUseStatePicker(false);
    setPickedState("");
    onCityChange("");
    onResolved(null, false);
    onStatePickerChange?.(false, "");
  }

  function handleCatalogCityChange(value: string) {
    onCityChange(value);
    const resolved = resolveLocationFromCatalog(value, cities);
    if (resolved) {
      onResolved(
        { state: resolved.state, region: resolved.region },
        true,
      );
    } else {
      onResolved(null, false);
    }
  }

  function handleStatePick(state: string) {
    setPickedState(state);
    onStatePickerChange?.(true, state);
    const region = regionForState(state, cities);
    if (region) {
      onResolved({ state, region }, true);
    } else {
      onResolved(null, false);
    }
  }

  const regionLabel = (r: Region) =>
    REGIONS.find((x) => x.value === r)?.label ?? r;

  if (useStatePicker) {
    const region = pickedState ? regionForState(pickedState, cities) : null;
    return (
      <div className="space-y-2">
        <Input
          label={required ? `${label} name *` : `${label} name`}
          value={city}
          placeholder="Type the city the bride mentioned"
          onChange={(e) => onCityChange(e.target.value)}
        />
        <Select
          label="State *"
          value={pickedState}
          onChange={(e) => handleStatePick(e.target.value)}
          options={[
            { value: "", label: "Select state…" },
            ...stateOptions.map((s) => ({
              value: s.state,
              label: `${s.state} (${regionLabel(s.region)})`,
            })),
          ]}
        />
        {pickedState && region ? (
          <p className="text-xs text-slate-muted">
            Region: <strong>{regionLabel(region)}</strong> (from {pickedState})
          </p>
        ) : null}
        <button
          type="button"
          className="text-xs font-medium text-accent hover:underline"
          onClick={switchToCityList}
        >
          Back to city list
        </button>
      </div>
    );
  }

  return (
    <div>
      <Input
        label={required ? `${label} *` : label}
        list={datalistId}
        value={city}
        onChange={(e) => handleCatalogCityChange(e.target.value)}
      />
      <datalist id={datalistId}>
        {cities.map((c) => (
          <option key={c.city} value={c.city} />
        ))}
      </datalist>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-xs text-slate-muted">
          {hint ?? "Pick from list, or state name (Goa, Kerala)"}
        </p>
        <button
          type="button"
          className="text-xs font-medium text-accent hover:underline"
          onClick={switchToStateMode}
        >
          City not in list? Select state
        </button>
      </div>
    </div>
  );
}
