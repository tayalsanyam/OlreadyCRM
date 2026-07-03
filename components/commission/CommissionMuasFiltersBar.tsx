"use client";

import { useMemo, useState } from "react";
import {
  ADMIN_PLAN_TAG_LABELS,
  ADMIN_PLAN_TAG_OPTIONS,
  type AdminPlanTag,
} from "@/lib/admin-plan-tag";
import type { CommissionMuaExpiryFilter } from "@/lib/commission-muas-query";
import { REGION_OPTIONS } from "@/lib/mua-region";
import { PLAN_TIER_LABELS, type PlanTier, type Region } from "@/lib/types";
import { cn } from "@/lib/utils";

const EXPIRY_OPTIONS: { id: CommissionMuaExpiryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "expiring", label: "Expiring ≤30d" },
  { id: "expired", label: "Expired" },
  { id: "none", label: "No plan" },
];

const PLAN_TIERS = (Object.keys(PLAN_TIER_LABELS) as PlanTier[]).filter(
  (t) => t !== "prime"
);

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M9 3.5a5.5 5.5 0 1 0 3.47 9.79l3.2 3.2a.75.75 0 1 0 1.06-1.06l-3.2-3.2A5.5 5.5 0 0 0 9 3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-medium transition-all",
        active
          ? "bg-brand text-white shadow-sm ring-1 ring-brand/20"
          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
      )}
    >
      {children}
    </button>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
      <span className="shrink-0 pt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:w-24">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1">{children}</div>
    </div>
  );
}

function ActivePill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-brand">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 hover:bg-brand/15"
        aria-label={`Remove ${label} filter`}
      >
        ×
      </button>
    </span>
  );
}

function toggleRegion(list: Region[], r: Region): Region[] {
  return list.includes(r) ? list.filter((x) => x !== r) : [...list, r];
}

export type CommissionMuasFiltersState = {
  search: string;
  region: Region[];
  tier: PlanTier | "";
  expiry: CommissionMuaExpiryFilter;
  city: string;
  adminTag: AdminPlanTag | "all" | "untagged";
  pushedFrom: string;
  pushedTo: string;
  availableOnly: boolean;
};

const DEFAULT_FILTERS: CommissionMuasFiltersState = {
  search: "",
  region: [],
  tier: "",
  expiry: "all",
  city: "",
  adminTag: "all",
  pushedFrom: "",
  pushedTo: "",
  availableOnly: false,
};

export function CommissionMuasFiltersBar({
  filters,
  cityOptions,
  onChange,
  onApply,
}: {
  filters: CommissionMuasFiltersState;
  cityOptions: string[];
  onChange: (next: CommissionMuasFiltersState) => void;
  onApply: (next: CommissionMuasFiltersState) => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [searchDraft, setSearchDraft] = useState(filters.search);

  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n++;
    if (filters.region.length) n++;
    if (filters.tier) n++;
    if (filters.expiry !== "all") n++;
    if (filters.city) n++;
    if (filters.adminTag !== "all") n++;
    if (filters.pushedFrom || filters.pushedTo) n++;
    if (filters.availableOnly) n++;
    return n;
  }, [filters]);

  function apply(partial: Partial<CommissionMuasFiltersState>) {
    const next = { ...filters, ...partial };
    onChange(next);
    onApply(next);
  }

  function clearAll() {
    setSearchDraft("");
    const next = { ...DEFAULT_FILTERS };
    onChange(next);
    onApply(next);
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                apply({ search: searchDraft.trim() });
              }
            }}
            placeholder="Search by name, city, or phone…"
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand/20"
          />
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => {
              apply({ search: searchDraft.trim() });
            }}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-brand hover:bg-slate-50"
          >
            Filters{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>
        </div>
      </div>

      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-1">
          {filters.search.trim() ? (
            <ActivePill
              label={`Search: ${filters.search}`}
              onRemove={() => {
                setSearchDraft("");
                apply({ search: "" });
              }}
            />
          ) : null}
          {filters.region.map((r) => (
            <ActivePill
              key={r}
              label={REGION_OPTIONS.find((o) => o.value === r)?.label ?? r}
              onRemove={() => {
                apply({ region: filters.region.filter((x) => x !== r) });
              }}
            />
          ))}
          {filters.tier ? (
            <ActivePill
              label={`Plan: ${PLAN_TIER_LABELS[filters.tier]}`}
              onRemove={() => {
                apply({ tier: "" });
              }}
            />
          ) : null}
          {filters.expiry !== "all" ? (
            <ActivePill
              label={`Status: ${EXPIRY_OPTIONS.find((o) => o.id === filters.expiry)?.label}`}
              onRemove={() => {
                apply({ expiry: "all" });
              }}
            />
          ) : null}
          {filters.city ? (
            <ActivePill
              label={`City: ${filters.city}`}
              onRemove={() => {
                apply({ city: "" });
              }}
            />
          ) : null}
          {filters.adminTag !== "all" ? (
            <ActivePill
              label={
                filters.adminTag === "untagged"
                  ? "No admin tag"
                  : ADMIN_PLAN_TAG_LABELS[filters.adminTag]
              }
              onRemove={() => {
                apply({ adminTag: "all" });
              }}
            />
          ) : null}
          {filters.pushedFrom || filters.pushedTo ? (
            <ActivePill
              label={`Pushed: ${filters.pushedFrom || "…"} – ${filters.pushedTo || "…"}`}
              onRemove={() => {
                apply({ pushedFrom: "", pushedTo: "" });
              }}
            />
          ) : null}
          {filters.availableOnly ? (
            <ActivePill
              label="Available this week"
              onRemove={() => {
                apply({ availableOnly: false });
              }}
            />
          ) : null}
          <button
            type="button"
            onClick={clearAll}
            className="text-xs font-medium text-slate-muted hover:text-brand"
          >
            Clear all
          </button>
        </div>
      )}

      {filtersOpen && (
        <div className="space-y-3 px-4 pb-4">
          <FilterRow label="Region">
            <FilterChip
              active={filters.region.length === 0}
              onClick={() => {
                apply({ region: [] });
              }}
            >
              All India
            </FilterChip>
            {REGION_OPTIONS.map(({ value, label }) => (
              <FilterChip
                key={value}
                active={filters.region.includes(value)}
                onClick={() => {
                  apply({ region: toggleRegion(filters.region, value) });
                }}
              >
                {label}
              </FilterChip>
            ))}
          </FilterRow>

          <FilterRow label="Plan tier">
            <FilterChip
              active={!filters.tier}
              onClick={() => {
                apply({ tier: "" });
              }}
            >
              All
            </FilterChip>
            {PLAN_TIERS.map((t) => (
              <FilterChip
                key={t}
                active={filters.tier === t}
                onClick={() => {
                  apply({ tier: filters.tier === t ? "" : t });
                }}
              >
                {PLAN_TIER_LABELS[t]}
              </FilterChip>
            ))}
          </FilterRow>

          <FilterRow label="Plan status">
            {EXPIRY_OPTIONS.map(({ id, label }) => (
              <FilterChip
                key={id}
                active={filters.expiry === id}
                onClick={() => {
                  apply({ expiry: id });
                }}
              >
                {label}
              </FilterChip>
            ))}
          </FilterRow>

          <FilterRow label="Admin tag">
            <FilterChip
              active={filters.adminTag === "all"}
              onClick={() => {
                apply({ adminTag: "all" });
              }}
            >
              All
            </FilterChip>
            <FilterChip
              active={filters.adminTag === "untagged"}
              onClick={() => {
                apply({ adminTag: "untagged" });
              }}
            >
              Untagged
            </FilterChip>
            {ADMIN_PLAN_TAG_OPTIONS.filter((t) => t !== "hold").map((t) => (
              <FilterChip
                key={t}
                active={filters.adminTag === t}
                onClick={() => {
                  apply({ adminTag: t });
                }}
              >
                {ADMIN_PLAN_TAG_LABELS[t]}
              </FilterChip>
            ))}
          </FilterRow>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">City</span>
              <select
                value={filters.city}
                onChange={(e) => {
                  apply({ city: e.target.value });
                }}
                className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm"
              >
                <option value="">All cities</option>
                {cityOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                Last pushed from
              </span>
              <input
                type="date"
                value={filters.pushedFrom}
                onChange={(e) => {
                  apply({ pushedFrom: e.target.value });
                }}
                className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                Last pushed to
              </span>
              <input
                type="date"
                value={filters.pushedTo}
                onChange={(e) => {
                  apply({ pushedTo: e.target.value });
                }}
                className="h-9 w-full rounded-lg border border-slate-200 px-2 text-sm"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.availableOnly}
              onChange={(e) => {
                apply({ availableOnly: e.target.checked });
              }}
            />
            Available this week (under weekly cap)
          </label>
        </div>
      )}
    </div>
  );
}
