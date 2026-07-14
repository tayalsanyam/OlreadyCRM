"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { MuaPipelineProfile } from "@/components/sales/MuaPipelineProfile";
import {
  SalesPipelineDetailTable,
  type ActionPipelineRow,
} from "@/components/sales/SalesActionBoard";
import { SalesTargetsReport, type SalesTargetsPayload } from "@/components/sales/SalesTargetsReport";
import { PIPELINE_STAGE_ORDER } from "@/lib/types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Tab = "today" | "people" | "pipeline" | "targets" | "funnel";

type DailyActivityRow = {
  id: string;
  name: string;
  callsToday: number;
  talkTimeTodaySec: number;
  stageMovesToday: number;
  tasksDoneToday: number;
  minCallsPerDay: number;
};

type ClosingSoonRow = {
  id: string;
  muaName: string;
  muaCity?: string | null;
  stage: string;
  muaType: string;
  assignedToName?: string | null;
  assignedToId?: string | null;
  daysInStage?: number;
  priceOffered?: number | null;
};

type StuckRow = {
  id: string;
  muaName: string;
  stage: string;
  daysStuck: number;
  assignedToName: string | null;
  assignedToId?: string | null;
};

type OverdueTaskRow = {
  id: string;
  title: string;
  taskType: string;
  dueDate: string;
  daysOverdue: number;
  staffName: string;
  staffId?: string;
};

type DailyPayload = {
  teamActivity: DailyActivityRow[];
  stuckPipeline: StuckRow[];
  overdueTasks: OverdueTaskRow[];
  closingSoon: ClosingSoonRow[];
  counts: { needsAction: number; stuck: number; overdueTasks: number; closingSoon: number };
};

type IndividualRow = {
  id: string;
  name: string;
  pipelineCount: number;
  dealsClosed: number;
  callsThisWeek?: number;
  avgCallsPerDay?: number;
  avgTalkTimeMinPerDay?: number;
  minCallsPerDay?: number;
  minTalkTimeMinPerDay?: number;
  targetSold?: number;
  targetSoldTotal?: number;
  targetRevenue?: number;
  overdueTasks?: number;
  dealsClosedMonth?: number;
};

type FunnelRow = { stage: string; count: number; stageToStageConversionPct?: number };

async function readJsonSafe<T>(res: Response): Promise<T | null> {
  const raw = await res.text();
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function taskPipelineId(title: string): string | null {
  const m = title.match(/\[PIPE:([0-9a-f-]{36})\]/i);
  return m?.[1] ?? null;
}

function taskMuaName(title: string): string {
  const m = title.match(/^(.+?)\s*\[PIPE:/);
  return m?.[1]?.trim() || title.replace(/\s*\[PIPE:[^\]]+\].*$/, "").trim();
}

function pct(actual: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.round((actual / target) * 100));
}

function progressClass(v: number): string {
  if (v >= 80) return "bg-emerald-600";
  if (v >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function activityStatus(calls: number, min: number): { label: string; className: string } {
  if (calls === 0) return { label: "No calls yet", className: "text-red-700 bg-red-50" };
  if (min > 0 && calls >= min) return { label: "On track", className: "text-emerald-800 bg-emerald-50" };
  if (min > 0) return { label: "Below target", className: "text-amber-800 bg-amber-50" };
  return { label: "Active", className: "text-slate-700 bg-slate-50" };
}

export function SalesTeamAnalysisClient() {
  const [tab, setTab] = useState<Tab>("today");
  const [daily, setDaily] = useState<DailyPayload | null>(null);
  const [individual, setIndividual] = useState<IndividualRow[]>([]);
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [pipelineRows, setPipelineRows] = useState<ActionPipelineRow[]>([]);
  const [targets, setTargets] = useState<(SalesTargetsPayload & { scopeLabel?: string }) | null>(null);
  const [leftOut, setLeftOut] = useState<ActionPipelineRow[]>([]);
  const [staffOptions, setStaffOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/sales/reports/scope", { cache: "no-store" })
      .then((r) => readJsonSafe<{ data?: { options?: Array<{ value: string; label: string }> } }>(r))
      .then((j) => {
        const opts = (j?.data?.options ?? []).filter((o) => /^[0-9a-f-]{36}$/i.test(o.value));
        setStaffOptions(opts.map((o) => ({ id: o.value, name: o.label })));
      });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const qs = new URLSearchParams();
      if (dateFrom) qs.set("date_from", dateFrom);
      if (dateTo) qs.set("date_to", dateTo);
      const s = qs.toString();
      const pipelineQs = new URLSearchParams(qs);
      pipelineQs.set("assignee", assigneeFilter === "all" ? "all" : assigneeFilter);

      const [dRes, iRes, fRes, pRes, tRes, priRes] = await Promise.all([
        fetch("/api/sales/analysis/daily-view", { cache: "no-store" }),
        fetch(`/api/sales/analysis/individual?${s}&month=${month}`, { cache: "no-store" }),
        fetch(`/api/sales/analysis/funnel?${s}`, { cache: "no-store" }),
        fetch(`/api/sales/reports/pipeline-rows?${pipelineQs.toString()}`, { cache: "no-store" }),
        fetch(`/api/sales/reports/targets?month=${month}&assignee=all`, { cache: "no-store" }),
        fetch("/api/sales/reports/priorities?assignee=all", { cache: "no-store" }),
      ]);
      const [d, i, f, p, t, pri] = await Promise.all([
        readJsonSafe<{ data?: DailyPayload; error?: string | null }>(dRes),
        readJsonSafe<{ data?: IndividualRow[]; error?: string | null }>(iRes),
        readJsonSafe<{ data?: FunnelRow[]; error?: string | null }>(fRes),
        readJsonSafe<{ data?: { rows?: ActionPipelineRow[] }; error?: string | null }>(pRes),
        readJsonSafe<{ data?: SalesTargetsPayload; error?: string | null }>(tRes),
        readJsonSafe<{ data?: { leftOut?: ActionPipelineRow[] }; error?: string | null }>(priRes),
      ]);
      if (!dRes.ok || d?.error) throw new Error(d?.error ?? `Daily view failed (${dRes.status})`);
      if (!iRes.ok || i?.error) throw new Error(i?.error ?? `People failed (${iRes.status})`);
      if (!fRes.ok || f?.error) throw new Error(f?.error ?? `Funnel failed (${fRes.status})`);
      if (!pRes.ok || p?.error) throw new Error(p?.error ?? `Pipeline failed (${pRes.status})`);
      if (!tRes.ok || t?.error) throw new Error(t?.error ?? `Targets failed (${tRes.status})`);

      setDaily(d?.data ?? null);
      setIndividual(i?.data ?? []);
      setFunnel(f?.data ?? []);
      setPipelineRows(p?.data?.rows ?? []);
      setTargets(t?.data ?? null);
      setLeftOut(pri?.data?.leftOut ?? []);
    } catch (err) {
      setDaily(null);
      setIndividual([]);
      setFunnel([]);
      setPipelineRows([]);
      setTargets(null);
      setLeftOut([]);
      setLoadError(err instanceof Error ? err.message : "Failed to load team analysis");
    } finally {
      setLoading(false);
    }
  }, [assigneeFilter, dateFrom, dateTo, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredPipeline = useMemo(() => {
    let rows = pipelineRows;
    if (stageFilter !== "all") rows = rows.filter((r) => r.stage === stageFilter);
    return rows;
  }, [pipelineRows, stageFilter]);

  const sortedActivity = useMemo(() => {
    return [...(daily?.teamActivity ?? [])].sort((a, b) => {
      const aCalls = Number(a.callsToday ?? 0);
      const bCalls = Number(b.callsToday ?? 0);
      const aMin = Number(a.minCallsPerDay ?? 0);
      const bMin = Number(b.minCallsPerDay ?? 0);
      const aScore = aCalls === 0 ? 0 : aMin > 0 && aCalls < aMin ? 1 : 2;
      const bScore = bCalls === 0 ? 0 : bMin > 0 && bCalls < bMin ? 1 : 2;
      return aScore - bScore || aCalls - bCalls;
    });
  }, [daily?.teamActivity]);

  const overdueByStaff = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    for (const t of daily?.overdueTasks ?? []) {
      const key = t.staffName;
      const cur = m.get(key) ?? { name: key, count: 0 };
      cur.count += 1;
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.count - a.count);
  }, [daily?.overdueTasks]);

  async function reassignPipeline(pipelineId: string, salesRmId: string) {
    await fetch(`/api/sales/pipeline/${pipelineId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ salesRmId, reason: "TL team analysis reassignment" }),
    });
    void load();
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "today", label: "Today" },
    { id: "people", label: "People" },
    { id: "pipeline", label: "Pipeline" },
    { id: "targets", label: "Targets" },
    { id: "funnel", label: "Funnel" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Team Analysis</h1>
          <p className="text-sm text-slate-muted">
            Run the team with conviction — who needs help today, where deals are stuck, and who is hitting target.
          </p>
        </div>
        <Link href="/sales/reports" className="text-sm font-medium text-accent hover:underline">
          Full reports →
        </Link>
      </div>

      <Card className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filters</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
          >
            <option value="all">All team pipeline</option>
            <option value="me">My pipeline only</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => void load()}>
              Apply
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                setMonth(new Date().toISOString().slice(0, 7));
                setAssigneeFilter("all");
                setStageFilter("all");
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      </Card>

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-muted">Loading team analysis…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button type="button" className="text-left" onClick={() => setTab("today")}>
              <Card className="transition hover:border-teal-300">
                <p className="text-xs text-slate-500">Needs action today</p>
                <p className="text-2xl font-bold text-red-700">{daily?.counts.needsAction ?? 0}</p>
                <p className="text-[10px] text-slate-muted">Members below call target or inactive</p>
              </Card>
            </button>
            <button type="button" className="text-left" onClick={() => setTab("today")}>
              <Card className="transition hover:border-teal-300">
                <p className="text-xs text-slate-500">Closing next (team)</p>
                <p className="text-2xl font-bold text-emerald-700">{daily?.counts.closingSoon ?? 0}</p>
                <p className="text-[10px] text-slate-muted">Confirm · Senior · Demo</p>
              </Card>
            </button>
            <button type="button" className="text-left" onClick={() => setTab("today")}>
              <Card className="transition hover:border-teal-300">
                <p className="text-xs text-slate-500">Stuck 5d+</p>
                <p className="text-2xl font-bold text-amber-700">{daily?.counts.stuck ?? 0}</p>
              </Card>
            </button>
            <button type="button" className="text-left" onClick={() => setTab("today")}>
              <Card className="transition hover:border-teal-300">
                <p className="text-xs text-slate-500">Overdue tasks</p>
                <p className="text-2xl font-bold text-amber-700">{daily?.counts.overdueTasks ?? 0}</p>
              </Card>
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <Button key={t.id} size="sm" variant={tab === t.id ? "primary" : "secondary"} onClick={() => setTab(t.id)}>
                {t.label}
              </Button>
            ))}
          </div>

          {tab === "today" ? (
            <div className="space-y-4">
              {overdueByStaff.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {overdueByStaff.map((s) => (
                    <span
                      key={s.name}
                      className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-800"
                    >
                      {s.name}: <strong>{s.count}</strong> overdue
                    </span>
                  ))}
                </div>
              ) : null}

              <Card>
                <p className="mb-2 text-sm font-semibold text-brand">Team activity today</p>
                <p className="mb-3 text-xs text-slate-muted">Sorted by who needs attention first.</p>
                <Table>
                  <THead>
                    <TR>
                      <TH>Member</TH>
                      <TH>Calls</TH>
                      <TH>Target</TH>
                      <TH>Talk time</TH>
                      <TH>Moves</TH>
                      <TH>Tasks done</TH>
                      <TH>Status</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {sortedActivity.map((r) => {
                      const calls = Number(r.callsToday ?? 0);
                      const min = Number(r.minCallsPerDay ?? 0);
                      const status = activityStatus(calls, min);
                      return (
                        <TR key={r.id} className={calls === 0 ? "border-l-4 border-l-red-500" : min > 0 && calls < min ? "border-l-4 border-l-amber-500" : ""}>
                          <TD className="font-medium">{r.name}</TD>
                          <TD>{calls}</TD>
                          <TD>{min > 0 ? min : "—"}</TD>
                          <TD>
                            {Math.floor((r.talkTimeTodaySec ?? 0) / 60)}m {(r.talkTimeTodaySec ?? 0) % 60}s
                          </TD>
                          <TD>{r.stageMovesToday}</TD>
                          <TD>{r.tasksDoneToday}</TD>
                          <TD>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>
                              {status.label}
                            </span>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </Card>

              <div className="grid gap-3 lg:grid-cols-2">
                <Card>
                  <p className="mb-2 text-sm font-semibold text-brand">Closing next ({daily?.closingSoon.length ?? 0})</p>
                  {(daily?.closingSoon ?? []).length ? (
                    <Table>
                      <THead>
                        <TR>
                          <TH>MUA</TH>
                          <TH>Stage</TH>
                          <TH>Assigned</TH>
                          <TH>Offer</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {(daily?.closingSoon ?? []).slice(0, 15).map((r) => (
                          <TR key={r.id} className="border-l-4 border-l-emerald-600">
                            <TD>
                              <button
                                type="button"
                                className="font-medium text-accent hover:underline"
                                onClick={() => setSelectedPipelineId(r.id)}
                              >
                                {r.muaName}
                              </button>
                            </TD>
                            <TD>{r.stage}</TD>
                            <TD>{r.assignedToName ?? "—"}</TD>
                            <TD>
                              {r.priceOffered != null && Number(r.priceOffered) > 0
                                ? `₹${Number(r.priceOffered).toLocaleString("en-IN")}`
                                : "—"}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  ) : (
                    <p className="text-sm text-slate-muted">No team deals in late stages right now.</p>
                  )}
                </Card>

                <Card>
                  <p className="mb-2 text-sm font-semibold text-brand">Left out ({leftOut.length})</p>
                  <p className="mb-2 text-xs text-slate-muted">Team MUAs going stale or losing contact.</p>
                  {(leftOut ?? []).slice(0, 8).map((r) => (
                    <div key={r.id} className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <button
                        type="button"
                        className="font-medium text-accent hover:underline"
                        onClick={() => setSelectedPipelineId(r.id)}
                      >
                        {r.muaName}
                      </button>
                      <span className="text-xs text-slate-muted">{r.assignedToName ?? "Unassigned"}</span>
                    </div>
                  ))}
                  {leftOut.length > 8 ? (
                    <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => setTab("pipeline")}>
                      View all in Pipeline →
                    </button>
                  ) : null}
                </Card>
              </div>

              <Card>
                <p className="mb-2 text-sm font-semibold text-brand">Stuck pipeline (5d+)</p>
                <Table>
                  <THead>
                    <TR>
                      <TH>MUA</TH>
                      <TH>Stage</TH>
                      <TH>Days</TH>
                      <TH>Assigned</TH>
                      <TH>Reassign</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {(daily?.stuckPipeline ?? []).slice(0, 20).map((r) => (
                      <TR key={r.id} className="border-l-4 border-l-amber-500">
                        <TD>
                          <button
                            type="button"
                            className="font-medium text-accent hover:underline"
                            onClick={() => setSelectedPipelineId(r.id)}
                          >
                            {r.muaName}
                          </button>
                        </TD>
                        <TD>{r.stage}</TD>
                        <TD>{r.daysStuck}</TD>
                        <TD>{r.assignedToName ?? "Unassigned"}</TD>
                        <TD>
                          <select
                            className="rounded border border-slate-200 px-1 py-0.5 text-xs"
                            defaultValue=""
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v) return;
                              void reassignPipeline(r.id, v);
                              e.target.value = "";
                            }}
                          >
                            <option value="">Reassign…</option>
                            {staffOptions.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>

              <Card>
                <p className="mb-2 text-sm font-semibold text-brand">Overdue follow-ups</p>
                <Table>
                  <THead>
                    <TR>
                      <TH>Staff</TH>
                      <TH>MUA / task</TH>
                      <TH>Days overdue</TH>
                      <TH>Open</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {(daily?.overdueTasks ?? []).slice(0, 25).map((r) => {
                      const pipelineId = taskPipelineId(r.title);
                      return (
                        <TR key={r.id} className="border-l-4 border-l-red-500">
                          <TD>{r.staffName}</TD>
                          <TD>{taskMuaName(r.title)}</TD>
                          <TD>{r.daysOverdue}</TD>
                          <TD>
                            {pipelineId ? (
                              <button
                                type="button"
                                className="text-xs font-medium text-accent hover:underline"
                                onClick={() => setSelectedPipelineId(pipelineId)}
                              >
                                Profile
                              </button>
                            ) : (
                              <Link href="/sales/tasks" className="text-xs text-accent hover:underline">
                                Tasks
                              </Link>
                            )}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </Card>
            </div>
          ) : null}

          {tab === "people" ? (
            <Card>
              <p className="mb-2 text-sm font-semibold text-brand">Team performance ({month})</p>
              <p className="mb-3 text-xs text-slate-muted">
                Pipeline load, monthly closes, call pace vs target, and overdue work — sorted by who needs coaching first.
              </p>
              <Table>
                <THead>
                  <TR>
                    <TH>Member</TH>
                    <TH>Pipeline</TH>
                    <TH>Closed (month)</TH>
                    <TH>Target sold</TH>
                    <TH>Calls/day (7d)</TH>
                    <TH>Talk min/day</TH>
                    <TH>Overdue</TH>
                    <TH>Signal</TH>
                  </TR>
                </THead>
                <TBody>
                  {individual.map((r) => {
                    const avgCalls = Number(r.avgCallsPerDay ?? 0);
                    const minCalls = Number(r.minCallsPerDay ?? 0);
                    const overdue = Number(r.overdueTasks ?? 0);
                    const soldMonth = Number(r.dealsClosedMonth ?? 0);
                    const targetSold = Number(r.targetSoldTotal ?? r.targetSold ?? 0);
                    const soldPct = pct(soldMonth, targetSold);
                    const callsPct = pct(avgCalls, minCalls);
                    const signal =
                      overdue >= 3
                        ? { label: "Overdue pile-up", cls: "bg-red-100 text-red-800" }
                        : minCalls > 0 && callsPct < 50
                          ? { label: "Low activity", cls: "bg-amber-100 text-amber-900" }
                          : targetSold > 0 && soldPct < 40
                            ? { label: "Behind target", cls: "bg-amber-100 text-amber-900" }
                            : { label: "OK", cls: "bg-emerald-100 text-emerald-800" };
                    return (
                      <TR
                        key={r.id}
                        className={
                          overdue >= 3
                            ? "border-l-4 border-l-red-500"
                            : minCalls > 0 && callsPct < 50
                              ? "border-l-4 border-l-amber-500"
                              : ""
                        }
                      >
                        <TD className="font-medium">{r.name}</TD>
                        <TD>{r.pipelineCount}</TD>
                        <TD>{soldMonth}</TD>
                        <TD>{targetSold > 0 ? targetSold : "—"}</TD>
                        <TD>
                          {avgCalls}
                          {minCalls > 0 ? ` / ${minCalls}` : ""}
                        </TD>
                        <TD>
                          {Number(r.avgTalkTimeMinPerDay ?? 0)}
                          {Number(r.minTalkTimeMinPerDay ?? 0) > 0 ? ` / ${r.minTalkTimeMinPerDay}` : ""}
                        </TD>
                        <TD>{overdue > 0 ? overdue : "—"}</TD>
                        <TD>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${signal.cls}`}>
                            {signal.label}
                          </span>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          ) : null}

          {tab === "pipeline" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStageFilter("all")}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    stageFilter === "all" ? "border-brand bg-brand text-white" : "border-slate-200 bg-white"
                  }`}
                >
                  All ({pipelineRows.length})
                </button>
                {PIPELINE_STAGE_ORDER.map((stage) => {
                  const count = pipelineRows.filter((r) => r.stage === stage).length;
                  if (!count) return null;
                  return (
                    <button
                      key={stage}
                      type="button"
                      onClick={() => setStageFilter(stage)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        stageFilter === stage ? "border-brand bg-brand text-white" : "border-slate-200 bg-white"
                      }`}
                    >
                      {stage} ({count})
                    </button>
                  );
                })}
              </div>
              <Card>
                <SalesPipelineDetailTable
                  rows={filteredPipeline}
                  showPrice
                  showDaysInStage
                  showNote
                  showAssignee
                  onOpenPipeline={setSelectedPipelineId}
                />
              </Card>
            </div>
          ) : null}

          {tab === "targets" && targets ? (
            <SalesTargetsReport
              data={targets}
              month={month}
              showTeam
              showAssignee
              onOpenPipeline={setSelectedPipelineId}
            />
          ) : null}

          {tab === "funnel" ? (
            <div className="space-y-3">
              <Card>
                <p className="mb-2 text-sm font-semibold text-brand">Team funnel conversion</p>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnel}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="stage" angle={-25} textAnchor="end" interval={0} height={90} tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {funnel.map((r, i) => {
                          const p = Number(r.stageToStageConversionPct ?? 0);
                          const fill = p >= 60 ? "#16a34a" : p >= 40 ? "#d97706" : "#dc2626";
                          return <Cell key={i} fill={fill} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Table>
                <THead>
                  <TR>
                    <TH>Stage</TH>
                    <TH>Count</TH>
                    <TH>Stage-to-stage %</TH>
                    <TH>Read</TH>
                  </TR>
                </THead>
                <TBody>
                  {funnel.map((r) => {
                    const p = Number(r.stageToStageConversionPct ?? 0);
                    const read =
                      p >= 60 ? "Healthy flow" : p >= 40 ? "Some drop-off — coach stage moves" : "Bottleneck — investigate";
                    return (
                      <TR key={r.stage}>
                        <TD>{r.stage}</TD>
                        <TD>{r.count}</TD>
                        <TD>{p}%</TD>
                        <TD className="text-xs text-slate-muted">{read}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
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
