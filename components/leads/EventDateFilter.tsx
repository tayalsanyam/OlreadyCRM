"use client";

import { cn } from "@/lib/utils";
import {
  EVENT_DATE_PRESETS,
  type EventDateFilterValue,
} from "@/lib/event-date-range";

interface EventDateFilterProps {
  value: EventDateFilterValue;
  onChange: (value: EventDateFilterValue) => void;
  compact?: boolean;
}

export function EventDateFilter({
  value,
  onChange,
  compact = false,
}: EventDateFilterProps) {
  return (
    <div
      className={cn(
        "space-y-2",
        compact ? "" : "rounded-xl border border-slate-200 bg-white p-4",
      )}
    >
      {!compact && <p className="text-sm font-medium text-brand">Event date</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onChange({ mode: "all" })}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            value.mode === "all"
              ? "border-accent bg-accent text-white"
              : "border-slate-200 bg-white text-slate-muted hover:border-slate-300",
          )}
        >
          All dates
        </button>
        {EVENT_DATE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange({ mode: "preset", preset: preset.id })}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              value.mode === "preset" && value.preset === preset.id
                ? "border-accent bg-accent text-white"
                : "border-slate-200 bg-white text-slate-muted hover:border-slate-300",
            )}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              mode: "range",
              from: value.mode === "range" ? value.from : "",
              to: value.mode === "range" ? value.to : "",
            })
          }
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            value.mode === "range"
              ? "border-brand bg-brand text-white"
              : "border-slate-200 bg-white text-slate-muted hover:border-slate-300",
          )}
        >
          Custom range
        </button>
      </div>
      {value.mode === "range" && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <label className="flex flex-col gap-1 text-xs text-slate-muted">
            From
            <input
              type="date"
              value={value.from ?? ""}
              onChange={(e) =>
                onChange({
                  mode: "range",
                  from: e.target.value,
                  to: value.to,
                })
              }
              className="h-9 rounded-lg border border-slate-200 px-2 text-sm text-brand"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-muted">
            To
            <input
              type="date"
              value={value.to ?? ""}
              onChange={(e) =>
                onChange({
                  mode: "range",
                  from: value.from,
                  to: e.target.value,
                })
              }
              className="h-9 rounded-lg border border-slate-200 px-2 text-sm text-brand"
            />
          </label>
        </div>
      )}
    </div>
  );
}
