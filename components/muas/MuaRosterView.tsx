"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Columns3, LayoutGrid, List } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CapBar } from "@/components/muas/CapBar";
import { MuaCommsSlideOver } from "@/components/muas/MuaCommsSlideOver";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { cn } from "@/lib/utils";
import { REGION_OPTIONS } from "@/lib/mua-region";
import type { PlanTier, Region, RmMuaRosterItem } from "@/lib/types";
import { PLAN_TIER_LABELS } from "@/lib/types";
import { isMuaNotOnPlan } from "@/lib/mua-active-plan";

type ViewMode = "grid" | "list" | "kanban";
type ExpiryFilter = "all" | "active" | "expiring" | "expired" | "none";
type SortKey = "plan" | "name" | "expiry" | "cap" | "lastPushed";

const PLAN_TIER_ORDER: Record<PlanTier, number> = {
  highestPrivy: 1,
  phoenix2: 2,
  phoenix: 3,
  pro: 4,
  prime: 5,
};

const KANBAN_COLUMNS: { tier: PlanTier | null; label: string }[] = [
  { tier: "highestPrivy", label: PLAN_TIER_LABELS.highestPrivy },
  { tier: "phoenix2", label: "Phoenix 2" },
  { tier: "phoenix", label: "Phoenix" },
  { tier: "pro", label: "Pro" },
  { tier: "prime", label: "Prime" },
  { tier: null, label: "Unplanned" },
];

const PLAN_BADGE: Record<PlanTier, string> = {
  highestPrivy: "bg-amber-100 text-amber-900 border-amber-300",
  phoenix2: "bg-indigo-100 text-indigo-900 border-indigo-300",
  phoenix: "bg-blue-100 text-blue-800 border-blue-300",
  pro: "bg-slate-200 text-slate-800 border-slate-300",
  prime: "bg-gray-100 text-gray-600 border-gray-300",
};

const KANBAN_COLUMN_BG: Record<PlanTier | "unplanned", string> = {
  highestPrivy: "bg-amber-50",
  phoenix2: "bg-indigo-50",
  phoenix: "bg-blue-50",
  pro: "bg-slate-50",
  prime: "bg-gray-50",
  unplanned: "bg-white border border-dashed border-slate-300",
};

const KANBAN_HEADER_STRIP: Record<PlanTier | "unplanned", string> = {
  highestPrivy: "bg-amber-400",
  phoenix2: "bg-indigo-400",
  phoenix: "bg-blue-400",
  pro: "bg-slate-400",
  prime: "bg-gray-400",
  unplanned: "bg-slate-300",
};

const EXPIRY_CHIPS: { id: ExpiryFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "expiring", label: "Expiring ≤30d" },
  { id: "expired", label: "Expired" },
  { id: "none", label: "No Plan" },
];

function startOfWeekMonday(d: Date = new Date()): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function weekLabel(): string {
  const monday = startOfWeekMonday();
  return monday.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function expiryDays(planExpiry: string | null): number | null {
  if (!planExpiry) return null;
  return Math.ceil((new Date(planExpiry).getTime() - Date.now()) / 86400000);
}

function matchesExpiryFilter(m: RmMuaRosterItem, filter: ExpiryFilter): boolean {
  if (filter === "all") return true;
  const days = expiryDays(m.planExpiry);
  if (filter === "active") return !!m.planTier && days !== null && days > 0;
  if (filter === "expiring") return days !== null && days >= 0 && days <= 30;
  if (filter === "expired") return days !== null && days < 0;
  if (filter === "none") return isMuaNotOnPlan(m);
  return true;
}

function detailHref(apiPath: string, id: string): string {
  if (apiPath.includes("commission")) return `/commission/muas/${id}`;
  return `/rm/muas/${id}`;
}

function capBarColor(pct: number, atCap: boolean): string {
  if (atCap) return "bg-red-600";
  if (pct > 85) return "bg-red-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-emerald-500";
}

function lastPushedLabel(iso: string | null): string {
  const lastDays = daysAgo(iso);
  if (lastDays === null) return "never";
  if (lastDays === 0) return "today";
  return `${lastDays} days ago`;
}

function expiryListCell(m: RmMuaRosterItem): { text: string; className: string } {
  if (!m.planTier || !m.planExpiry) {
    return { text: "—", className: "text-slate-muted" };
  }
  const days = expiryDays(m.planExpiry);
  if (days === null) return { text: "—", className: "text-slate-muted" };
  if (days < 0) return { text: "Expired", className: "text-red-600 font-semibold" };
  if (days <= 30) {
    return {
      text: `${days}d`,
      className: "text-amber-600 font-medium",
    };
  }
  return {
    text: new Date(m.planExpiry).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    className: "text-emerald-700",
  };
}

function kanbanExpiryChip(m: RmMuaRosterItem): string | null {
  if (!m.planExpiry) return null;
  const days = expiryDays(m.planExpiry);
  if (days === null) return null;
  if (days < 0) return "Expired";
  if (days <= 7) return `${days} days`;
  if (days <= 30) return `${days}d`;
  return null;
}

export type MuaRosterTab = {
  id: string;
  label: string;
  apiPath: string;
  subtitle?: string;
  emptyMessage?: string;
};

export interface MuaRosterViewProps {
  apiPath: string;
  title: string;
  subtitle: string;
  emptyMessage: string;
  conversationsHref: string;
  rosterTabs?: MuaRosterTab[];
  /** When set with length > 1, shows region filter on the region roster tab */
  allowedRegions?: Region[];
}

export function MuaRosterView({
  apiPath,
  title,
  subtitle,
  emptyMessage,
  conversationsHref,
  rosterTabs,
  allowedRegions,
}: MuaRosterViewProps) {
  const [activeRosterTab, setActiveRosterTab] = useState(rosterTabs?.[0]?.id ?? "default");
  const [regionFilter, setRegionFilter] = useState<Region | "all">("all");
  const activeTabConfig = rosterTabs?.find((t) => t.id === activeRosterTab) ?? rosterTabs?.[0];
  const showRegionFilter =
    Boolean(allowedRegions && allowedRegions.length > 1) &&
    activeRosterTab !== "my_plan";
  const fetchPath = useMemo(() => {
    const base = activeTabConfig?.apiPath ?? apiPath;
    if (!showRegionFilter || regionFilter === "all") return base;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}region=${regionFilter}`;
  }, [activeTabConfig?.apiPath, apiPath, regionFilter, showRegionFilter]);
  const activeSubtitle = activeTabConfig?.subtitle ?? subtitle;
  const activeEmptyMessage = activeTabConfig?.emptyMessage ?? emptyMessage;
  const [muas, setMuas] = useState<RmMuaRosterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [commsMua, setCommsMua] = useState<{ id: string; name: string } | null>(
    null
  );
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mua-view-mode");
      if (saved === "grid" || saved === "list" || saved === "kanban") {
        return saved;
      }
    }
    return "grid";
  });
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("all");
  const [planTierFilters, setPlanTierFilters] = useState<PlanTier[]>([]);
  const [pushedFrom, setPushedFrom] = useState("");
  const [pushedTo, setPushedTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("plan");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const hasExtraFilters =
    planTierFilters.length > 0 || !!pushedFrom || !!pushedTo;
  const hasActiveFilters =
    expiryFilter !== "all" ||
    search.trim() !== "" ||
    hasExtraFilters;

  useEffect(() => {
    localStorage.setItem("mua-view-mode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    setLoading(true);
    void fetch(fetchPath)
      .then((r) => r.json())
      .then((json: { data: RmMuaRosterItem[] | null }) => {
        setMuas(json.data ?? []);
        setLoading(false);
      });
  }, [fetchPath]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromMs = pushedFrom ? new Date(pushedFrom).getTime() : null;
    const toMs = pushedTo
      ? new Date(`${pushedTo}T23:59:59.999`).getTime()
      : null;
    return muas.filter((m) => {
      if (!matchesExpiryFilter(m, expiryFilter)) return false;
      if (
        planTierFilters.length &&
        (!m.planTier || !planTierFilters.includes(m.planTier))
      ) {
        return false;
      }
      if (fromMs !== null || toMs !== null) {
        if (!m.lastPushed) return false;
        const pushedMs = new Date(m.lastPushed).getTime();
        if (fromMs !== null && pushedMs < fromMs) return false;
        if (toMs !== null && pushedMs > toMs) return false;
      }
      if (q && !m.name.toLowerCase().includes(q) && !m.city.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [muas, expiryFilter, planTierFilters, pushedFrom, pushedTo, search]);

  function clearFilters() {
    setExpiryFilter("all");
    setPlanTierFilters([]);
    setPushedFrom("");
    setPushedTo("");
    setSearch("");
  }

  const sortedList = useMemo(() => {
    const list = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      if (sortKey === "plan") {
        const ao = a.planTier ? PLAN_TIER_ORDER[a.planTier] : 99;
        const bo = b.planTier ? PLAN_TIER_ORDER[b.planTier] : 99;
        return (ao - bo) * dir || a.name.localeCompare(b.name);
      }
      if (sortKey === "name") {
        return a.name.localeCompare(b.name) * dir;
      }
      if (sortKey === "expiry") {
        const ad = expiryDays(a.planExpiry) ?? 9999;
        const bd = expiryDays(b.planExpiry) ?? 9999;
        return (ad - bd) * dir;
      }
      if (sortKey === "cap") {
        const ap = a.weeklyCap > 0 ? a.weeklyUsed / a.weeklyCap : 0;
        const bp = b.weeklyCap > 0 ? b.weeklyUsed / b.weeklyCap : 0;
        return (ap - bp) * dir;
      }
      if (sortKey === "lastPushed") {
        const ad = daysAgo(a.lastPushed) ?? 9999;
        const bd = daysAgo(b.lastPushed) ?? 9999;
        return (ad - bd) * dir;
      }
      return 0;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const summary = useMemo(() => {
    let atCap = 0;
    let active = 0;
    let awaiting = 0;
    for (const m of muas) {
      if (m.weeklyCap > 0 && m.weeklyUsed >= m.weeklyCap) atCap++;
      active += m.activeConversations;
      awaiting += m.awaitingClose;
    }
    return { atCap, active, awaiting };
  }, [muas]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : key === "plan" ? "asc" : "desc");
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">{title}</h1>
          <p className="text-sm text-slate-muted">{activeSubtitle}</p>
          {rosterTabs && rosterTabs.length > 1 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {rosterTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveRosterTab(tab.id)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                    activeRosterTab === tab.id
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-slate-200 bg-white text-slate-muted hover:border-slate-300"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : null}
          {showRegionFilter && allowedRegions ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Region</span>
              <button
                type="button"
                onClick={() => setRegionFilter("all")}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  regionFilter === "all"
                    ? "bg-brand text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                All regions
              </button>
              {allowedRegions.map((r) => {
                const label = REGION_OPTIONS.find((o) => o.value === r)?.label ?? r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRegionFilter(r)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      regionFilter === r
                        ? "bg-brand text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-200">
            {(
              [
                ["grid", LayoutGrid, "Grid"],
                ["list", List, "List"],
                ["kanban", Columns3, "Kanban"],
              ] as const
            ).map(([mode, Icon, label]) => (
              <button
                key={mode}
                type="button"
                title={label}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors",
                  viewMode === mode
                    ? "bg-brand text-white"
                    : "border-r border-slate-200 bg-white text-slate-muted last:border-r-0"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-muted">
            Week of {weekLabel()}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <span className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800">
          {summary.atCap} MUAs at cap this week
        </span>
        <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800">
          {summary.active} active conversations
        </span>
        <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900">
          {summary.awaiting} awaiting close
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search name or city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[180px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          {EXPIRY_CHIPS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setExpiryFilter(id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                expiryFilter === id
                  ? "bg-accent text-white"
                  : "border border-slate-200 text-slate-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs font-medium text-accent hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-brand"
        >
          <span>
            More filters
            {hasExtraFilters && (
              <span className="ml-2 text-xs font-normal text-accent">active</span>
            )}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-slate-muted transition-transform",
              filtersOpen && "rotate-180"
            )}
          />
        </button>
        {filtersOpen && (
          <div className="space-y-3 border-t border-slate-100 px-3 py-3">
            <div>
              <p className="mb-2 text-xs font-medium text-slate-muted">Plan tier</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(PLAN_TIER_LABELS) as PlanTier[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setPlanTierFilters((prev) =>
                        prev.includes(t)
                          ? prev.filter((x) => x !== t)
                          : [...prev, t]
                      )
                    }
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      planTierFilters.includes(t)
                        ? PLAN_BADGE[t]
                        : "border-slate-200 text-slate-muted"
                    )}
                  >
                    {PLAN_TIER_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-slate-muted">
                <span className="mb-1 block">Pushed from</span>
                <input
                  type="date"
                  value={pushedFrom}
                  onChange={(e) => setPushedFrom(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-slate-muted">
                <span className="mb-1 block">Pushed to</span>
                <input
                  type="date"
                  value={pushedTo}
                  onChange={(e) => setPushedTo(e.target.value)}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <ViewSkeleton viewMode={viewMode} />
      ) : muas.length === 0 ? (
        <p className="py-16 text-center text-slate-muted">{activeEmptyMessage}</p>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-slate-muted">
          No MUAs match your filters
        </p>
      ) : viewMode === "grid" ? (
        <GridView
          muas={filtered}
          conversationsHref={conversationsHref}
          detailBase={apiPath}
          onComms={(m) => setCommsMua({ id: m.id, name: m.name })}
        />
      ) : viewMode === "list" ? (
        <ListView
          muas={sortedList}
          detailBase={apiPath}
          sortIndicator={sortIndicator}
          onSort={toggleSort}
          onComms={(m) => setCommsMua({ id: m.id, name: m.name })}
        />
      ) : (
        <KanbanView
          muas={filtered}
          detailBase={apiPath}
          onComms={(m) => setCommsMua({ id: m.id, name: m.name })}
        />
      )}

      {commsMua && (
        <MuaCommsSlideOver
          muaId={commsMua.id}
          muaName={commsMua.name}
          open={!!commsMua}
          onClose={() => setCommsMua(null)}
        />
      )}
    </div>
  );
}

function ViewSkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === "list") {
    return <div className="h-64 animate-pulse rounded-xl bg-slate-200" />;
  }
  if (viewMode === "kanban") {
    return (
      <div className="flex gap-4 overflow-hidden">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-96 min-w-[260px] animate-pulse rounded-xl bg-slate-200"
          />
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-48 animate-pulse rounded-xl bg-slate-200" />
      ))}
    </div>
  );
}

function GridView({
  muas,
  conversationsHref,
  detailBase,
  onComms,
}: {
  muas: RmMuaRosterItem[];
  conversationsHref: string;
  detailBase: string;
  onComms: (m: RmMuaRosterItem) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {muas.map((m) => {
        const hasPlan = m.planTier != null;
        const atCap = hasPlan && m.weeklyCap > 0 && m.weeklyUsed >= m.weeklyCap;
        const pct =
          hasPlan && m.weeklyCap > 0
            ? Math.min(100, (m.weeklyUsed / m.weeklyCap) * 100)
            : 0;
        const days = expiryDays(m.planExpiry);
        const expirySoon = days !== null && days <= 30;
        const lastDays = daysAgo(m.lastPushed);
        const borderClass = atCap
          ? "border-red-400"
          : hasPlan && m.weeklyRemaining <= 2
            ? "border-amber-400"
            : "border-slate-200";

        return (
          <Card
            key={m.id}
            className={cn("relative overflow-hidden p-4", borderClass)}
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-brand">
                <Link
                  href={detailHref(detailBase, m.id)}
                  className="hover:underline"
                >
                  {m.name}
                </Link>
              </h2>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  m.planTier
                    ? PLAN_BADGE[m.planTier]
                    : "border-violet-300 bg-violet-100 text-violet-900"
                )}
              >
                {m.planTier ? PLAN_TIER_LABELS[m.planTier] : "Non-plan"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-muted">
              {m.city}
              {m.planExpiry && (
                <span className={cn(expirySoon && "font-medium text-red-600")}>
                  {" "}
                  · Plan expires{" "}
                  {new Date(m.planExpiry).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              )}
            </p>

            {hasPlan ? (
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-slate-muted">This week</span>
                  <span className={cn("font-semibold", atCap && "text-red-600")}>
                    {m.weeklyUsed} / {m.weeklyCap}
                  </span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      capBarColor(pct, atCap)
                    )}
                    style={{ width: `${Math.max(pct, atCap ? 100 : 2)}%` }}
                  />
                  {atCap && (
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold uppercase tracking-wider text-white">
                      AT CAP
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(m.assuredBookings ?? 0) > 0 && (
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-800">
                      ✦ {m.assuredBookings} assured booking
                      {(m.assuredBookings ?? 0) === 1 ? "" : "s"}
                    </span>
                  )}
                  {m.monthlyPushTarget != null && (
                    <span className="text-[10px] text-slate-muted">
                      Target: {m.monthlyPushTarget}/mo
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-muted">
                No weekly plan cap · {m.weeklyUsed} pushes this week
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-muted">
              <span>💬 {m.activeConversations} active</span>
              <span>⏳ {m.awaitingClose} awaiting close</span>
              <span>✓ {m.totalBookings} booked all time</span>
            </div>

            <p
              className={cn(
                "mt-2 text-[11px]",
                lastDays !== null && lastDays > 7
                  ? "text-slate-400"
                  : "text-slate-muted"
              )}
            >
              Last pushed: {lastPushedLabel(m.lastPushed)}
            </p>

            <div className="mt-4 flex gap-4 border-t border-slate-100 pt-3 text-xs">
              <Link
                href={conversationsHref}
                className="font-medium text-accent hover:underline"
              >
                View conversations →
              </Link>
              <button
                type="button"
                className="font-medium text-accent hover:underline"
                onClick={() => onComms(m)}
              >
                Comms →
              </button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function ListView({
  muas,
  detailBase,
  sortIndicator,
  onSort,
  onComms,
}: {
  muas: RmMuaRosterItem[];
  detailBase: string;
  sortIndicator: (key: SortKey) => string;
  onSort: (key: SortKey) => void;
  onComms: (m: RmMuaRosterItem) => void;
}) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>
            <button type="button" className="font-semibold" onClick={() => onSort("name")}>
              Name{sortIndicator("name")}
            </button>
          </TH>
          <TH>City</TH>
          <TH>
            <button type="button" className="font-semibold" onClick={() => onSort("plan")}>
              Plan{sortIndicator("plan")}
            </button>
          </TH>
          <TH>
            <button type="button" className="font-semibold" onClick={() => onSort("cap")}>
              Weekly cap{sortIndicator("cap")}
            </button>
          </TH>
          <TH>
            <button type="button" className="font-semibold" onClick={() => onSort("expiry")}>
              Expiry{sortIndicator("expiry")}
            </button>
          </TH>
          <TH>Active</TH>
          <TH>Awaiting</TH>
          <TH>Bookings</TH>
          <TH>
            <button
              type="button"
              className="font-semibold"
              onClick={() => onSort("lastPushed")}
            >
              Last pushed{sortIndicator("lastPushed")}
            </button>
          </TH>
          <TH />
        </TR>
      </THead>
      <TBody>
        {muas.map((m) => {
          const atCap = m.weeklyCap > 0 && m.weeklyUsed >= m.weeklyCap;
          const days = expiryDays(m.planExpiry);
          const expiringSoon = days !== null && days >= 0 && days <= 30;
          const exp = expiryListCell(m);
          const rowBorder = atCap
            ? "border-l-2 border-l-red-400"
            : expiringSoon
              ? "border-l-2 border-l-amber-400"
              : "";

          return (
            <TR key={m.id} className={rowBorder}>
              <TD className="font-semibold text-brand">
                <Link href={detailHref(detailBase, m.id)} className="hover:underline">
                  {m.name}
                </Link>
              </TD>
              <TD>{m.city}</TD>
              <TD>
                {m.planTier ? (
                  <span
                    className={cn(
                      "rounded border px-2 py-0.5 text-[10px] font-semibold",
                      PLAN_BADGE[m.planTier]
                    )}
                  >
                    {PLAN_TIER_LABELS[m.planTier]}
                  </span>
                ) : (
                  "—"
                )}
              </TD>
              <TD>
                <CapBar used={m.weeklyUsed} cap={m.weeklyCap || 0} />
              </TD>
              <TD className={exp.className}>{exp.text}</TD>
              <TD>{m.activeConversations}</TD>
              <TD>{m.awaitingClose}</TD>
              <TD>{m.totalBookings}</TD>
              <TD className="text-slate-muted text-xs">
                {lastPushedLabel(m.lastPushed)}
              </TD>
              <TD>
                <button
                  type="button"
                  className="text-xs font-medium text-accent hover:underline"
                  onClick={() => onComms(m)}
                >
                  Comms →
                </button>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

function KanbanView({
  muas,
  detailBase,
  onComms,
}: {
  muas: RmMuaRosterItem[];
  detailBase: string;
  onComms: (m: RmMuaRosterItem) => void;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {KANBAN_COLUMNS.map(({ tier, label }) => {
        const columnMuas = muas.filter((m) =>
          tier === null ? !m.planTier : m.planTier === tier
        );
        const totalUsed = columnMuas.reduce((s, m) => s + m.weeklyUsed, 0);
        const totalCap = columnMuas.reduce((s, m) => s + m.weeklyCap, 0);
        const atCapCount = columnMuas.filter(
          (m) => m.weeklyCap > 0 && m.weeklyUsed >= m.weeklyCap
        ).length;
        const colKey = tier ?? "unplanned";

        return (
          <div
            key={colKey}
            className={cn(
              "flex min-w-[260px] max-w-[280px] shrink-0 flex-col rounded-xl",
              KANBAN_COLUMN_BG[colKey]
            )}
          >
            <div
              className={cn(
                "sticky top-0 z-10 rounded-t-xl px-3 pt-3",
                KANBAN_COLUMN_BG[colKey]
              )}
            >
              <div
                className={cn("mb-2 h-1 rounded-full", KANBAN_HEADER_STRIP[colKey])}
              />
              <p className="text-sm font-bold text-brand">{label}</p>
              <p className="text-xs text-slate-muted">{columnMuas.length} MUAs</p>
              <p className="text-[11px] text-slate-muted">
                {totalUsed}/{totalCap} cap used this week
              </p>
              {atCapCount > 0 && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {atCapCount} at cap
                </p>
              )}
            </div>
            <div className="max-h-[calc(100vh-280px)] space-y-2 overflow-y-auto p-2">
              {columnMuas.map((m) => (
                <KanbanCard
                  key={m.id}
                  m={m}
                  href={detailHref(detailBase, m.id)}
                  onComms={() => onComms(m)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({
  m,
  href,
  onComms,
}: {
  m: RmMuaRosterItem;
  href: string;
  onComms: () => void;
}) {
  const atCap = m.weeklyCap > 0 && m.weeklyUsed >= m.weeklyCap;
  const remaining = m.weeklyCap - m.weeklyUsed;
  const days = expiryDays(m.planExpiry);
  const expiringSoon = days !== null && days >= 0 && days <= 30;
  const expiryChip = kanbanExpiryChip(m);
  const lastDays = daysAgo(m.lastPushed);

  const borderClass = atCap
    ? "border-red-400"
    : expiringSoon
      ? "border-amber-400"
      : "border-slate-200";

  return (
    <Card className={cn("p-3", borderClass)}>
      <div className="flex items-start justify-between gap-1">
        <Link href={href} className="text-sm font-semibold text-brand hover:underline">
          {m.name}
        </Link>
        {atCap ? (
          <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700">
            AT CAP
          </span>
        ) : remaining <= 2 && m.weeklyCap > 0 ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
            {remaining} left
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-muted">
        <span>{m.city}</span>
        {expiryChip && (
          <span
            className={cn(
              "rounded px-1 py-0.5 text-[10px] font-medium",
              days !== null && days < 0
                ? "bg-red-100 text-red-700"
                : days !== null && days <= 7
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-800"
            )}
          >
            {expiryChip}
          </span>
        )}
      </div>
      <div className="mt-2">
        <CapBar used={m.weeklyUsed} cap={m.weeklyCap || 0} />
      </div>
      <p className="mt-2 text-[10px] text-slate-muted">
        💬{m.activeConversations} ⏳{m.awaitingClose} ✓{m.totalBookings}
        {" · "}
        {lastDays === null ? "never" : lastDays === 0 ? "today" : `${lastDays}d ago`}
      </p>
      <button
        type="button"
        className="mt-2 text-[11px] font-medium text-accent hover:underline"
        onClick={(e) => {
          e.preventDefault();
          onComms();
        }}
      >
        Comms →
      </button>
    </Card>
  );
}
