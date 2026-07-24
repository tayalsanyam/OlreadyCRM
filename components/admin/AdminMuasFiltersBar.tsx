"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  ADMIN_MUA_SEGMENT_LABELS,
  type AdminMuaAddedDateBasis,
  type AdminMuaSegment,
} from "@/lib/admin-muas-query";
import {
  ADMIN_PLAN_TAG_LABELS,
  ADMIN_PLAN_TAG_OPTIONS,
  type AdminPlanTag,
} from "@/lib/admin-plan-tag";
import { REGION_OPTIONS } from "@/lib/mua-region";
import { MUA_SOURCE_OPTIONS, type MuaSource } from "@/lib/mua-source";
import { mapAssignableStaffFromApi } from "@/lib/sales-pipeline-assignee";
import { PLAN_TIER_LABELS, type CityRegion, type PlanTier, type Region } from "@/lib/types";
import { cn } from "@/lib/utils";

const EXPIRY_OPTIONS = [
  ["all", "All"],
  ["active", "Active"],
  ["expiring", "Expiring ≤30d"],
  ["expired", "Expired"],
  ["none", "No plan"],
] as const;

type ExpiryFilter = (typeof EXPIRY_OPTIONS)[number][0];

const ROSTER_STATUS_OPTIONS = [
  ["all", "All"],
  ["active", "Active"],
  ["inactive", "Inactive"],
] as const;

type RosterStatusFilter = (typeof ROSTER_STATUS_OPTIONS)[number][0];

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

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={cn("h-4 w-4 text-slate-muted transition-transform", open && "rotate-180")}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
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
  className,
  size = "default",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  size?: "default" | "sm";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full font-medium transition-all",
        size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
        active
          ? "bg-brand text-white shadow-sm ring-1 ring-brand/20"
          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

function FilterRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4", className)}>
      <span className="shrink-0 pt-1.5 text-xs font-medium text-slate-500 sm:w-24">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function ActivePill({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-brand">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 hover:bg-brand/15"
        aria-label={`Remove ${label} filter`}
      >
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path
            d="M3 3l6 6M9 3 3 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </span>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | null;
  options: { id: T; label: string }[];
  onChange: (id: T | null) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5 ring-1 ring-slate-200/80">
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(active ? null : opt.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
              active
                ? "bg-white text-brand shadow-sm"
                : "text-slate-600 hover:text-brand",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

type AllMuasFiltersProps = {
  variant: "all";
  searchQ: string;
  onSearchQChange: (v: string) => void;
  onSearchApply: () => void;
  segment: AdminMuaSegment | "all";
  onSegmentChange: (v: AdminMuaSegment | "all") => void;
  tag: AdminPlanTag | "all";
  onTagChange: (v: AdminPlanTag | "all") => void;
  region: Region[];
  onRegionChange: (v: Region[]) => void;
  sources: MuaSource[];
  onSourcesChange: (v: MuaSource[]) => void;
  tier: string;
  onTierChange: (v: string) => void;
  expiryStatus: ExpiryFilter;
  onExpiryChange: (v: ExpiryFilter) => void;
  rosterStatus: RosterStatusFilter;
  onRosterStatusChange: (v: RosterStatusFilter) => void;
  winBack: boolean;
  onWinBackChange: (v: boolean) => void;
  addedDateBasis: AdminMuaAddedDateBasis | null;
  onAddedDateBasisChange: (v: AdminMuaAddedDateBasis | null) => void;
  addedFrom: string;
  onAddedFromChange: (v: string) => void;
  addedTo: string;
  onAddedToChange: (v: string) => void;
  planRm: string;
  onPlanRmChange: (v: string) => void;
  planRmOptions: { id: string; name: string; region: string }[];
  resultCount: number;
  totalCount: number;
  loading?: boolean;
  hasServerFilters: boolean;
  onClearServerFilters: () => void;
  onClearClientFilters: () => void;
  hasClientFilters: boolean;
};

type PlanFiltersProps = {
  variant: "plans";
  search: string;
  onSearchChange: (v: string) => void;
  region: Region[];
  onRegionChange: (v: Region[]) => void;
  tierFilters: PlanTier[];
  onTierToggle: (tier: PlanTier) => void;
  status: ExpiryFilter;
  onStatusChange: (v: ExpiryFilter) => void;
  resultCount: number;
  totalCount: number;
  onClear: () => void;
  hasActiveFilters: boolean;
  planRm: string;
  onPlanRmChange: (v: string) => void;
  planRmOptions: { id: string; name: string; region: string }[];
  salesRmStaffId: string;
  onSalesRmStaffIdChange: (v: string) => void;
  dealClosedSalesRmStaffId: string;
  onDealClosedSalesRmStaffIdChange: (v: string) => void;
  state: string;
  onStateChange: (v: string) => void;
};

type Props = AllMuasFiltersProps | PlanFiltersProps;

function toggleRegion(list: Region[], value: Region): Region[] {
  return list.includes(value)
    ? list.filter((r) => r !== value)
    : [...list, value];
}

function toggleSource(list: MuaSource[], value: MuaSource): MuaSource[] {
  return list.includes(value)
    ? list.filter((s) => s !== value)
    : [...list, value];
}

function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function PlanRmSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string; region: string }[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent",
        className,
      )}
      aria-label="Filter by Plan RM"
    >
      <option value="">All Plan RMs</option>
      <option value="none">No Plan RM assigned</option>
      {options.map((rm) => (
        <option key={rm.id} value={rm.id}>
          {rm.name} ({rm.region})
        </option>
      ))}
    </select>
  );
}

function AllMuasFiltersBar(props: AllMuasFiltersProps) {
  const {
    searchQ,
    onSearchQChange,
    onSearchApply,
    segment,
    onSegmentChange,
    tag,
    onTagChange,
    region,
    onRegionChange,
    sources,
    onSourcesChange,
    tier,
    onTierChange,
    expiryStatus,
    onExpiryChange,
    rosterStatus,
    onRosterStatusChange,
    winBack,
    onWinBackChange,
    addedDateBasis,
    onAddedDateBasisChange,
    addedFrom,
    onAddedFromChange,
    addedTo,
    onAddedToChange,
    planRm,
    onPlanRmChange,
    planRmOptions,
    resultCount,
    loading,
    hasServerFilters,
    onClearServerFilters,
    onClearClientFilters,
    hasClientFilters,
  } = props;

  const hasAny = hasServerFilters || hasClientFilters;
  const hasAddedDateFilter = Boolean(addedDateBasis && (addedFrom || addedTo));
  const hasAdvancedDefaults =
    segment === "all" &&
    tag === "all" &&
    region.length === 0 &&
    sources.length === 0 &&
    !tier &&
    expiryStatus === "all";

  const [advancedOpen, setAdvancedOpen] = useState(!hasAdvancedDefaults);

  const activePills = useMemo(() => {
    const pills: { label: string; onRemove: () => void }[] = [];
    if (hasServerFilters) {
      pills.push({ label: "Search", onRemove: onClearServerFilters });
    }
    if (rosterStatus !== "active") {
      pills.push({
        label: `Roster: ${rosterStatus}`,
        onRemove: () => onRosterStatusChange("active"),
      });
    }
    if (winBack) {
      pills.push({
        label: "Re-engage cohort",
        onRemove: () => onWinBackChange(false),
      });
    }
    if (segment !== "all") {
      pills.push({
        label: ADMIN_MUA_SEGMENT_LABELS[segment],
        onRemove: () => onSegmentChange("all"),
      });
    }
    if (tag !== "all") {
      pills.push({
        label: ADMIN_PLAN_TAG_LABELS[tag],
        onRemove: () => onTagChange("all"),
      });
    }
    region.forEach((r) => {
      const label = REGION_OPTIONS.find((o) => o.value === r)?.label ?? r;
      pills.push({
        label,
        onRemove: () => onRegionChange(region.filter((x) => x !== r)),
      });
    });
    sources.forEach((s) => {
      pills.push({
        label: `Source: ${s}`,
        onRemove: () => onSourcesChange(sources.filter((x) => x !== s)),
      });
    });
    if (tier) {
      pills.push({
        label: PLAN_TIER_LABELS[tier as PlanTier],
        onRemove: () => onTierChange(""),
      });
    }
    if (expiryStatus !== "all") {
      const label = EXPIRY_OPTIONS.find(([id]) => id === expiryStatus)?.[1] ?? expiryStatus;
      pills.push({
        label: `Plan: ${label}`,
        onRemove: () => onExpiryChange("all"),
      });
    }
    if (hasAddedDateFilter && addedDateBasis) {
      const basis = addedDateBasis === "joined" ? "Joined" : "Created";
      const from = addedFrom ? formatIsoDate(addedFrom) : "…";
      const to = addedTo ? formatIsoDate(addedTo) : "…";
      pills.push({
        label: `${basis} ${from} – ${to}`,
        onRemove: () => {
          onAddedDateBasisChange(null);
          onAddedFromChange("");
          onAddedToChange("");
        },
      });
    }
    if (planRm === "none") {
      pills.push({
        label: "No Plan RM",
        onRemove: () => onPlanRmChange(""),
      });
    } else if (planRm) {
      const rm = planRmOptions.find((r) => r.id === planRm);
      pills.push({
        label: `Plan RM: ${rm?.name ?? "Selected"}`,
        onRemove: () => onPlanRmChange(""),
      });
    }
    return pills;
  }, [
    hasServerFilters,
    rosterStatus,
    winBack,
    segment,
    tag,
    region,
    sources,
    tier,
    expiryStatus,
    hasAddedDateFilter,
    addedDateBasis,
    addedFrom,
    addedTo,
    onClearServerFilters,
    onSegmentChange,
    onTagChange,
    onRegionChange,
    onSourcesChange,
    onTierChange,
    onExpiryChange,
    onRosterStatusChange,
    onWinBackChange,
    onAddedDateBasisChange,
    onAddedFromChange,
    onAddedToChange,
    planRm,
    onPlanRmChange,
    planRmOptions,
  ]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-muted" />
            <input
              type="search"
              value={searchQ}
              onChange={(e) => onSearchQChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearchApply();
              }}
              placeholder="Search name, phone, city, or ID…"
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={onSearchApply}>
              Search
            </Button>
            <div className="hidden h-6 w-px bg-slate-200 sm:block" />
            <div className="flex items-baseline gap-1.5 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
              <span className="text-lg font-semibold tabular-nums text-brand">
                {loading ? "…" : resultCount.toLocaleString("en-IN")}
              </span>
              <span className="text-xs text-slate-muted">
                {hasAddedDateFilter ? "in period" : "results"}
              </span>
            </div>
          </div>
        </div>

        {activePills.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {activePills.map((pill) => (
              <ActivePill key={pill.label} label={pill.label} onRemove={pill.onRemove} />
            ))}
            {hasAny && (
              <button
                type="button"
                onClick={() => {
                  onClearServerFilters();
                  onClearClientFilters();
                }}
                className="text-xs font-medium text-accent hover:underline"
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-0 divide-y divide-slate-100">
        <div className="space-y-3 px-4 py-3">
          <FilterRow label="Roster">
            {ROSTER_STATUS_OPTIONS.map(([id, label]) => (
              <FilterChip
                key={id}
                active={rosterStatus === id}
                onClick={() => onRosterStatusChange(id)}
              >
                {label}
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label="Win-back">
            <FilterChip active={winBack} onClick={() => onWinBackChange(!winBack)}>
              Re-engage cohort
            </FilterChip>
          </FilterRow>
          <FilterRow label="Plan status">
            {EXPIRY_OPTIONS.map(([id, label]) => (
              <FilterChip
                key={id}
                active={expiryStatus === id}
                onClick={() => onExpiryChange(id)}
              >
                {label}
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label="Plan RM">
            <PlanRmSelect
              value={planRm}
              onChange={onPlanRmChange}
              options={planRmOptions}
              className="max-w-xs"
            />
          </FilterRow>
          <FilterRow label="Source">
            <FilterChip active={sources.length === 0} onClick={() => onSourcesChange([])}>
              All
            </FilterChip>
            {MUA_SOURCE_OPTIONS.map((value) => (
              <FilterChip
                key={value}
                active={sources.includes(value)}
                onClick={() => onSourcesChange(toggleSource(sources, value))}
              >
                {value}
              </FilterChip>
            ))}
          </FilterRow>
        </div>

        <div className="px-4 py-3">
          <div
            className={cn(
              "rounded-lg border px-3 py-3 transition-colors sm:px-4",
              hasAddedDateFilter
                ? "border-brand/25 bg-brand/[0.03]"
                : "border-slate-200 bg-slate-50/50",
            )}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-brand">New MUAs in period</p>
                <p className="mt-0.5 text-xs text-slate-muted">
                  Count how many were added in a date range
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <SegmentedControl
                  value={addedDateBasis}
                  options={[
                    { id: "created", label: "System created" },
                    { id: "joined", label: "Join date" },
                  ]}
                  onChange={onAddedDateBasisChange}
                />
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={addedFrom}
                    onChange={(e) => onAddedFromChange(e.target.value)}
                    disabled={!addedDateBasis}
                    aria-label="From date"
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-sm",
                      addedDateBasis
                        ? "border-slate-200 bg-white focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                        : "cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400",
                    )}
                  />
                  <span className="text-xs text-slate-muted">to</span>
                  <input
                    type="date"
                    value={addedTo}
                    onChange={(e) => onAddedToChange(e.target.value)}
                    disabled={!addedDateBasis}
                    aria-label="To date"
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-sm",
                      addedDateBasis
                        ? "border-slate-200 bg-white focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                        : "cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400",
                    )}
                  />
                  {hasAddedDateFilter && (
                    <button
                      type="button"
                      onClick={() => {
                        onAddedDateBasisChange(null);
                        onAddedFromChange("");
                        onAddedToChange("");
                      }}
                      className="text-xs font-medium text-slate-muted hover:text-brand"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-2">
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-left hover:bg-slate-50"
          >
            <span className="text-sm font-medium text-brand">
              More filters
              {!hasAdvancedDefaults && (
                <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                  Active
                </span>
              )}
            </span>
            <ChevronIcon open={advancedOpen} />
          </button>
          {advancedOpen && (
            <div className="space-y-3 pb-3 pt-1">
              <FilterRow label="Segment">
                {(
                  [
                    ["all", "All"],
                    ["potential", ADMIN_MUA_SEGMENT_LABELS.potential],
                    ["customer", ADMIN_MUA_SEGMENT_LABELS.customer],
                    ["plan_customer", ADMIN_MUA_SEGMENT_LABELS.plan_customer],
                  ] as const
                ).map(([id, label]) => (
                  <FilterChip
                    key={id}
                    active={segment === id}
                    onClick={() => onSegmentChange(id)}
                    size="sm"
                  >
                    {label}
                  </FilterChip>
                ))}
              </FilterRow>

              <FilterRow label="Admin tag">
                <FilterChip active={tag === "all"} onClick={() => onTagChange("all")} size="sm">
                  All
                </FilterChip>
                {ADMIN_PLAN_TAG_OPTIONS.map((t) => (
                  <FilterChip
                    key={t}
                    active={tag === t}
                    onClick={() => onTagChange(t)}
                    size="sm"
                  >
                    {ADMIN_PLAN_TAG_LABELS[t]}
                  </FilterChip>
                ))}
              </FilterRow>

              <FilterRow label="Region">
                <FilterChip active={region.length === 0} onClick={() => onRegionChange([])} size="sm">
                  All
                </FilterChip>
                {REGION_OPTIONS.map(({ value, label }) => (
                  <FilterChip
                    key={value}
                    active={region.includes(value)}
                    onClick={() => onRegionChange(toggleRegion(region, value))}
                    size="sm"
                  >
                    {label}
                  </FilterChip>
                ))}
              </FilterRow>

              <FilterRow label="Plan tier">
                <FilterChip active={!tier} onClick={() => onTierChange("")} size="sm">
                  All
                </FilterChip>
                {(Object.keys(PLAN_TIER_LABELS) as PlanTier[]).map((t) => (
                  <FilterChip
                    key={t}
                    active={tier === t}
                    onClick={() => onTierChange(tier === t ? "" : t)}
                    size="sm"
                  >
                    {PLAN_TIER_LABELS[t]}
                  </FilterChip>
                ))}
              </FilterRow>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdminMuasFiltersBar(props: Props) {
  if (props.variant === "all") {
    return <AllMuasFiltersBar {...props} />;
  }
  return <PlanMuasFiltersBar {...props} />;
}

function PlanMuasFiltersBar(props: PlanFiltersProps) {
  const {
    search,
    onSearchChange,
    region,
    onRegionChange,
    tierFilters,
    onTierToggle,
    status,
    onStatusChange,
    resultCount,
    onClear,
    hasActiveFilters,
    planRm,
    onPlanRmChange,
    planRmOptions,
    salesRmStaffId,
    onSalesRmStaffIdChange,
    dealClosedSalesRmStaffId,
    onDealClosedSalesRmStaffIdChange,
    state,
    onStateChange,
  } = props;

  const [salesStaff, setSalesStaff] = useState<Array<{ id: string; name: string }>>([]);
  const [stateOptions, setStateOptions] = useState<string[]>([]);

  useEffect(() => {
    void fetch("/api/sales/assignable-rms")
      .then((r) => r.json())
      .then((json: { data?: Array<{ id: string; name: string; role: string }> }) => {
        setSalesStaff(mapAssignableStaffFromApi(json.data ?? []));
      });
    void fetch("/api/cities")
      .then((r) => r.json())
      .then((json: { data?: CityRegion[] }) => {
        const set = new Set<string>();
        for (const row of json.data ?? []) {
          if (row.state?.trim()) set.add(row.state.trim());
        }
        setStateOptions([...set].sort((a, b) => a.localeCompare(b)));
      });
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-brand">Filters</h2>
          <p className="text-xs text-slate-muted">
            {`${resultCount.toLocaleString("en-IN")} MUAs match current filters`}
          </p>
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-accent hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="space-y-4 p-4">
        <div className="relative max-w-md">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name or city…"
            className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <FilterRow label="Region">
            <FilterChip active={region.length === 0} onClick={() => onRegionChange([])}>
              All regions
            </FilterChip>
            {REGION_OPTIONS.map(({ value, label }) => (
              <FilterChip
                key={value}
                active={region.includes(value)}
                onClick={() => onRegionChange(toggleRegion(region, value))}
              >
                {label}
              </FilterChip>
            ))}
          </FilterRow>

          <FilterRow label="Plan tier">
            {(Object.keys(PLAN_TIER_LABELS) as PlanTier[]).map((t) => (
              <FilterChip
                key={t}
                active={tierFilters.includes(t)}
                onClick={() => onTierToggle(t)}
              >
                {PLAN_TIER_LABELS[t]}
              </FilterChip>
            ))}
          </FilterRow>
        </div>

        <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <FilterRow label="Plan RM">
            <PlanRmSelect
              value={planRm}
              onChange={onPlanRmChange}
              options={planRmOptions}
              className="max-w-sm"
            />
          </FilterRow>

          <FilterRow label="Assigned Sales RM">
            <Select
              label=""
              value={salesRmStaffId}
              onChange={(e) => onSalesRmStaffIdChange(e.target.value)}
              options={[
                { value: "", label: "Any assigned RM" },
                ...salesStaff.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </FilterRow>

          <FilterRow label="Deal closed Sales RM">
            <Select
              label=""
              value={dealClosedSalesRmStaffId}
              onChange={(e) => onDealClosedSalesRmStaffIdChange(e.target.value)}
              options={[
                { value: "", label: "Any closer" },
                ...salesStaff.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </FilterRow>
        </div>

        <FilterRow label="State">
          <Select
            label=""
            value={state}
            onChange={(e) => onStateChange(e.target.value)}
            options={[
              { value: "", label: "All states" },
              ...stateOptions.map((s) => ({ value: s, label: s })),
            ]}
            className="max-w-sm"
          />
        </FilterRow>

        <FilterRow label="Plan status">
          {EXPIRY_OPTIONS.map(([id, label]) => (
            <FilterChip
              key={id}
              active={status === id}
              onClick={() => onStatusChange(id)}
            >
              {id === "all" ? "All" : label}
            </FilterChip>
          ))}
        </FilterRow>
      </div>
    </div>
  );
}
