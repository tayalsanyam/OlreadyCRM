"use client";

import { ALL_REGIONS, REGION_OPTIONS } from "@/lib/mua-region";
import type { Region } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MuaRegionPickerProps {
  value: Region[];
  onChange: (regions: Region[]) => void;
  label?: string;
  className?: string;
}

export function MuaRegionPicker({
  value,
  onChange,
  label = "Regions",
  className,
}: MuaRegionPickerProps) {
  const selected = value ?? [];
  const allSelected = ALL_REGIONS.every((r) => selected.includes(r));

  function toggleAll() {
    onChange(allSelected ? [] : [...ALL_REGIONS]);
  }

  function toggleRegion(region: Region) {
    if (selected.includes(region)) {
      onChange(selected.filter((r) => r !== region));
    } else {
      onChange([...selected, region]);
    }
  }

  return (
    <fieldset className={cn("space-y-2", className)}>
      <legend className="text-sm font-medium text-text">{label} *</legend>
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="rounded border-slate-300"
        />
        <span className="font-medium">All regions</span>
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {REGION_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
              selected.includes(opt.value)
                ? "border-accent bg-accent/5"
                : "border-slate-200"
            )}
          >
            <input
              type="checkbox"
              checked={selected.includes(opt.value)}
              onChange={() => toggleRegion(opt.value)}
              className="rounded border-slate-300"
            />
            {opt.label}
          </label>
        ))}
      </div>
      {selected.length === 0 && (
        <p className="text-xs text-red-600">Select at least one region</p>
      )}
    </fieldset>
  );
}
