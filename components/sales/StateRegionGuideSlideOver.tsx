"use client";

import { useEffect, useMemo, useState } from "react";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { REGION_OPTIONS } from "@/lib/mua-region";
import type { CityRegion, Region } from "@/lib/types";

export function buildStatesByRegion(cityOptions: CityRegion[]) {
  const map = new Map<Region, Set<string>>();
  for (const r of REGION_OPTIONS) map.set(r.value, new Set());
  for (const c of cityOptions) {
    if (!c.state?.trim()) continue;
    map.get(c.region as Region)?.add(c.state.trim());
  }
  return REGION_OPTIONS.map((r) => ({
    region: r.value,
    label: r.label,
    states: [...(map.get(r.value) ?? [])].sort((a, b) => a.localeCompare(b)),
  }));
}

export function StateRegionGuideTrigger({
  cityOptions,
  className,
}: {
  cityOptions: CityRegion[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const groups = useMemo(() => buildStatesByRegion(cityOptions), [cityOptions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        states: g.states.filter(
          (s) =>
            s.toLowerCase().includes(q) || g.label.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.states.length > 0);
  }, [groups, query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-accent hover:bg-accent/5 hover:underline"
        }
        aria-haspopup="dialog"
      >
        <HelpCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        States & regions guide
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal
            aria-labelledby="state-region-guide-title"
            className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h2
                  id="state-region-guide-title"
                  className="text-base font-semibold text-brand"
                >
                  States by region
                </h2>
                <p className="mt-0.5 text-xs text-slate-muted">
                  Reference from the city catalog. Regions auto-fill when you pick
                  states in plan details.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                aria-label="Close guide"
              >
                ✕
              </Button>
            </div>

            <div className="border-b border-slate-100 px-4 py-2">
              <Input
                placeholder="Search state or region…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search states or regions"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {cityOptions.length === 0 ? (
                <p className="text-sm text-slate-muted">Loading reference…</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-slate-muted">No matches.</p>
              ) : (
                <div className="space-y-4">
                  {filtered.map((g) => (
                    <section key={g.region}>
                      <h3 className="mb-1.5 text-sm font-semibold text-brand">
                        {g.label}
                      </h3>
                      <ul className="space-y-1">
                        {g.states.map((state) => (
                          <li
                            key={`${g.region}-${state}`}
                            className="rounded-md bg-slate-50 px-2.5 py-1 text-sm text-slate-700"
                          >
                            {state}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
