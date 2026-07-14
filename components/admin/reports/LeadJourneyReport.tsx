"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { cn } from "@/lib/utils";
import { daysColorClass } from "@/lib/report-utils";
import {
  LEAD_JOURNEY_FUNNEL_STAGES,
  LEAD_JOURNEY_INTERVALS,
  funnelStageLabel,
  leadJourneyFunnelStageDisplay,
  type LeadJourneyFunnelStageKey,
} from "@/lib/reports/lead-journey-shared";
import {
  LEAD_JOURNEY_DB_STATUS_FILTERS,
  leadJourneyDbStatusLabel,
  type LeadJourneyDbStatusFilter,
  type LeadJourneyPortalFilter,
} from "@/lib/reports/lead-journey-filters";
import {
  ReportResultLine,
  ReportSummaryChip,
  ReportSummaryChips,
} from "@/components/admin/reports-hub/shared/ReportSummaryChips";

type LeadRow = {
  id: string;
  displayId: string;
  brideName: string;
  rmName: string | null;
  region: string;
  budgetTier: string;
  status: string;
  daysToVerify: number | null;
  daysToAssign: number | null;
  daysToConfirm: number | null;
  daysToFirstPush: number | null;
  daysToOfferSent: number | null;
  daysOfferToBooking: number | null;
  daysToBooking: number | null;
  totalDaysOpen: number | null;
  totalMuasOffered: number;
  currentFunnelStage: LeadJourneyFunnelStageKey | null;
  leadPhase: string | null;
  portalOnly: boolean;
  lastContactAt: string | null;
};

type Summary = {
  funnel: Array<{
    stage: string;
    stageKey?: LeadJourneyFunnelStageKey;
    reached: number;
    avgDaysFromPrev: number | null;
  }>;
  stats: Array<{ label: string; median: number | null; p90: number | null; avg: number | null }>;
  bottleneck?: { label: string; avg: number | null };
  atStageCounts?: Array<{ key: LeadJourneyFunnelStageKey; label: string; count: number }>;
};

type RmOption = { id: string; name: string; region: string | null };

const TIERS = ["tier_1", "tier_2", "tier_3"] as const;

const DB_STATUS_LABELS: Record<LeadJourneyDbStatusFilter, string> = {
  assigned: "Assigned",
  booked: "Booked",
  verified: "Verified",
  closed: "Closed",
};

const PORTAL_FILTERS: Array<{ value: LeadJourneyPortalFilter | ""; label: string }> = [
  { value: "", label: "All leads" },
  { value: "portal", label: "Portal" },
  { value: "non_portal", label: "Non-portal" },
];

const TABLE_INTERVALS = LEAD_JOURNEY_INTERVALS.map((iv) => ({
  label: iv.label,
  daysKey: iv.daysKey as keyof LeadRow,
}));

function DaysCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-muted">—</span>;
  return <span className={daysColorClass(value)}>{value}d</span>;
}

type CommRow = {
  id: string;
  entryType: string;
  description: string;
  createdAt: string;
  actorName?: string;
};

function buildParams(filters: {
  region: string;
  tier: string;
  rmId: string;
  statuses: LeadJourneyDbStatusFilter[];
  portal: LeadJourneyPortalFilter | "";
  funnelStage: string;
  eventFrom: string;
  eventTo: string;
  activityFrom: string;
  activityTo: string;
}) {
  const params = new URLSearchParams();
  if (filters.region) params.set("region", filters.region);
  if (filters.tier) params.set("tier", filters.tier);
  if (filters.rmId) params.set("rmId", filters.rmId);
  if (filters.statuses.length) params.set("statuses", filters.statuses.join(","));
  if (filters.portal) params.set("portal", filters.portal);
  if (filters.funnelStage) params.set("funnelStage", filters.funnelStage);
  if (filters.eventFrom) params.set("eventFrom", filters.eventFrom);
  if (filters.eventTo) params.set("eventTo", filters.eventTo);
  if (filters.activityFrom) params.set("activityFrom", filters.activityFrom);
  if (filters.activityTo) params.set("activityTo", filters.activityTo);
  return params;
}

function formatLastContact(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function LeadJourneyReport({
  apiBase = "/api/admin/reports",
  scoped = false,
  hideRmFilter = false,
}: {
  apiBase?: string;
  scoped?: boolean;
  hideRmFilter?: boolean;
} = {}) {
  const [view, setView] = useState<"funnel" | "table">("funnel");
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rms, setRms] = useState<{ regional: RmOption[]; commission: RmOption[] }>({
    regional: [],
    commission: [],
  });
  const [region, setRegion] = useState("");
  const [tier, setTier] = useState("");
  const [rmId, setRmId] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<LeadJourneyDbStatusFilter[]>([]);
  const [portal, setPortal] = useState<LeadJourneyPortalFilter | "">("");
  const [funnelStage, setFunnelStage] = useState<LeadJourneyFunnelStageKey | "">("");
  const [eventFrom, setEventFrom] = useState("");
  const [eventTo, setEventTo] = useState("");
  const [activityFrom, setActivityFrom] = useState("");
  const [activityTo, setActivityTo] = useState("");
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [expandedComms, setExpandedComms] = useState<CommRow[]>([]);
  const [commsLoading, setCommsLoading] = useState(false);
  const [sortKey, setSortKey] = useState<keyof LeadRow>("totalDaysOpen");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    if (hideRmFilter) return;
    void Promise.all([
      fetch("/api/admin/rms").then((r) => r.json()),
      fetch("/api/admin/rms?role=commission_rm").then((r) => r.json()),
    ]).then(([regionalJson, commissionJson]: [{ data: RmOption[] }, { data: RmOption[] }]) => {
      setRms({
        regional: regionalJson.data ?? [],
        commission: commissionJson.data ?? [],
      });
    });
  }, [hideRmFilter]);

  const filters = {
    region,
    tier,
    rmId,
    statuses: selectedStatuses,
    portal,
    funnelStage,
    eventFrom,
    eventTo,
    activityFrom,
    activityTo,
  };

  const load = useCallback(() => {
    void fetch(`${apiBase}/lead-journey?${buildParams(filters)}`)
      .then((r) => r.json())
      .then((json: { data: { leads: LeadRow[]; summary: Summary } }) => {
        setLeads(json.data?.leads ?? []);
        setSummary(json.data?.summary ?? null);
        setExpandedLeadId(null);
        setExpandedComms([]);
      });
  }, [
    apiBase,
    region,
    tier,
    rmId,
    selectedStatuses,
    portal,
    funnelStage,
    eventFrom,
    eventTo,
    activityFrom,
    activityTo,
  ]);

  async function toggleComms(leadId: string) {
    if (expandedLeadId === leadId) {
      setExpandedLeadId(null);
      setExpandedComms([]);
      return;
    }
    setExpandedLeadId(leadId);
    setCommsLoading(true);
    const res = await fetch(`/api/leads/${leadId}/comms?limit=30`);
    const json = (await res.json()) as { data: CommRow[] };
    setExpandedComms(json.data ?? []);
    setCommsLoading(false);
  }

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(() => {
    const copy = [...leads];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortAsc ? av - bv : bv - av;
      }
      return sortAsc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [leads, sortKey, sortAsc]);

  useEffect(() => {
    if (view === "table" && sorted.length === 1 && sorted[0]) {
      void toggleComms(sorted[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, sorted.length, sorted[0]?.id]);

  function toggleSort(key: keyof LeadRow) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function exportCsv() {
    const params = buildParams(filters);
    params.set("format", "csv");
    window.location.href = `${apiBase}/lead-journey?${params}`;
  }

  function selectFunnelStage(next: LeadJourneyFunnelStageKey | "") {
    setFunnelStage(next);
    if (next) setView("table");
  }

  function toggleStatus(next: LeadJourneyDbStatusFilter) {
    setSelectedStatuses((current) =>
      current.includes(next) ? current.filter((s) => s !== next) : [...current, next]
    );
  }

  const tableColCount = 7 + TABLE_INTERVALS.length + 2;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {["", "north", "east", "west", "south"].map((r) => (
          <button
            key={r || "all"}
            type="button"
            onClick={() => setRegion(r)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              region === r
                ? "bg-brand text-white"
                : "bg-slate-100 text-slate-muted hover:bg-slate-200"
            )}
          >
            {r ? r.charAt(0).toUpperCase() + r.slice(1) : "All regions"}
          </button>
        ))}
      </div>

      {!hideRmFilter ? (
        <label className="block text-sm">
          <span className="text-slate-muted">RM (Regional &amp; Commission)</span>
          <select
            className="mt-1 block w-full max-w-md rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={rmId}
            onChange={(e) => setRmId(e.target.value)}
          >
            <option value="">All RMs</option>
            {rms.regional.length > 0 ? (
              <optgroup label="Regional RMs">
                {rms.regional.map((rm) => (
                  <option key={rm.id} value={rm.id}>
                    {rm.name}
                    {rm.region ? ` · ${rm.region}` : ""}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {rms.commission.length > 0 ? (
              <optgroup label="Commission RMs">
                {rms.commission.map((rm) => (
                  <option key={rm.id} value={rm.id}>
                    {rm.name}
                    {rm.region ? ` · ${rm.region}` : ""}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
      ) : null}

      <div className="space-y-2">
        <p className="text-sm font-medium text-brand">DB status</p>
        <div className="flex flex-wrap gap-2">
          {LEAD_JOURNEY_DB_STATUS_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => toggleStatus(value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium",
                selectedStatuses.includes(value)
                  ? "bg-brand text-white"
                  : "bg-slate-100 text-slate-muted hover:bg-slate-200"
              )}
            >
              {DB_STATUS_LABELS[value]}
            </button>
          ))}
          {selectedStatuses.length > 0 ? (
            <button
              type="button"
              onClick={() => setSelectedStatuses([])}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-muted underline"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-brand">Portal</p>
        <div className="flex flex-wrap gap-2">
          {PORTAL_FILTERS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setPortal(option.value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium",
                portal === option.value
                  ? "bg-brand text-white"
                  : "bg-slate-100 text-slate-muted hover:bg-slate-200"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="text-slate-muted">Tier</span>
          <select
            className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
          >
            <option value="">All tiers</option>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Event from"
          type="date"
          className="w-36"
          value={eventFrom}
          onChange={(e) => setEventFrom(e.target.value)}
        />
        <Input
          label="Event to"
          type="date"
          className="w-36"
          value={eventTo}
          onChange={(e) => setEventTo(e.target.value)}
        />
        <Input
          label="Last activity from"
          type="date"
          className="w-36"
          value={activityFrom}
          onChange={(e) => setActivityFrom(e.target.value)}
        />
        <Input
          label="Last activity to"
          type="date"
          className="w-36"
          value={activityTo}
          onChange={(e) => setActivityTo(e.target.value)}
        />
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => setView("funnel")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm",
              view === "funnel" ? "bg-brand text-white" : "bg-slate-100"
            )}
          >
            Funnel
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm",
              view === "table" ? "bg-brand text-white" : "bg-slate-100"
            )}
          >
            Lead table
          </button>
          <Button type="button" variant="secondary" onClick={exportCsv}>
            {scoped ? "Export CSV ↓" : "Export Lead Journey CSV ↓"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-brand">Funnel stage (leads currently at stage)</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => selectFunnelStage("")}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium",
              funnelStage === ""
                ? "bg-brand text-white"
                : "bg-slate-100 text-slate-muted hover:bg-slate-200"
            )}
          >
            All stages
          </button>
          {(summary?.atStageCounts ?? LEAD_JOURNEY_FUNNEL_STAGES.map((s) => ({
            key: s.key,
            label: s.label,
            count: 0,
          }))).map((stage) => (
            <button
              key={stage.key}
              type="button"
              onClick={() => selectFunnelStage(stage.key)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium",
                funnelStage === stage.key
                  ? "bg-brand text-white"
                  : "bg-slate-100 text-slate-muted hover:bg-slate-200"
              )}
            >
              {stage.label}
              {stage.count > 0 ? ` (${stage.count})` : ""}
            </button>
          ))}
        </div>
      </div>

      {summary?.atStageCounts && summary.atStageCounts.some((s) => s.count > 0) ? (
        <ReportSummaryChips title="Leads at funnel stage">
          {summary.atStageCounts.map((stage) => (
            <ReportSummaryChip
              key={stage.key}
              label={stage.label}
              value={stage.count}
              active={funnelStage === stage.key}
              onClick={() => selectFunnelStage(funnelStage === stage.key ? "" : stage.key)}
            />
          ))}
        </ReportSummaryChips>
      ) : null}

      {funnelStage ? (
        <ReportResultLine>
          Showing {leads.length} lead{leads.length === 1 ? "" : "s"} currently at{" "}
          <strong>{funnelStageLabel(funnelStage)}</strong>. Clear the funnel filter to see all
          stages.
        </ReportResultLine>
      ) : null}

      {summary?.bottleneck && summary.bottleneck.avg != null && view === "funnel" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠ Bottleneck: leads are spending an avg of {summary.bottleneck.avg}d in{" "}
          {summary.bottleneck.label}
        </div>
      )}

      {view === "funnel" && summary && (
        <>
          <Card className="overflow-x-auto p-4">
            <div className="flex min-w-[640px] items-center gap-1">
              {summary.funnel.map((stage, i) => {
                const stageKey = stage.stageKey;
                const atCount =
                  summary.atStageCounts?.find((s) => s.key === stageKey)?.count ?? null;
                return (
                <div key={stage.stage} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => stageKey && selectFunnelStage(stageKey)}
                    className={cn(
                      "min-w-[88px] rounded-lg border p-2 text-center transition-colors",
                      stageKey && funnelStage === stageKey
                        ? "border-brand bg-brand/5 ring-2 ring-brand/30"
                        : "border-slate-200 bg-white hover:border-brand/40"
                    )}
                  >
                    <p className="text-xs font-semibold text-brand">{stage.stage}</p>
                    <p className="text-lg font-bold">{stage.reached}</p>
                    {atCount != null && atCount > 0 ? (
                      <p className="text-[10px] text-slate-muted">{atCount} at stage</p>
                    ) : null}
                    {i > 0 && stage.avgDaysFromPrev != null && (
                      <p
                        className={cn(
                          "text-xs font-medium",
                          daysColorClass(stage.avgDaysFromPrev)
                        )}
                      >
                        avg {stage.avgDaysFromPrev}d
                      </p>
                    )}
                  </button>
                  {i < summary.funnel.length - 1 && (
                    <span className="text-xs text-slate-muted">──→</span>
                  )}
                </div>
              );
              })}
            </div>
          </Card>
          <Table>
            <THead>
              <TR>
                <TH>Stage interval</TH>
                <TH>Avg days</TH>
                <TH>Median</TH>
                <TH>P90</TH>
              </TR>
            </THead>
            <TBody>
              {summary.stats.map((s) => (
                <TR key={s.label}>
                  <TD>{s.label}</TD>
                  <TD>
                    <DaysCell value={s.avg} />
                  </TD>
                  <TD>
                    <DaysCell value={s.median} />
                  </TD>
                  <TD>
                    <DaysCell value={s.p90} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </>
      )}

      {view === "table" && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <Table>
            <THead>
              <TR>
                <TH>
                  <button type="button" onClick={() => toggleSort("displayId")}>
                    Lead
                  </button>
                </TH>
                <TH>Bride</TH>
                <TH>RM</TH>
                <TH>Region</TH>
                <TH>Tier</TH>
                <TH>DB status</TH>
                <TH>Last contact</TH>
                <TH>Funnel stage</TH>
                {TABLE_INTERVALS.map((col) => (
                  <TH key={col.label}>
                    <button type="button" onClick={() => toggleSort(col.daysKey)}>
                      {col.label}
                    </button>
                  </TH>
                ))}
                <TH>
                  <button type="button" onClick={() => toggleSort("totalDaysOpen")}>
                    Total days
                  </button>
                </TH>
                <TH>MUAs</TH>
              </TR>
            </THead>
            <TBody>
              {sorted.length === 0 ? (
                <TR>
                  <TD colSpan={tableColCount} className="py-8 text-center text-slate-muted">
                    No leads match these filters
                  </TD>
                </TR>
              ) : (
              sorted.map((l) => (
                <Fragment key={l.id}>
                  <TR className="hover:bg-slate-50/80">
                    <TD>
                      <Link
                        href={`/rm/leads/${l.id}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {l.displayId}
                      </Link>
                      <button
                        type="button"
                        className="mt-1 block text-[10px] text-brand underline"
                        onClick={() => void toggleComms(l.id)}
                      >
                        {expandedLeadId === l.id ? "Hide comms" : "Comms"}
                      </button>
                    </TD>
                    <TD>{l.brideName}</TD>
                    <TD>{l.rmName ?? "—"}</TD>
                    <TD className="capitalize">{l.region}</TD>
                    <TD>{l.budgetTier}</TD>
                    <TD>{leadJourneyDbStatusLabel(l.status, l.leadPhase)}</TD>
                    <TD className="whitespace-nowrap text-sm">
                      {formatLastContact(l.lastContactAt)}
                    </TD>
                    <TD className="text-sm">
                      {leadJourneyFunnelStageDisplay(l)}
                    </TD>
                    {TABLE_INTERVALS.map((col) => (
                      <TD key={col.label}>
                        <DaysCell value={l[col.daysKey] as number | null} />
                      </TD>
                    ))}
                    <TD>
                      <DaysCell value={l.totalDaysOpen} />
                    </TD>
                    <TD>{l.totalMuasOffered}</TD>
                  </TR>
                  {expandedLeadId === l.id && (
                    <TR>
                      <TD colSpan={tableColCount} className="bg-slate-50 p-4">
                        {commsLoading ? (
                          <p className="text-sm text-slate-muted">Loading…</p>
                        ) : expandedComms.length === 0 ? (
                          <p className="text-sm text-slate-muted">No comms</p>
                        ) : (
                          <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
                            {expandedComms.map((c) => (
                              <li key={c.id}>
                                <span className="text-slate-muted">
                                  {new Date(c.createdAt).toLocaleString("en-IN")}
                                </span>
                                {" — "}
                                {c.description}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TD>
                    </TR>
                  )}
                </Fragment>
              ))
              )}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
