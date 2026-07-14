"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { DATE_RANGE_PRESETS } from "@/lib/date-range";
import type { DateRangeFilterValue } from "@/lib/types";

interface DateRangeFilterProps {
  value: DateRangeFilterValue;
  onChange: (value: DateRangeFilterValue) => void;
}

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const [customOpen, setCustomOpen] = useState(value.mode === "range");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange({ mode: "all" })}
        className={cn(
          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
          value.mode === "all"
            ? "border-accent bg-accent text-white"
            : "border-slate-200 bg-white text-slate-muted hover:border-slate-300"
        )}
      >
        All time
      </button>
      {DATE_RANGE_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onChange({ mode: "preset", preset: preset.id })}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            value.mode === "preset" && value.preset === preset.id
              ? "border-accent bg-accent text-white"
              : "border-slate-200 bg-white text-slate-muted hover:border-slate-300"
          )}
        >
          {preset.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          setCustomOpen(true);
          onChange({
            mode: "range",
            from: value.from ?? "",
            to: value.to ?? "",
          });
        }}
        className={cn(
          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
          value.mode === "range"
            ? "border-brand bg-brand text-white"
            : "border-slate-200 bg-white text-slate-muted hover:border-slate-300"
        )}
      >
        Custom
      </button>
      {customOpen && value.mode === "range" && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={value.from ?? ""}
            onChange={(e) =>
              onChange({ ...value, mode: "range", from: e.target.value })
            }
            className="h-8 rounded-lg border border-slate-200 px-2 text-xs"
          />
          <span className="text-xs text-slate-muted">to</span>
          <input
            type="date"
            value={value.to ?? ""}
            onChange={(e) =>
              onChange({ ...value, mode: "range", to: e.target.value })
            }
            className="h-8 rounded-lg border border-slate-200 px-2 text-xs"
          />
        </div>
      )}
    </div>
  );
}
