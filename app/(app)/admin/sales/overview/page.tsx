"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import {
  AdminSalesFilters,
  EMPTY_ADMIN_SALES_FILTERS,
  buildAdminSalesQuery,
  type AdminSalesFilterValues,
} from "@/components/admin/sales/AdminSalesFilters";
import { buildSalesOverviewSections } from "@/lib/sales-overview-export";
import { downloadOverviewCsv } from "@/lib/download-overview-csv";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  Cell,
} from "recharts";

type MemberRow = {
  staffId: string;
  name: string;
  role: string;
  teamId: string | null;
  teamName: string | null;
  activePipeline: number;
  confirmStage: number;
  dealsClosedMtd: number;
  revenueMtd: number;
  callsMtd: number;
  talkMinutesMtd: number;
  overdueTasks: number;
  targetRevenue: number | null;
  targetPotentialSold: number | null;
  targetExistingSold: number | null;
  targetSoldTotal: number | null;
  revenuePct: number | null;
  soldPct: number | null;
};

type PerformanceData = {
  month: string;
  summary: {
    totalPipeline: number;
    unassigned: number;
    potential: number;
    renewal: number;
    reEngage: number;
    confirm: number;
    closed: number;
    revenue: number;
    closeRate: number;
  };
  members: MemberRow[];
  teams: Array<{ id: string; name: string; memberCount: number }>;
};

type TeamTab = "all" | "unassigned" | string;

const ROLE_LABEL: Record<string, string> = {
  sales_rm: "Sales RM",
  sales_tl: "Team lead",
};

function pctClass(p: number | null): string {
  if (p === null) return "text-slate-muted";
  if (p >= 80) return "text-emerald-600";
  if (p >= 50) return "text-amber-600";
  return "text-red-600";
}

function barColor(p: number | null): string {
  if (p === null) return "bg-slate-300";
  if (p >= 80) return "bg-emerald-500";
  if (p >= 50) return "bg-amber-500";
  return "bg-red-500";
}

export default function AdminSalesOverviewPage() {
  const [filters, setFilters] = useState<AdminSalesFilterValues>(EMPTY_ADMIN_SALES_FILTERS);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [funnel, setFunnel] = useState<any[]>([]);
  const [source, setSource] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [teamTab, setTeamTab] = useState<TeamTab>("all");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = buildAdminSalesQuery(filters);
    try {
      const [perfRes, funnelRes, sourceRes, callsRes] = await Promise.all([
        fetch(`/api/admin/sales/reports/member-performance?${qs}`).then((r) => r.json()),
        fetch(`/api/admin/sales/reports/conversion-funnel?${qs}`).then((r) => r.json()),
        fetch(`/api/admin/sales/reports/source-analysis?${qs}`).then((r) => r.json()),
        fetch(`/api/admin/sales/reports/call-activity?${qs}`).then((r) => r.json()),
      ]);
      setPerformance(perfRes.data ?? null);
      setFunnel(funnelRes.data ?? []);
      setSource(sourceRes.data ?? []);
      setCalls(callsRes.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = performance?.summary ?? {
    totalPipeline: 0,
    unassigned: 0,
    potential: 0,
    renewal: 0,
    reEngage: 0,
    confirm: 0,
    closed: 0,
    revenue: 0,
    closeRate: 0,
  };

  const callsByDay = useMemo(() => {
    const dayRows = calls.filter((r) => r.section === "byDay");
    if (dayRows.length > 0) {
      return dayRows
        .map((row) => ({
          day: String(row.day ?? "").slice(0, 10),
          calls: Number(row.calls ?? 0),
        }))
        .filter((row) => row.day)
        .sort((a, b) => a.day.localeCompare(b.day))
        .slice(-14);
    }
    const map = new Map<string, number>();
    for (const row of calls) {
      const day = String(row.day ?? "").slice(0, 10);
      if (!day) continue;
      map.set(day, (map.get(day) ?? 0) + Number(row.calls ?? 0));
    }
    return [...map.entries()]
      .map(([day, callCount]) => ({ day, calls: callCount }))
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-14);
  }, [calls]);

  const filteredMembers = useMemo(() => {
    const members = performance?.members ?? [];
    if (teamTab === "all") return members;
    if (teamTab === "unassigned") return members.filter((m) => !m.teamId);
    return members.filter((m) => m.teamId === teamTab);
  }, [performance, teamTab]);

  const memberTotals = useMemo(() => {
    return {
      pipeline: filteredMembers.reduce((n, m) => n + m.activePipeline, 0),
      closed: filteredMembers.reduce((n, m) => n + m.dealsClosedMtd, 0),
      revenue: filteredMembers.reduce((n, m) => n + m.revenueMtd, 0),
      calls: filteredMembers.reduce((n, m) => n + m.callsMtd, 0),
      overdue: filteredMembers.reduce((n, m) => n + m.overdueTasks, 0),
    };
  }, [filteredMembers]);

  const noTeamCount = (performance?.members ?? []).filter((m) => !m.teamId).length;

  const teamTabLabel = useMemo(() => {
    if (teamTab === "all") return `All (${performance?.members.length ?? 0})`;
    if (teamTab === "unassigned") return `No team (${noTeamCount})`;
    const team = performance?.teams.find((t) => t.id === teamTab);
    return team ? `${team.name} (${team.memberCount})` : teamTab;
  }, [teamTab, performance, noTeamCount]);

  function downloadExcel() {
    if (!performance) return;
    const sections = buildSalesOverviewSections({
      month: performance.month,
      filters,
      teamTabLabel,
      stats,
      memberTotals,
      members: filteredMembers,
      funnel,
      source,
      callsByDay,
    });
    downloadOverviewCsv("sales-overview", sections);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Sales Overview</h1>
          <p className="text-sm text-slate-muted">
            Team and member performance at a glance. Open Sales Reports for full pipeline drill-down.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={downloadExcel}
            disabled={!performance || loading}
          >
            Download Excel
          </Button>
          <Link href="/admin/sales/reports?tab=overview">
            <Button variant="secondary">Full pipeline report</Button>
          </Link>
          <Link href="/admin/muas/unassigned">
            <Button variant="secondary">Unassigned MUAs</Button>
          </Link>
          <Link href="/admin/sales/targets">
            <Button variant="secondary">Set targets</Button>
          </Link>
        </div>
      </div>

      <Card>
        <AdminSalesFilters
          values={filters}
          onChange={setFilters}
          onApply={() => void load()}
          onReset={() => setFilters(EMPTY_ADMIN_SALES_FILTERS)}
        />
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Card>
          <p className="text-xs text-slate-muted">Pipeline (filtered)</p>
          <p className="text-2xl font-bold text-brand">{stats.totalPipeline}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-muted">Unassigned</p>
          <p className="text-2xl font-bold text-amber-700">{stats.unassigned}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-muted">Potential</p>
          <p className="text-2xl font-bold text-brand">{stats.potential}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-muted">Renewal (T-30)</p>
          <p className="text-2xl font-bold text-amber-700">{stats.renewal}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-muted">Win-back</p>
          <p className="text-2xl font-bold text-brand">{stats.reEngage}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-muted">Confirm</p>
          <p className="text-2xl font-bold text-cyan-700">{stats.confirm}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-muted">Deals closed</p>
          <p className="text-2xl font-bold text-emerald-700">{stats.closed}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-muted">Close rate · Revenue</p>
          <p className="text-lg font-bold text-brand">{stats.closeRate}%</p>
          <p className="text-sm text-emerald-700">₹{stats.revenue.toLocaleString("en-IN")}</p>
        </Card>
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-brand">Team performance at a glance</h2>
            <p className="text-xs text-slate-muted">
              {performance?.month ?? "This month"} — pipeline, closes, revenue targets, and Callyzer calls.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTeamTab("all")}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium",
                teamTab === "all" ? "bg-brand text-white" : "bg-slate-100 text-slate-muted hover:bg-slate-200",
              )}
            >
              All ({performance?.members.length ?? 0})
            </button>
            {(performance?.teams ?? []).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTeamTab(t.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium",
                  teamTab === t.id ? "bg-brand text-white" : "bg-slate-100 text-slate-muted hover:bg-slate-200",
                )}
              >
                {t.name} ({t.memberCount})
              </button>
            ))}
            {noTeamCount > 0 && (
              <button
                type="button"
                onClick={() => setTeamTab("unassigned")}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium",
                  teamTab === "unassigned"
                    ? "bg-brand text-white"
                    : "bg-slate-100 text-slate-muted hover:bg-slate-200",
                )}
              >
                No team ({noTeamCount})
              </button>
            )}
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-3 text-sm">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2">
            <span className="text-slate-muted">Active pipeline </span>
            <span className="font-semibold text-brand">{memberTotals.pipeline}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2">
            <span className="text-slate-muted">Closed MTD </span>
            <span className="font-semibold text-brand">{memberTotals.closed}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2">
            <span className="text-slate-muted">Revenue MTD </span>
            <span className="font-semibold text-emerald-700">
              ₹{memberTotals.revenue.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2">
            <span className="text-slate-muted">Calls MTD </span>
            <span className="font-semibold text-brand">{memberTotals.calls}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2">
            <span className="text-slate-muted">Overdue tasks </span>
            <span
              className={cn(
                "font-semibold",
                memberTotals.overdue > 0 ? "text-red-600" : "text-brand",
              )}
            >
              {memberTotals.overdue}
            </span>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200">
          <Table>
            <THead>
              <TR>
                <TH>Member</TH>
                <TH>Team</TH>
                <TH>Pipeline</TH>
                <TH>Confirm</TH>
                <TH>Closed MTD</TH>
                <TH>Revenue MTD</TH>
                <TH>Target</TH>
                <TH>Calls MTD</TH>
                <TH>Overdue</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {loading && filteredMembers.length === 0 ? (
                <TR>
                  <TD colSpan={10} className="py-8 text-center text-slate-muted">
                    Loading…
                  </TD>
                </TR>
              ) : filteredMembers.length === 0 ? (
                <TR>
                  <TD colSpan={10} className="py-8 text-center text-slate-muted">
                    No sales members in this view
                  </TD>
                </TR>
              ) : (
                filteredMembers.map((row) => (
                  <TR key={row.staffId} className="hover:bg-slate-50/80">
                    <TD>
                      <p className="font-medium">{row.name}</p>
                      <Badge variant={row.role === "sales_tl" ? "default" : "muted"} className="mt-0.5">
                        {ROLE_LABEL[row.role] ?? row.role}
                      </Badge>
                    </TD>
                    <TD className="text-sm">{row.teamName ?? <span className="text-slate-muted">—</span>}</TD>
                    <TD className="tabular-nums">{row.activePipeline}</TD>
                    <TD className="tabular-nums">{row.confirmStage}</TD>
                    <TD className="tabular-nums font-medium">{row.dealsClosedMtd}</TD>
                    <TD className="tabular-nums font-medium text-emerald-700">
                      ₹{row.revenueMtd.toLocaleString("en-IN")}
                    </TD>
                    <TD>
                      {row.targetRevenue != null && row.targetRevenue > 0 ? (
                        <div className="min-w-[88px]">
                          <p className="text-sm tabular-nums">
                            {row.revenuePct}%
                            <span className="text-slate-muted">
                              {" "}
                              · ₹{row.revenueMtd.toLocaleString("en-IN")} /{" "}
                              {row.targetRevenue.toLocaleString("en-IN")}
                            </span>
                          </p>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={cn("h-full rounded-full", barColor(row.revenuePct))}
                              style={{ width: `${Math.min(row.revenuePct ?? 0, 100)}%` }}
                            />
                          </div>
                          {row.targetSoldTotal != null && row.targetSoldTotal > 0 && (
                            <p className={cn("mt-0.5 text-[10px] font-medium", pctClass(row.soldPct))}>
                              {row.dealsClosedMtd} / {row.targetSoldTotal} deals ({row.soldPct}%)
                              {(row.targetPotentialSold ?? 0) > 0 || (row.targetExistingSold ?? 0) > 0 ? (
                                <span className="font-normal text-slate-muted">
                                  {" "}
                                  · {row.targetPotentialSold ?? 0}P + {row.targetExistingSold ?? 0}E
                                </span>
                              ) : null}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-muted">No target</span>
                      )}
                    </TD>
                    <TD>
                      <p className="text-sm tabular-nums font-medium">{row.callsMtd}</p>
                      <p className="text-[10px] text-slate-muted">{row.talkMinutesMtd}m talk</p>
                    </TD>
                    <TD className="tabular-nums">
                      {row.overdueTasks > 0 ? (
                        <span className="text-sm font-semibold text-red-600">{row.overdueTasks}</span>
                      ) : (
                        <span className="text-sm text-slate-muted">0</span>
                      )}
                    </TD>
                    <TD>
                      <Link
                        href={`/admin/sales/reports?tab=targets&assigned_to=${row.staffId}`}
                        className="text-sm font-medium text-accent hover:underline"
                      >
                        Detail
                      </Link>
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-slate-muted">
          Pipeline counts respect filters above. Closed / revenue MTD use payment month. Calls from Callyzer
          sync. Overdue = pending sales follow-up or senior-call tasks past due date.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <p className="text-sm font-semibold text-brand">Conversion funnel</p>
          <div className="mt-2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="stage" hide />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                  {funnel.map((r, i) => {
                    const pct = Number(r.conversionPct ?? 0);
                    const fill = pct >= 60 ? "#16a34a" : pct >= 40 ? "#d97706" : "#dc2626";
                    return <Cell key={i} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="lg:col-span-1">
          <p className="text-sm font-semibold text-brand">Source mix</p>
          <div className="mt-2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={source.slice(0, 6)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="source" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="total" fill="#0D7377" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="lg:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-brand">Call activity</p>
            <Link href="/admin/sales/reports?tab=calls" className="text-xs text-accent hover:underline">
              Full report →
            </Link>
          </div>
          <div className="mt-2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={callsByDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="calls" stroke="#0D7377" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
