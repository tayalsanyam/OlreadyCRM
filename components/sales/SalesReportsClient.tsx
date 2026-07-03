"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { CustomReportBuilder } from "@/components/admin/reports/CustomReportBuilder";
import {
  SalesActionBoard,
  SalesPipelineDetailTable,
  type ActionFocus,
  type ActionPipelineRow,
  type ActionTaskRow,
} from "@/components/sales/SalesActionBoard";
import { MuaPipelineProfile } from "@/components/sales/MuaPipelineProfile";
import { SalesTargetsReport, type SalesTargetsPayload } from "@/components/sales/SalesTargetsReport";
import { salesPipelineMuaTypeLabel, type SalesPipelineMuaType } from "@/lib/sales-pipeline-labels";
import { salesSegmentTheme } from "@/lib/sales-segment-theme";
import { PIPELINE_STAGE_ORDER } from "@/lib/types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ScopeOption = { value: string; label: string };
type Summary = {
  byStage: Array<{ stage: string; muaType: string; count: number }>;
  stale: number;
  untouched: number;
  hot: number;
  totalActive?: number;
  scopeLabel?: string;
};
type CallRow = { day: string; calls: number; durationSec: number; answerRate: number | null };
type ClosedDealRow = {
  id: string;
  muaName: string;
  muaCity?: string | null;
  muaType: string;
  revenue: number;
  closedAt: string;
  closedByName?: string | null;
};
type RecentCallRow = {
  id: string;
  calledAt: string;
  durationSec: number;
  outcome?: string | null;
  muaName?: string | null;
  pipelineId?: string | null;
  stage?: string | null;
  staffName?: string | null;
};
type StageSnapshotRow = { stage: string; count: number };
type IndividualRow = {
  id: string;
  name: string;
  pipelineCount: number;
  dealsClosed: number;
  callsThisWeek?: number;
  avgCallsPerDay?: number;
  avgTalkTimeMinPerDay?: number;
};
type DailyViewPayload = {
  teamActivity: Array<{ id: string; name: string; callsToday: number; talkTimeTodaySec: number; stageMovesToday: number; tasksDoneToday: number; minCallsPerDay: number }>;
  stuckPipeline: Array<{ id: string; muaName: string; stage: string; daysStuck: number; assignedToName: string | null }>;
  overdueTasks: Array<{ id: string; title: string; taskType: string; dueDate: string; daysOverdue: number; staffName: string }>;
};

type Tab = "actions" | "analytics" | "pipeline" | "funnel" | "calls" | "targets" | "team" | "custom";
type SegmentFilter = "all" | SalesPipelineMuaType;
type PrioritiesPayload = {
  counts: { closingSoon: number; leftOut: number; todayTasks: number; overdueTasks: number };
  closingSoon: ActionPipelineRow[];
  leftOut: ActionPipelineRow[];
  dueTodayTasks: ActionTaskRow[];
  overdueTasks: ActionTaskRow[];
};

async function readJsonSafe<T>(res: Response): Promise<T | null> {
  const raw = await res.text();
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return "0m 0s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function pct(actual: number, target?: number | null): number {
  const t = Number(target ?? 0);
  if (t <= 0) return 0;
  return Math.max(0, Math.round((actual / t) * 100));
}

function progressClass(v: number): string {
  if (v >= 80) return "bg-emerald-600";
  if (v >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function stageSnapshotFromRollup(stageRows: Array<{ stage: string; count: number }>): StageSnapshotRow[] {
  return PIPELINE_STAGE_ORDER.map((stage) => ({
    stage,
    count: stageRows.find((r) => r.stage === stage)?.count ?? 0,
  })).filter((r) => r.count > 0);
}

export function SalesReportsClient() {
  const [tab, setTab] = useState<Tab>("actions");
  const [actionFocus, setActionFocus] = useState<ActionFocus>("all");
  const [priorities, setPriorities] = useState<PrioritiesPayload | null>(null);
  const [pipelineRows, setPipelineRows] = useState<ActionPipelineRow[]>([]);
  const [recentCalls, setRecentCalls] = useState<RecentCallRow[]>([]);
  const [pipelineStageFilter, setPipelineStageFilter] = useState<string>("all");
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [targets, setTargets] = useState<(SalesTargetsPayload & { scopeLabel?: string }) | null>(null);
  const [stageSnapshot, setStageSnapshot] = useState<StageSnapshotRow[]>([]);
  const [individual, setIndividual] = useState<IndividualRow[]>([]);
  const [daily, setDaily] = useState<DailyViewPayload | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [segment, setSegment] = useState<SegmentFilter>("all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [canFilter, setCanFilter] = useState(false);
  const [isTeamLead, setIsTeamLead] = useState(false);
  const [assignee, setAssignee] = useState("me");
  const [scopeOptions, setScopeOptions] = useState<ScopeOption[]>([]);
  const [scopeLabel, setScopeLabel] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [scopeRes, sessionRes] = await Promise.all([
        fetch("/api/sales/reports/scope", { cache: "no-store" }),
        fetch("/api/auth/session", { cache: "no-store" }),
      ]);
      const body = await readJsonSafe<{
        data?: { canFilter: boolean; defaultAssignee: string; options: ScopeOption[] };
        error?: string | null;
      }>(scopeRes);
      const session = await readJsonSafe<{ data?: { role?: string } }>(sessionRes);
      if (scopeRes.ok && body?.data) {
        setCanFilter(body.data.canFilter);
        setScopeOptions(body.data.options);
        setAssignee(body.data.defaultAssignee);
      }
      setIsTeamLead(session?.data?.role === "salesTl");
    })();
  }, []);

  const loadCore = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const qs = new URLSearchParams();
      if (dateFrom) qs.set("date_from", dateFrom);
      if (dateTo) qs.set("date_to", dateTo);
      if (segment !== "all") qs.set("mua_type", segment);
      if (canFilter) qs.set("assignee", assignee);
      const s = qs.toString();
      const targetQs = new URLSearchParams({ month });
      if (canFilter) targetQs.set("assignee", assignee);

      const priorityQs = new URLSearchParams();
      if (segment !== "all") priorityQs.set("mua_type", segment);
      if (canFilter) priorityQs.set("assignee", assignee);

      const [aRes, bRes, cRes, pRes, prRes] = await Promise.all([
        fetch(`/api/sales/reports/pipeline-summary?${s}`, { cache: "no-store" }),
        fetch(`/api/sales/reports/call-activity?${s}`, { cache: "no-store" }),
        fetch(`/api/sales/reports/targets?${targetQs.toString()}`, { cache: "no-store" }),
        fetch(`/api/sales/reports/priorities?${priorityQs.toString()}`, { cache: "no-store" }),
        fetch(`/api/sales/reports/pipeline-rows?${s}`, { cache: "no-store" }),
      ]);
      const [a, b, c, p, pr] = await Promise.all([
        readJsonSafe<{ data?: Summary; error?: string | null }>(aRes),
        readJsonSafe<{
          data?: CallRow[] | { rows?: CallRow[]; recentCalls?: RecentCallRow[]; scopeLabel?: string };
          error?: string | null;
        }>(bRes),
        readJsonSafe<{ data?: SalesTargetsPayload & { scopeLabel?: string }; error?: string | null }>(cRes),
        readJsonSafe<{ data?: PrioritiesPayload; error?: string | null }>(pRes),
        readJsonSafe<{ data?: { rows?: ActionPipelineRow[] }; error?: string | null }>(prRes),
      ]);
      if (!aRes.ok || a?.error) throw new Error(a?.error ?? `Pipeline summary failed (${aRes.status})`);
      if (!bRes.ok || b?.error) throw new Error(b?.error ?? `Call activity failed (${bRes.status})`);
      if (!cRes.ok || c?.error) throw new Error(c?.error ?? `Targets failed (${cRes.status})`);
      if (!pRes.ok || p?.error) throw new Error(p?.error ?? `Priorities failed (${pRes.status})`);
      if (!prRes.ok || pr?.error) throw new Error(pr?.error ?? `Pipeline rows failed (${prRes.status})`);

      const callPayload = b?.data;
      const callRows = Array.isArray(callPayload) ? callPayload : (callPayload?.rows ?? []);
      const callScope =
        callPayload && !Array.isArray(callPayload) && callPayload.scopeLabel ? callPayload.scopeLabel : null;
      const recentCallRows =
        callPayload && !Array.isArray(callPayload) && callPayload.recentCalls ? callPayload.recentCalls : [];

      setSummary(a?.data ?? null);
      setCalls(callRows);
      setRecentCalls(recentCallRows);
      setTargets(c?.data ?? null);
      setPriorities(p?.data ?? null);
      setPipelineRows(pr?.data?.rows ?? []);
      setScopeLabel(a?.data?.scopeLabel ?? callScope ?? c?.data?.scopeLabel ?? null);

      const stageRollup = new Map<string, number>();
      for (const r of a?.data?.byStage ?? []) {
        stageRollup.set(r.stage, (stageRollup.get(r.stage) ?? 0) + r.count);
      }
      setStageSnapshot(
        stageSnapshotFromRollup(
          Array.from(stageRollup.entries()).map(([stage, count]) => ({ stage, count })),
        ),
      );
    } catch (err) {
      setSummary(null);
      setCalls([]);
      setTargets(null);
      setPriorities(null);
      setPipelineRows([]);
      setRecentCalls([]);
      setStageSnapshot([]);
      setScopeLabel(null);
      setLoadError(err instanceof Error ? err.message : "Failed to load sales reports");
    } finally {
      setLoading(false);
    }
  }, [assignee, canFilter, dateFrom, dateTo, month, segment]);

  const loadTeam = useCallback(async () => {
    if (!isTeamLead) return;
    try {
      const qs = new URLSearchParams();
      if (dateFrom) qs.set("date_from", dateFrom);
      if (dateTo) qs.set("date_to", dateTo);
      const s = qs.toString();
      const [fRes, iRes, dRes] = await Promise.all([
        fetch(`/api/sales/analysis/funnel?${s}`, { cache: "no-store" }),
        fetch(`/api/sales/analysis/individual?${s}`, { cache: "no-store" }),
        fetch("/api/sales/analysis/daily-view", { cache: "no-store" }),
      ]);
      const [f, i, d] = await Promise.all([
        readJsonSafe<{ data?: StageSnapshotRow[]; error?: string | null }>(fRes),
        readJsonSafe<{ data?: IndividualRow[]; error?: string | null }>(iRes),
        readJsonSafe<{ data?: DailyViewPayload; error?: string | null }>(dRes),
      ]);
      if (fRes.ok && !f?.error && f?.data) setStageSnapshot(f.data);
      if (iRes.ok && !i?.error) setIndividual(i?.data ?? []);
      if (dRes.ok && !d?.error) setDaily(d?.data ?? null);
    } catch {
      // Team extras are optional; core reports still work
    }
  }, [dateFrom, dateTo, isTeamLead]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    if (tab === "team" && isTeamLead) void loadTeam();
  }, [tab, isTeamLead, loadTeam]);

  const stageRollup = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of summary?.byStage ?? []) m.set(r.stage, (m.get(r.stage) ?? 0) + r.count);
    return Array.from(m.entries()).map(([stage, count]) => ({ stage, count }));
  }, [summary?.byStage]);

  const segmentBreakdown = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of summary?.byStage ?? []) {
      m.set(r.muaType, (m.get(r.muaType) ?? 0) + r.count);
    }
    return Array.from(m.entries()).map(([muaType, count]) => ({
      muaType,
      label: salesPipelineMuaTypeLabel(muaType),
      count,
    }));
  }, [summary?.byStage]);

  const totalCalls = useMemo(() => calls.reduce((sum, r) => sum + (r.calls ?? 0), 0), [calls]);
  const totalDurationMinutes = useMemo(
    () => Math.round(calls.reduce((sum, r) => sum + (r.durationSec ?? 0), 0) / 60),
    [calls],
  );
  const avgAnswerRate = useMemo(() => {
    const vals = calls.map((r) => r.answerRate).filter((v): v is number => typeof v === "number");
    if (!vals.length) return 0;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }, [calls]);

  const filteredPipelineRows = useMemo(() => {
    if (pipelineStageFilter === "all") return pipelineRows;
    return pipelineRows.filter((r) => r.stage === pipelineStageFilter);
  }, [pipelineRows, pipelineStageFilter]);

  const closedDeals = targets?.closedDeals ?? [];

  const segmentTheme = segment !== "all" ? salesSegmentTheme(segment) : null;

  const targetsGap = useMemo(() => {
    const soldTarget = Number(
      targets?.target?.targetSoldTotal ??
        (Number(targets?.target?.targetPotentialSold ?? 0) +
          Number(targets?.target?.targetExistingSold ?? 0)),
    );
    const soldActual = Number(targets?.actuals?.sold ?? 0);
    const revenueTarget = Number(targets?.target?.targetRevenue ?? 0);
    const revenueActual = Number(targets?.actuals?.revenue ?? 0);
    return {
      soldTarget,
      soldActual,
      soldRemaining: Math.max(0, soldTarget - soldActual),
      revenueRemaining: Math.max(0, revenueTarget - revenueActual),
    };
  }, [targets]);

  function jumpToAction(focus: ActionFocus) {
    setTab("actions");
    setActionFocus(focus);
  }

  function resetFilters() {
    setDateFrom("");
    setDateTo("");
    setMonth(new Date().toISOString().slice(0, 7));
    setSegment("all");
    setPipelineStageFilter("all");
    if (canFilter) setAssignee(scopeOptions[0]?.value ?? "all");
  }

  function stageFilterBar(active: string, onSelect: (stage: string) => void) {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSelect("all")}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            active === "all" ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          All stages ({pipelineRows.length})
        </button>
        {PIPELINE_STAGE_ORDER.map((stage) => {
          const count = pipelineRows.filter((r) => r.stage === stage).length;
          if (!count) return null;
          return (
            <button
              key={stage}
              type="button"
              onClick={() => onSelect(stage)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                active === stage ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {stage} ({count})
            </button>
          );
        })}
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string; tlOnly?: boolean }> = [
    { id: "actions", label: "Work queue" },
    { id: "analytics", label: "Analytics" },
    { id: "pipeline", label: "Pipeline" },
    { id: "funnel", label: "Pipeline snapshot" },
    { id: "calls", label: "Call activity" },
    { id: "targets", label: "Targets" },
    { id: "team", label: "Team", tlOnly: true },
    { id: "custom", label: "Custom report" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-brand">{canFilter ? "Sales Reports" : "My Sales Reports"}</h1>
        <p className="text-sm text-slate-muted">
          Who to call next, who slipped through, and how you&apos;re tracking against target — plus analytics when you need them.
        </p>
        {scopeLabel ? <p className="mt-1 text-xs font-medium text-brand">Viewing: {scopeLabel}</p> : null}
      </div>

      <Card className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filters</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {canFilter ? (
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              {scopeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : null}
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={segment}
            onChange={(e) => setSegment(e.target.value as SegmentFilter)}
          >
            <option value="all">All segments</option>
            <option value="candidate">Potential</option>
            <option value="renewal">Renewal</option>
            <option value="re_engage">Re-engage</option>
          </select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To" />
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <Button className="flex-1" onClick={() => void loadCore()}>
              Apply
            </Button>
            <Button variant="secondary" onClick={resetFilters}>
              Reset
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-slate-muted">
          Date range filters pipeline activity (last updated), pipeline snapshot, and calls. Month filters target achievement.
        </p>
      </Card>

      {segmentTheme ? (
        <div className={`rounded-xl border p-3 ${segmentTheme.banner}`}>
          <p className="text-sm font-semibold text-brand">{segmentTheme.label}</p>
          <p className="text-xs text-slate-muted">{segmentTheme.subtitle}</p>
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-muted">Loading reports…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <button type="button" className="text-left" onClick={() => jumpToAction("closing")}>
              <Card className="transition hover:border-teal-300 hover:shadow-sm">
                <p className="text-xs text-slate-500">Closing next</p>
                <p className="text-2xl font-bold text-emerald-700">{priorities?.counts.closingSoon ?? summary?.hot ?? 0}</p>
                <p className="text-[10px] text-slate-muted">Confirm · Senior · Demo · Demo today</p>
              </Card>
            </button>
            <button type="button" className="text-left" onClick={() => jumpToAction("tasks")}>
              <Card className="transition hover:border-teal-300 hover:shadow-sm">
                <p className="text-xs text-slate-500">Tasks due / overdue</p>
                <p className="text-2xl font-bold text-brand">
                  {(priorities?.counts.todayTasks ?? 0) + (priorities?.counts.overdueTasks ?? 0)}
                </p>
                <p className="text-[10px] text-slate-muted">
                  {priorities?.counts.overdueTasks ?? 0} overdue
                </p>
              </Card>
            </button>
            <button type="button" className="text-left" onClick={() => jumpToAction("left_out")}>
              <Card className="transition hover:border-teal-300 hover:shadow-sm">
                <p className="text-xs text-slate-500">Left out</p>
                <p className="text-2xl font-bold text-amber-700">{priorities?.counts.leftOut ?? 0}</p>
                <p className="text-[10px] text-slate-muted">Stale · no contact · untouched</p>
              </Card>
            </button>
            <Card>
              <p className="text-xs text-slate-500">Deals closed ({month})</p>
              <p className="text-2xl font-bold text-emerald-700">{targets?.actuals?.sold ?? 0}</p>
              {targetsGap.soldRemaining > 0 ? (
                <p className="text-[10px] text-amber-700">{targetsGap.soldRemaining} to target</p>
              ) : (
                <p className="text-[10px] text-slate-muted">On track</p>
              )}
            </Card>
            <Card>
              <p className="text-xs text-slate-500">Revenue ({month})</p>
              <p className="text-lg font-bold text-brand">
                ₹{Number(targets?.actuals?.revenue ?? 0).toLocaleString("en-IN")}
              </p>
              <p className="text-xs text-slate-muted">
                {pct(Number(targets?.actuals?.revenue ?? 0), targets?.target?.targetRevenue)}% of target
              </p>
            </Card>
            <Card>
              <p className="text-xs text-slate-500">Active pipeline</p>
              <p className="text-2xl font-bold text-brand">{summary?.totalActive ?? 0}</p>
            </Card>
          </div>

          {segmentBreakdown.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {segmentBreakdown.map((s) => (
                <span
                  key={s.muaType}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                >
                  {s.label}: <strong>{s.count}</strong>
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {tabs
              .filter((t) => !t.tlOnly || isTeamLead)
              .map((t) => (
                <Button
                  key={t.id}
                  size="sm"
                  variant={tab === t.id ? "primary" : "secondary"}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </Button>
              ))}
          </div>

          {tab === "actions" && priorities ? (
            <SalesActionBoard
              closingSoon={priorities.closingSoon}
              leftOut={priorities.leftOut}
              dueTodayTasks={priorities.dueTodayTasks}
              overdueTasks={priorities.overdueTasks}
              counts={priorities.counts}
              targetsGap={targetsGap}
              month={month}
              showAssignee={canFilter}
              focus={actionFocus}
              onFocusChange={setActionFocus}
              onOpenPipeline={setSelectedPipelineId}
            />
          ) : null}

          {tab === "analytics" ? (
            <div className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-2">
                <Card>
                  <p className="mb-2 text-sm font-semibold text-brand">Pipeline by stage</p>
                  <p className="mb-2 text-xs text-slate-muted">Click a stage below to filter the MUA list.</p>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stageRollup}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="stage" angle={-25} textAnchor="end" interval={0} height={70} tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar
                          dataKey="count"
                          fill="#0D7377"
                          radius={[4, 4, 0, 0]}
                          cursor="pointer"
                          onClick={(data) => {
                            const stage = (data as { stage?: string })?.stage;
                            if (stage) setPipelineStageFilter(stage);
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
                <Card>
                  <p className="mb-2 text-sm font-semibold text-brand">Call trend</p>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={[...calls].slice(0, 14).reverse()}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="day"
                          tickFormatter={(d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Line type="monotone" dataKey="calls" stroke="#0D7377" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="mt-2 text-xs text-slate-muted">
                    {totalCalls} calls · {totalDurationMinutes} min talk · {avgAnswerRate}% avg answer rate
                  </p>
                </Card>
              </div>

              <Card className="space-y-3">
                <p className="text-sm font-semibold text-brand">Target snapshot ({month})</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">Revenue</p>
                    <p className="text-sm">
                      ₹{Number(targets?.actuals?.revenue ?? 0).toLocaleString("en-IN")} / ₹
                      {Number(targets?.target?.targetRevenue ?? 0).toLocaleString("en-IN")}
                    </p>
                    <div className="mt-1 h-2 rounded bg-slate-100">
                      <div
                        className={`h-2 rounded ${progressClass(pct(Number(targets?.actuals?.revenue ?? 0), targets?.target?.targetRevenue))}`}
                        style={{
                          width: `${Math.min(pct(Number(targets?.actuals?.revenue ?? 0), targets?.target?.targetRevenue), 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Sold (total)</p>
                    <p className="text-sm">
                      {targets?.actuals?.sold ?? 0} /{" "}
                      {targets?.target?.targetSoldTotal ??
                        (Number(targets?.target?.targetPotentialSold ?? 0) +
                          Number(targets?.target?.targetExistingSold ?? 0) || "—")}
                    </p>
                    <div className="mt-1 h-2 rounded bg-slate-100">
                      <div
                        className={`h-2 rounded ${progressClass(
                          pct(
                            Number(targets?.actuals?.sold ?? 0),
                            Number(
                              targets?.target?.targetSoldTotal ??
                                Number(targets?.target?.targetPotentialSold ?? 0) +
                                  Number(targets?.target?.targetExistingSold ?? 0),
                            ),
                          ),
                        )}`}
                        style={{
                          width: `${Math.min(
                            pct(
                              Number(targets?.actuals?.sold ?? 0),
                              Number(
                                targets?.target?.targetSoldTotal ??
                                  Number(targets?.target?.targetPotentialSold ?? 0) +
                                    Number(targets?.target?.targetExistingSold ?? 0),
                              ),
                            ),
                            100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <p className="mb-2 text-sm font-semibold text-brand">Closed this month ({closedDeals.length})</p>
                {closedDeals.length ? (
                  <Table>
                    <THead>
                      <TR>
                        <TH>MUA</TH>
                        <TH>Segment</TH>
                        <TH>Revenue</TH>
                        <TH>Closed</TH>
                        {canFilter ? <TH>By</TH> : null}
                      </TR>
                    </THead>
                    <TBody>
                      {closedDeals.map((r) => (
                        <TR key={r.id}>
                          <TD>
                            <button
                              type="button"
                              className="font-medium text-accent hover:underline"
                              onClick={() => setSelectedPipelineId(r.id)}
                            >
                              {r.muaName}
                            </button>
                            {r.muaCity ? <p className="text-xs text-slate-muted">{r.muaCity}</p> : null}
                          </TD>
                          <TD>{salesPipelineMuaTypeLabel(r.muaType)}</TD>
                          <TD>₹{Number(r.revenue ?? 0).toLocaleString("en-IN")}</TD>
                          <TD>{new Date(r.closedAt).toLocaleDateString("en-IN")}</TD>
                          {canFilter ? <TD>{r.closedByName ?? "—"}</TD> : null}
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                ) : (
                  <p className="text-sm text-slate-muted">No deals closed in {month} yet.</p>
                )}
              </Card>

              <Card>
                <p className="mb-2 text-sm font-semibold text-brand">Recent calls</p>
                {recentCalls.length ? (
                  <Table>
                    <THead>
                      <TR>
                        <TH>When</TH>
                        <TH>MUA</TH>
                        <TH>Stage</TH>
                        <TH>Duration</TH>
                        <TH>Outcome</TH>
                        {canFilter ? <TH>Staff</TH> : null}
                      </TR>
                    </THead>
                    <TBody>
                      {recentCalls.map((r) => (
                        <TR key={r.id}>
                          <TD className="text-xs">
                            {new Date(r.calledAt).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TD>
                          <TD>
                            {r.pipelineId && r.muaName ? (
                              <button
                                type="button"
                                className="font-medium text-accent hover:underline"
                                onClick={() => setSelectedPipelineId(r.pipelineId!)}
                              >
                                {r.muaName}
                              </button>
                            ) : (
                              (r.muaName ?? "—")
                            )}
                          </TD>
                          <TD>{r.stage ?? "—"}</TD>
                          <TD>{formatDuration(r.durationSec ?? 0)}</TD>
                          <TD>{r.outcome?.replace(/_/g, " ") ?? "—"}</TD>
                          {canFilter ? <TD>{r.staffName ?? "—"}</TD> : null}
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                ) : (
                  <p className="text-sm text-slate-muted">No calls in this date range.</p>
                )}
              </Card>

              <Card className="space-y-3">
                <p className="text-sm font-semibold text-brand">Pipeline MUAs</p>
                {stageFilterBar(pipelineStageFilter, setPipelineStageFilter)}
                <SalesPipelineDetailTable
                  rows={filteredPipelineRows}
                  showPrice
                  showDaysInStage
                  showNote
                  showAssignee={canFilter}
                  onOpenPipeline={setSelectedPipelineId}
                />
              </Card>
            </div>
          ) : null}

          {tab === "pipeline" ? (
            <div className="space-y-3">
              <Card>
                <p className="mb-2 text-sm font-semibold text-brand">Stage summary</p>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stageRollup}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="stage" angle={-25} textAnchor="end" interval={0} height={70} tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#0D7377" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              {stageFilterBar(pipelineStageFilter, setPipelineStageFilter)}
              <Card>
                <p className="mb-3 text-sm font-semibold text-brand">
                  {filteredPipelineRows.length} MUA{filteredPipelineRows.length === 1 ? "" : "s"}
                  {pipelineStageFilter !== "all" ? ` in ${pipelineStageFilter}` : " in pipeline"}
                </p>
                <SalesPipelineDetailTable
                  rows={filteredPipelineRows}
                  showPrice
                  showDaysInStage
                  showNote
                  showAssignee={canFilter}
                  onOpenPipeline={setSelectedPipelineId}
                />
              </Card>
            </div>
          ) : null}

          {tab === "funnel" ? (
            <div className="space-y-3">
              <Card>
                <p className="mb-2 text-sm font-semibold text-brand">Pipeline snapshot by stage</p>
                <p className="mb-2 text-xs text-slate-muted">
                  Current active pipeline counts — not stage-to-stage conversion.
                </p>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stageSnapshot}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="stage" angle={-25} textAnchor="end" interval={0} height={90} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#0D7377" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Table>
                <THead>
                  <TR>
                    <TH>Stage</TH>
                    <TH>Count</TH>
                  </TR>
                </THead>
                <TBody>
                  {stageSnapshot.map((r) => (
                    <TR key={r.stage}>
                      <TD>{r.stage}</TD>
                      <TD>{r.count}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          ) : null}

          {tab === "calls" ? (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <Card>
                  <p className="text-xs text-slate-500">Total calls</p>
                  <p className="text-2xl font-bold text-brand">{totalCalls}</p>
                </Card>
                <Card>
                  <p className="text-xs text-slate-500">Talk time (min)</p>
                  <p className="text-2xl font-bold text-brand">{totalDurationMinutes}</p>
                </Card>
                <Card>
                  <p className="text-xs text-slate-500">Avg answer rate</p>
                  <p className="text-2xl font-bold text-brand">{avgAnswerRate}%</p>
                </Card>
              </div>
              <Card>
                <div className="mb-3 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={[...calls].slice(0, 30).reverse()}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="calls" stroke="#0D7377" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <Table>
                  <THead>
                    <TR>
                      <TH>Day</TH>
                      <TH>Calls</TH>
                      <TH>Duration</TH>
                      <TH>Answer rate</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {calls.map((r) => (
                      <TR key={r.day}>
                        <TD>{new Date(r.day).toLocaleDateString("en-IN")}</TD>
                        <TD>{r.calls}</TD>
                        <TD>{formatDuration(r.durationSec ?? 0)}</TD>
                        <TD>{r.answerRate ?? "—"}%</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>
            </div>
          ) : null}

          {tab === "targets" && targets ? (
            <SalesTargetsReport
              data={targets}
              month={month}
              showTeam={canFilter && (assignee === "all" || (targets.byMember?.length ?? 0) > 1)}
              showAssignee={canFilter}
              onOpenPipeline={setSelectedPipelineId}
              onJumpToClosing={() => jumpToAction("closing")}
            />
          ) : null}

          {tab === "team" && isTeamLead ? (
            <div className="space-y-3">
              <Card>
                <p className="mb-2 text-sm font-semibold text-brand">Team activity today</p>
                <Table>
                  <THead>
                    <TR>
                      <TH>Member</TH>
                      <TH>Calls</TH>
                      <TH>Talk time</TH>
                      <TH>Stage moves</TH>
                      <TH>Tasks done</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {(daily?.teamActivity ?? []).map((r) => (
                      <TR key={r.id}>
                        <TD>{r.name}</TD>
                        <TD>{r.callsToday}</TD>
                        <TD>
                          {Math.floor((r.talkTimeTodaySec ?? 0) / 60)}m {(r.talkTimeTodaySec ?? 0) % 60}s
                        </TD>
                        <TD>{r.stageMovesToday}</TD>
                        <TD>{r.tasksDoneToday}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>
              <Card>
                <p className="mb-2 text-sm font-semibold text-brand">Individual performance</p>
                <Table>
                  <THead>
                    <TR>
                      <TH>Member</TH>
                      <TH>Pipeline</TH>
                      <TH>Closed</TH>
                      <TH>Calls (7d)</TH>
                      <TH>Avg calls/day</TH>
                      <TH>Conversion</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {individual.map((r) => {
                      const conv =
                        r.pipelineCount > 0 ? Number(((r.dealsClosed / r.pipelineCount) * 100).toFixed(1)) : 0;
                      return (
                        <TR key={r.id}>
                          <TD>{r.name}</TD>
                          <TD>{r.pipelineCount}</TD>
                          <TD>{r.dealsClosed}</TD>
                          <TD>{r.callsThisWeek ?? 0}</TD>
                          <TD>{r.avgCallsPerDay ?? 0}</TD>
                          <TD>{conv}%</TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </Card>
              <div className="grid gap-3 lg:grid-cols-2">
                <Card>
                  <p className="mb-2 text-sm font-semibold text-brand">Stuck pipeline (5d+)</p>
                  <Table>
                    <THead>
                      <TR>
                        <TH>MUA</TH>
                        <TH>Stage</TH>
                        <TH>Days</TH>
                        <TH>Assigned</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {(daily?.stuckPipeline ?? []).slice(0, 10).map((r) => (
                        <TR key={r.id}>
                          <TD>{r.muaName}</TD>
                          <TD>{r.stage}</TD>
                          <TD>{r.daysStuck}</TD>
                          <TD>{r.assignedToName ?? "Unassigned"}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </Card>
                <Card>
                  <p className="mb-2 text-sm font-semibold text-brand">Overdue tasks</p>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Staff</TH>
                        <TH>Task</TH>
                        <TH>Days overdue</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {(daily?.overdueTasks ?? []).slice(0, 10).map((r) => (
                        <TR key={r.id}>
                          <TD>{r.staffName}</TD>
                          <TD className="max-w-[200px] truncate">{r.title}</TD>
                          <TD>{r.daysOverdue}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </Card>
              </div>
              <p className="text-xs text-slate-muted">
                Daily team ops also live under{" "}
                <Link href="/sales/analysis" className="font-medium text-accent hover:underline">
                  Team Analysis
                </Link>{" "}
                — reassign stuck deals, coaching signals, and today&apos;s priorities.
              </p>
            </div>
          ) : null}

          {tab === "custom" ? (
            <CustomReportBuilder title="Sales Custom Report" apiBase="/api/admin/sales/reports/custom" />
          ) : null}

          <MuaPipelineProfile
            open={Boolean(selectedPipelineId)}
            onClose={() => setSelectedPipelineId(null)}
            pipelineId={selectedPipelineId}
          />
        </>
      )}
    </div>
  );
}
