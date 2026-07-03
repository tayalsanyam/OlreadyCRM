"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Region } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface CeremonyEntry {
  name: string;
  budget: number | null;
  date: string | null;
  description: string | null;
  location: string | null;
  region: Region | null;
}

export const CEREMONY_OPTIONS = [
  "Haldi",
  "Mehndi",
  "Sangeet",
  "Wedding",
  "Reception",
];

export const CEREMONY_ICON: Record<string, string> = {
  Haldi: "🌿",
  Mehndi: "💐",
  Wedding: "💍",
  Sangeet: "🎵",
  Reception: "🎊",
};

export function ceremonyIcon(name: string): string {
  return CEREMONY_ICON[name] ?? "📅";
}

interface CeremonyBudgetFieldsProps {
  ceremonies: CeremonyEntry[];
  onChange: (next: CeremonyEntry[]) => void;
  quickOptions?: string[];
  cityOptions?: string[];
  /** When true, ceremony date inputs are marked required (admin create / verify). */
  requireCeremonyDates?: boolean;
  requireCeremonyLocations?: boolean;
  datesHint?: string;
}

export function CeremonyBudgetFields({
  ceremonies,
  onChange,
  quickOptions = CEREMONY_OPTIONS,
  requireCeremonyDates = false,
  requireCeremonyLocations = false,
  datesHint,
  cityOptions = [],
}: CeremonyBudgetFieldsProps) {
  const [customName, setCustomName] = useState("");
  const [customBudget, setCustomBudget] = useState("");
  const [customDate, setCustomDate] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);

  function toggleQuick(name: string) {
    const exists = ceremonies.some((c) => c.name === name);
    if (exists) {
      onChange(ceremonies.filter((c) => c.name !== name));
    } else {
      onChange([
        ...ceremonies,
        { name, budget: null, date: null, description: null, location: null, region: null },
      ]);
    }
  }

  function parseBudgetInput(raw: string): number | null {
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function updateBudget(index: number, raw: string) {
    const next = [...ceremonies];
    next[index] = {
      ...next[index],
      budget: parseBudgetInput(raw),
    };
    onChange(next);
  }

  function updateDate(index: number, raw: string) {
    const next = [...ceremonies];
    next[index] = {
      ...next[index],
      date: raw === "" ? null : raw,
    };
    onChange(next);
  }

  function updateLocation(index: number, raw: string) {
    const next = [...ceremonies];
    next[index] = {
      ...next[index],
      location: raw.trim() === "" ? null : raw.trim(),
    };
    onChange(next);
  }

  function updateDescription(index: number, raw: string) {
    const next = [...ceremonies];
    next[index] = {
      ...next[index],
      description: raw.trim() === "" ? null : raw,
    };
    onChange(next);
  }

  function removeAt(index: number) {
    onChange(ceremonies.filter((_, i) => i !== index));
  }

  function addCustom() {
    const name = customName.trim();
    if (!name) return;
    if (ceremonies.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return;
    }
    onChange([
      ...ceremonies,
      {
        name,
        budget: parseBudgetInput(customBudget),
        date: customDate === "" ? null : customDate,
        description: customDescription.trim() === "" ? null : customDescription.trim(),
        location: null,
        region: null,
      },
    ]);
    setCustomName("");
    setCustomBudget("");
    setCustomDate("");
    setCustomDescription("");
    setAddingCustom(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium text-brand">Ceremonies</p>
        {datesHint && (
          <p className="mb-2 text-xs text-slate-muted">{datesHint}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {quickOptions.map((c) => {
            const active = ceremonies.some((x) => x.name === c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleQuick(c)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  active
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-slate-200 text-slate-muted"
                )}
              >
                {ceremonyIcon(c)} {c}
              </button>
            );
          })}
        </div>
      </div>

      {ceremonies.length > 0 && (
        <ul className="space-y-2">
          {ceremonies.map((c, i) => (
            <li
              key={`${c.name}-${i}`}
              className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-[100px] text-sm font-medium text-brand">
                  {ceremonyIcon(c.name)} {c.name}
                </span>
                <label className="flex flex-1 items-center gap-2 text-sm text-slate-muted">
                  Budget:
                  <input
                    type="number"
                    className="w-full max-w-[140px] rounded border border-slate-200 px-2 py-1 text-sm text-text"
                    placeholder="Leave blank if unknown"
                    value={c.budget ?? ""}
                    onChange={(e) => updateBudget(i, e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="text-slate-400 hover:text-red-600"
                  onClick={() => removeAt(i)}
                  aria-label={`Remove ${c.name}`}
                >
                  ×
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-muted">
                  Date{requireCeremonyDates ? " *" : ""}:
                  <input
                    type="date"
                    required={requireCeremonyDates}
                    className="rounded border border-slate-200 px-2 py-1 text-sm text-text"
                    value={c.date ?? ""}
                    onChange={(e) => updateDate(i, e.target.value)}
                  />
                </label>
                <label className="flex min-w-[160px] flex-1 items-center gap-2 text-sm text-slate-muted">
                  Location{requireCeremonyLocations ? " *" : ""}:
                  <input
                    type="text"
                    list={cityOptions.length ? "ceremony-cities" : undefined}
                    required={requireCeremonyLocations}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-sm text-text"
                    placeholder="City / venue"
                    value={c.location ?? ""}
                    onChange={(e) => updateLocation(i, e.target.value)}
                  />
                </label>
                {c.region && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium capitalize text-slate-700">
                    {c.region}
                  </span>
                )}
              </div>
              {cityOptions.length > 0 && (
                <datalist id="ceremony-cities">
                  {cityOptions.map((city) => (
                    <option key={city} value={city} />
                  ))}
                </datalist>
              )}
              <Input
                label="Description (optional)"
                value={c.description ?? ""}
                onChange={(e) => updateDescription(i, e.target.value)}
                placeholder="Venue, timing, notes…"
                className="mt-2"
              />
            </li>
          ))}
        </ul>
      )}

      {!addingCustom ? (
        <button
          type="button"
          className="text-sm font-medium text-accent hover:underline"
          onClick={() => setAddingCustom(true)}
        >
          + Add ceremony
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <Input
              label="Ceremony name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="min-w-[160px] flex-1"
            />
            <Input
              label="Budget"
              type="number"
              value={customBudget}
              onChange={(e) => setCustomBudget(e.target.value)}
              className="w-32"
            />
            <Input
              label="Date"
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="w-36"
            />
          </div>
          <Input
            label="Description (optional)"
            value={customDescription}
            onChange={(e) => setCustomDescription(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" type="button" onClick={addCustom}>
              Add
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                setAddingCustom(false);
                setCustomName("");
                setCustomBudget("");
                setCustomDate("");
                setCustomDescription("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
