"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SlideOver } from "@/components/ui/SlideOver";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { toSearchParams } from "@/lib/date-range";
import { fromDbPlanTier } from "@/lib/db-mappers";
import { PLAN_TIER_LABELS, type DateRangeFilterValue, type PlanTier } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { downloadMuaLedgerCsv } from "@/lib/download-mua-ledger";
import type { MuaLedgerEntry } from "@/lib/mua-ledger-query";
import {
  filterMuaLedgerEntries,
  type MuaLedgerDetailTab,
} from "@/lib/mua-ledger-filters";

const PLAN_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All plans" },
  ...(Object.keys(PLAN_TIER_LABELS) as PlanTier[]).map((t) => ({
    value: t,
    label: PLAN_TIER_LABELS[t],
  })),
  { value: "none", label: "Non-plan" },
];

function planTierLabel(raw: string | null): string {
  if (!raw) return "—";
  const key = fromDbPlanTier(raw);
  if (key && PLAN_TIER_LABELS[key]) return PLAN_TIER_LABELS[key];
  return raw;
}

type SummaryRow = {
  id: string;
  displayId: string;
  name: string;
  city: string;
  regionalRmName: string | null;
  planRmName: string | null;
  planTier: string | null;
  planExpiry: string | null;
  pushesThisMonth: number;
  totalPushes: number;
  uniqueLeads: number;
  totalBookings: number;
  totalRevenue: number | null;
  lastActivity: string | null;
  monthlyPushTarget: number | null;
};

type LedgerEntry = MuaLedgerEntry;

const ENTRY_LABEL: Record<string, { icon: string; label: string; color: string }> = {
  mua_pushed: { icon: "📤", label: "Pushed", color: "text-blue-600" },
  stage_updated: { icon: "🔄", label: "Stage update", color: "text-teal-600" },
  booking_confirmed: { icon: "✅", label: "Booking", color: "text-emerald-600" },
  call_logged: { icon: "📞", label: "Call", color: "text-indigo-600" },
  whatsapp_logged: { icon: "💬", label: "WhatsApp", color: "text-green-600" },
  callyzer_synced: { icon: "📞", label: "Callyzer", color: "text-indigo-600" },
  note: { icon: "📝", label: "Note", color: "text-slate-600" },
  cap_bypass: { icon: "⚡", label: "Cap bypass", color: "text-amber-600" },
  shifted_commission: { icon: "↗", label: "Shifted", color: "text-purple-600" },
  conversation_closed: { icon: "✓", label: "Closed", color: "text-slate-600" },
  close_confirmation: { icon: "✓", label: "Close confirm", color: "text-slate-600" },
  plan_assigned: { icon: "📋", label: "Plan change", color: "text-violet-600" },
  mua_created: { icon: "✨", label: "MUA created", color: "text-violet-600" },
  mua_activated: { icon: "🎉", label: "Plan activated", color: "text-violet-600" },
  booking_cancelled: { icon: "❌", label: "Booking cancelled", color: "text-red-600" },
  care_email_sent: { icon: "✉️", label: "Email", color: "text-sky-600" },
  emailLogged: { icon: "✉️", label: "Email", color: "text-sky-600" },
  onboardingUpdated: { icon: "📋", label: "Onboarding", color: "text-amber-700" },
  trainingUpdated: { icon: "🎓", label: "Training", color: "text-amber-700" },
  activationUpdated: { icon: "⚡", label: "Activation", color: "text-amber-700" },
  care_escalation: { icon: "⬆", label: "Escalation", color: "text-orange-600" },
  rm_assigned: { icon: "👤", label: "RM assigned", color: "text-violet-600" },
  ticket_comment: { icon: "🎫", label: "Care comment", color: "text-rose-600" },
  ticket_internal: { icon: "🔒", label: "Care internal", color: "text-rose-500" },
  ai_advisor: { icon: "🤖", label: "AI advisor", color: "text-fuchsia-600" },
  ticket_status: { icon: "🎫", label: "Ticket status", color: "text-rose-600" },
  care_email: { icon: "✉️", label: "Care email", color: "text-rose-600" },
  ticket_escalation: { icon: "⬆", label: "Escalation", color: "text-orange-600" },
};

function entrySourceLabel(entry: LedgerEntry): string {
  if (entry.source === "care") return "Care";
  if (entry.source === "plan") return "Plan";
  if (entry.source === "sales" || entry.description.startsWith("[Sales] ")) return "Sales";
  if (entry.source === "call") return "Call";
  return "RM";
}

function formatEntryType(entry: LedgerEntry) {
  return (
    ENTRY_LABEL[entry.entryType] ?? {
      icon: "💬",
      label: entry.entryType.replace(/_/g, " "),
      color: "text-slate-600",
    }
  );
}

function monthKey(d: Date) {
  return d.toLocaleString("en-IN", { month: "long", year: "numeric" }).toUpperCase();
}

export function MuaLedgerReport({
  apiBase = "/api/admin/reports",
  scoped = false,
  simplified = false,
  initialSearch = "",
}: {
  apiBase?: string;
  scoped?: boolean;
  simplified?: boolean;
  initialSearch?: string;
} = {}) {
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [strip, setStrip] = useState({
    totalPlanMuas: 0,
    activeThisMonth: 0,
    revenueThisMonth: 0,
    avgPushes: 0,
  });
  const [tier, setTier] = useState("");
  const [city, setCity] = useState("");
  const [search, setSearch] = useState(initialSearch);
  const [regionalRmId, setRegionalRmId] = useState("");
  const [planRmId, setPlanRmId] = useState("");
  const [regionalRms, setRegionalRms] = useState<{ id: string; name: string }[]>([]);
  const [activeOnly, setActiveOnly] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeFilterValue>({
    mode: "preset",
    preset: "thisQuarter",
  });
  const [selected, setSelected] = useState<SummaryRow | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [ledgerTab, setLedgerTab] = useState<MuaLedgerDetailTab>("full");

  const dateQuery = useMemo(() => {
    const p = toSearchParams(dateRange);
    const q = new URLSearchParams();
    if (p.eventFrom) q.set("dateFrom", p.eventFrom);
    if (p.eventTo) q.set("dateTo", p.eventTo);
    return q;
  }, [dateRange]);

  useEffect(() => {
    void fetch("/api/admin/rms")
      .then((r) => r.json())
      .then((json) => {
        setRegionalRms((json as { data: { id: string; name: string }[] }).data ?? []);
      });
  }, []);

  const load = useCallback(() => {
    const params = new URLSearchParams(dateQuery);
    if (tier) params.set("tier", tier);
    if (city) params.set("city", city);
    if (search.trim()) params.set("search", search.trim());
    if (regionalRmId) params.set("regionalRmId", regionalRmId);
    if (planRmId) params.set("planRmId", planRmId);
    void fetch(`${apiBase}/mua-ledger?${params}`)
      .then((r) => r.json())
      .then(
        (json: {
          data: { summary: SummaryRow[]; strip: typeof strip };
        }) => {
          setSummary(json.data?.summary ?? []);
          setStrip(json.data?.strip ?? strip);
        }
      );
  }, [apiBase, tier, city, search, regionalRmId, planRmId, dateQuery]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!activeOnly) return summary;
    return summary.filter((m) => m.pushesThisMonth > 0);
  }, [summary, activeOnly]);

  function openLedger(m: SummaryRow) {
    setSelected(m);
    setLedgerTab("full");
    setEntriesLoading(true);
    const params = new URLSearchParams({ muaId: m.id, allTime: "true" });
    void fetch(`${apiBase}/mua-ledger?${params}`)
      .then((r) => r.json())
      .then((json: { data: { entries: LedgerEntry[] } }) =>
        setEntries(json.data?.entries ?? [])
      )
      .finally(() => setEntriesLoading(false));
  }

  const visibleEntries = useMemo(
    () => filterMuaLedgerEntries(entries, ledgerTab),
    [entries, ledgerTab]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, LedgerEntry[]>();
    for (const e of visibleEntries) {
      const d = new Date(e.createdAt);
      const key = monthKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return [...map.entries()];
  }, [visibleEntries]);

  const periodLabel =
    dateRange.mode === "preset" && dateRange.preset === "thisQuarter"
      ? "this quarter"
      : dateRange.mode === "preset" && dateRange.preset === "nextQuarter"
        ? "next quarter"
        : dateRange.mode === "preset" && dateRange.preset === "nextMonth"
          ? "next month"
          : dateRange.mode === "range"
            ? "in selected range"
            : "all time";

  return (
    <div className="space-y-4">
      <DateRangeFilter value={dateRange} onChange={setDateRange} />

      <div className="flex flex-wrap gap-2">
        {PLAN_FILTER_OPTIONS.map(({ value, label }) => (
          <button
            key={value || "all"}
            type="button"
            onClick={() => setTier(value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              tier === value ? "bg-brand text-white" : "bg-slate-100"
            )}
          >
            {label}
          </button>
        ))}
        <input
          type="text"
          placeholder="MUA name or ID…"
          className="rounded-lg border border-slate-200 px-3 py-1 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onBlur={load}
        />
        <input
          type="text"
          placeholder="City…"
          className="rounded-lg border border-slate-200 px-3 py-1 text-sm"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          onBlur={load}
        />
        <label className="text-sm">
          Regional RM
          <select
            className="ml-2 rounded border px-2 py-1 text-sm"
            value={regionalRmId}
            onChange={(e) => setRegionalRmId(e.target.value)}
          >
            <option value="">All</option>
            {regionalRms.map((rm) => (
              <option key={rm.id} value={rm.id}>
                {rm.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Plan RM
          <select
            className="ml-2 rounded border px-2 py-1 text-sm"
            value={planRmId}
            onChange={(e) => setPlanRmId(e.target.value)}
          >
            <option value="">All</option>
            {regionalRms.map((rm) => (
              <option key={rm.id} value={rm.id}>
                {rm.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          Active only
        </label>
        <Button
          type="button"
          variant="secondary"
          className="ml-auto"
          onClick={() => {
            const params = new URLSearchParams(dateQuery);
            if (tier) params.set("tier", tier);
            if (city) params.set("city", city);
            if (search.trim()) params.set("search", search.trim());
            if (regionalRmId) params.set("regionalRmId", regionalRmId);
            if (planRmId) params.set("planRmId", planRmId);
            void downloadMuaLedgerCsv(apiBase, params).then((err) => {
              if (err) console.error(err);
            });
          }}
        >
          Export MUA Ledger CSV ↓
        </Button>
      </div>

      <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-4">
        <span>Total plan MUAs: {strip.totalPlanMuas}</span>
        <span>Active {periodLabel}: {strip.activeThisMonth}</span>
        <span>Revenue {periodLabel}: Rs. {strip.revenueThisMonth.toLocaleString("en-IN")}</span>
        <span>Avg pushes/MUA: {strip.avgPushes}</span>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>MUA Name</TH>
            <TH>City</TH>
            <TH>Current RM</TH>
            <TH>Plan RM</TH>
            <TH>Plan</TH>
            <TH>Pushes</TH>
            <TH>Total Pushes</TH>
            <TH>Unique Leads</TH>
            <TH>Bookings</TH>
            <TH>Revenue (Rs.)</TH>
            <TH>Last Activity</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {filtered.map((m) => {
            const underused =
              m.planTier && m.pushesThisMonth === 0;
            return (
              <TR
                key={m.id}
                className={cn(
                  underused && "bg-amber-50/80",
                  !m.planTier && "text-slate-muted"
                )}
              >
                <TD className="font-medium">{m.name}</TD>
                <TD>{m.city}</TD>
                <TD className="text-sm">{m.regionalRmName ?? "—"}</TD>
                <TD className="text-sm">{m.planRmName ?? "—"}</TD>
                <TD>
                  {m.planTier ? <Badge>{planTierLabel(m.planTier)}</Badge> : "—"}
                </TD>
                <TD>{m.pushesThisMonth}</TD>
                <TD>{m.totalPushes}</TD>
                <TD>{m.uniqueLeads}</TD>
                <TD>{m.totalBookings}</TD>
                <TD>{(m.totalRevenue ?? 0).toLocaleString("en-IN")}</TD>
                <TD>{m.lastActivity ? formatDate(m.lastActivity) : "—"}</TD>
                <TD>
                  <button
                    type="button"
                    className="text-sm font-medium text-accent hover:underline"
                    onClick={() => openLedger(m)}
                  >
                    Ledger →
                  </button>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>

      <SlideOver
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? "MUA Ledger"}
        wide
      >
        {selected && (
          <div className="space-y-4">
            <p className="text-sm text-slate-muted">
              {selected.city}
              <span className="mx-1">·</span>
              Current RM: {selected.regionalRmName ?? "—"}
              <span className="mx-1">·</span>
              Plan RM: {selected.planRmName ?? "—"}
              {selected.planTier && (
                <Badge className="ml-2">{planTierLabel(selected.planTier)}</Badge>
              )}
              <span className="mt-1 block text-xs">
                {ledgerTab === "full" ? "Full ledger" : "MUA-facing activity"} · {visibleEntries.length}{" "}
                of {entries.length} entries
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["full", "Full ledger"],
                  ["external", "MUA activity"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLedgerTab(id)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    ledgerTab === id ? "bg-brand text-white" : "bg-slate-100 text-slate-muted"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-muted">
              MUA activity: profile & plan, RM assignment, onboarding/training/activation, pushes,
              bookings & cancellations, calls (incl. Callyzer), WhatsApp, emails, and care ticket
              emails/escalations. Excludes internal notes and ticket comments.
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const params = new URLSearchParams({ muaId: selected.id, allTime: "true" });
                void downloadMuaLedgerCsv(apiBase, params).then((err) => {
                  if (err) console.error(err);
                });
              }}
            >
              Export this MUA&apos;s ledger CSV ↓
            </Button>
            <div className="space-y-6 border-t border-slate-100 pt-4">
              {entriesLoading ? (
                <p className="text-sm text-slate-muted">Loading ledger…</p>
              ) : null}
              {!entriesLoading &&
              grouped.map(([month, items]) => (
                <div key={month}>
                  <p className="mb-2 text-xs font-bold tracking-wide text-slate-muted">
                    {month}
                  </p>
                  <div className="space-y-3">
                    {items.map((e) => {
                      const meta = formatEntryType(e);
                      const d = new Date(e.createdAt);
                      return (
                        <div
                          key={e.id}
                          className="border-b border-slate-100 pb-3 text-sm"
                        >
                          <p className="font-medium">
                            {d.toLocaleDateString("en-IN", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}{" "}
                            <span className="text-xs text-slate-muted">
                              {d.toLocaleTimeString("en-IN", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>{" "}
                            <Badge variant="muted" className="ml-1 align-middle text-[10px]">
                              {entrySourceLabel(e)}
                            </Badge>{" "}
                            <span className={meta.color}>
                              {meta.icon} {meta.label}
                            </span>
                          </p>
                          {(e.leadDisplayId || e.brideName) && (
                            <p className="font-medium text-brand">
                              {e.leadDisplayId}
                              {e.brideName ? ` · ${e.brideName}` : ""}
                            </p>
                          )}
                          {(e.region || e.budgetTier || e.pushStage) && (
                            <p className="text-xs capitalize text-slate-muted">
                              {[e.region, e.budgetTier?.replace("_", " "), e.pushStage]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                          <p className="text-slate-muted">{e.description}</p>
                          {e.bookedPrice != null && (
                            <p className="text-emerald-700">
                              Rs. {e.bookedPrice.toLocaleString("en-IN")}
                            </p>
                          )}
                          {e.actorName && (
                            <p className="text-xs text-slate-muted">
                              by {e.actorName}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {!entriesLoading && visibleEntries.length === 0 && (
                <p className="text-sm text-slate-muted">
                  {entries.length === 0 ? "No ledger entries." : "No entries in this view."}
                </p>
              )}
            </div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}
