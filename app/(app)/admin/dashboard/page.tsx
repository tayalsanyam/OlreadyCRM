"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  AlertTriangle,
  Clock,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Phone,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { TargetVsActualSection } from "@/components/admin/TargetVsActualSection";
import { buildBackendDashboardSections } from "@/lib/backend-dashboard-export";
import { downloadOverviewCsv } from "@/lib/download-overview-csv";
import {
  buildOverviewMonthQuery,
  defaultOverviewMonth,
  overviewMonthLabel,
} from "@/lib/admin-overview-date-range";
import type { TargetRow } from "@/lib/targets";
import { cn } from "@/lib/utils";

type StaffRow = {
  id: string;
  name: string;
  role: "regional_rm" | "commission_rm";
  region: string | null;
  activeLeads: number;
  bookedMtd: number;
  pushesMtd: number;
  criticalUntouched: number;
  pendingConfirmation: number;
  overdueTasks: number;
  bypassesWeek: number;
  conversionRate: number;
  hasCallyzer: boolean;
  callsMtd: number;
  talkMinutesMtd: number;
  lastCallAt: string | null;
  daysSinceLastCall: number | null;
};

type CallyzerSummary = {
  mappedStaff: number;
  callsMtd: number;
  talkMinutesMtd: number;
  staleStaff: number;
  lastSyncAt: string | null;
};

interface DashboardData {
  month: string;
  monthLabel: string;
  kpis: {
    activeLeads: number;
    commissionPipeline: number;
    criticalBand: number;
    approachingShift: number;
    bookingsMtd: number;
    activeLeadsDelta: number;
    bookingsMtdDelta: number;
    criticalBandDelta: number | null;
    approachingShiftDelta: number | null;
  };
  staffPortfolio: StaffRow[];
  summary: {
    regionalRmCount: number;
    commissionRmCount: number;
    commissionLeads: number;
    callyzer?: CallyzerSummary;
  };
  callyzer?: CallyzerSummary;
}

type PortfolioTab = "all" | "regional_rm" | "commission_rm";

const ROLE_LABEL: Record<StaffRow["role"], string> = {
  regional_rm: "Regional RM",
  commission_rm: "Commission RM",
};

function formatLastCall(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function callyzerCellClass(row: StaffRow): string {
  if (!row.hasCallyzer) return "text-slate-muted";
  if (row.lastCallAt == null) return "text-red-600";
  if ((row.daysSinceLastCall ?? 0) >= 3) return "text-amber-600";
  return "text-brand";
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState<PortfolioTab>("all");
  const [month, setMonth] = useState(defaultOverviewMonth);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (nextMonth: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/dashboard?${buildOverviewMonthQuery(nextMonth)}`);
      const json = (await res.json()) as { data: DashboardData };
      setData(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(defaultOverviewMonth());
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (tab === "all") return data.staffPortfolio;
    return data.staffPortfolio.filter((s) => s.role === tab);
  }, [data, tab]);

  async function downloadExcel() {
    if (!data) return;
    const targetsRes = await fetch(`/api/admin/targets?month=${encodeURIComponent(data.month)}`).then(
      (r) => r.json(),
    );
    const targets = (targetsRes.data ?? []) as TargetRow[];
    const sections = buildBackendDashboardSections({
      kpis: data.kpis,
      summary: data.summary,
      callyzer: data.callyzer ?? data.summary.callyzer,
      staffPortfolio: data.staffPortfolio,
      targets,
      tab,
    });
    downloadOverviewCsv("backend-overview", sections);
  }

  if (!data) {
    return <div className="h-64 animate-pulse rounded-xl bg-slate-200" />;
  }

  const k = data.kpis;
  const callyzer = data.callyzer ?? data.summary.callyzer;
  const periodLabel = data.monthLabel || overviewMonthLabel(month);
  const isCurrentMonth = data.month === defaultOverviewMonth();
  const periodScope = isCurrentMonth ? "MTD" : "month";

  const kpis = [
    {
      label: "Active leads",
      value: k.activeLeads,
      delta: k.activeLeadsDelta,
      deltaLabel: "vs last week",
      invertTrend: false,
      icon: Users,
      iconBg: "bg-blue-100 text-blue-700",
      border: "",
    },
    {
      label: "Commission pipeline",
      value: k.commissionPipeline,
      delta: null,
      deltaLabel: null,
      invertTrend: false,
      icon: ArrowRightLeft,
      iconBg: "bg-violet-100 text-violet-700",
      border: k.commissionPipeline > 0 ? "border-violet-200 ring-1 ring-violet-100" : "",
    },
    {
      label: "Critical band",
      value: k.criticalBand,
      delta: k.criticalBandDelta,
      deltaLabel: null,
      invertTrend: true,
      icon: AlertTriangle,
      iconBg: "bg-red-100 text-red-700",
      border: k.criticalBand > 0 ? "border-red-300 ring-1 ring-red-100" : "",
    },
    {
      label: "Approaching shift",
      value: k.approachingShift,
      delta: k.approachingShiftDelta,
      deltaLabel: null,
      invertTrend: true,
      icon: Clock,
      iconBg: "bg-amber-100 text-amber-700",
      border: k.approachingShift > 0 ? "border-amber-300 ring-1 ring-amber-100" : "",
    },
    {
      label: `Bookings (${periodScope})`,
      value: k.bookingsMtd,
      delta: k.bookingsMtdDelta,
      deltaLabel: "vs prior month",
      invertTrend: false,
      icon: CheckCircle,
      iconBg: "bg-emerald-100 text-emerald-700",
      border: "",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand">RM Overview</h1>
          <p className="mt-1 text-sm text-slate-muted">
            Regional and commission RM workload — leads, risk, and conversion at a glance.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem]">
            <label className="mb-1 block text-xs text-slate-muted">Month</label>
            <Input
              type="month"
              value={month}
              disabled={loading}
              onChange={(e) => {
                const next = e.target.value;
                if (!next) return;
                setMonth(next);
                void load(next);
              }}
            />
          </div>
          <Button variant="secondary" size="sm" onClick={() => void downloadExcel()} disabled={loading}>
            Download Excel
          </Button>
          <Link
            href="/admin/tasks?tab=rm"
            className="pb-2 text-sm font-medium text-accent hover:underline"
          >
            Open RM intake tasks →
          </Link>
        </div>
      </div>

      <p className="text-xs text-slate-muted">
        Period metrics for <span className="font-medium text-brand">{periodLabel}</span>. Active leads,
        critical band, and shift warnings are live snapshots.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((c) => {
          const Icon = c.icon;
          const showDelta = c.delta !== null && c.delta !== undefined;
          const up = (c.delta ?? 0) >= 0;
          const good = c.invertTrend ? !up : up;
          return (
            <Card key={c.label} className={cn("flex items-center gap-4", c.border)}>
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
                  c.iconBg,
                )}
              >
                <Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-3xl font-bold leading-none text-brand">{c.value}</p>
                <p className="mt-1 text-sm text-slate-muted">{c.label}</p>
                {showDelta && c.deltaLabel && (
                  <p
                    className={cn(
                      "mt-1 flex items-center gap-0.5 text-xs font-medium",
                      good ? "text-emerald-600" : "text-red-600",
                    )}
                  >
                    {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {up ? "+" : ""}
                    {c.delta} {c.deltaLabel}
                  </p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Card className="px-4 py-3">
          <p className="text-xs text-slate-muted">Regional RMs</p>
          <p className="text-xl font-bold text-brand">{data.summary.regionalRmCount}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-xs text-slate-muted">Commission RMs</p>
          <p className="text-xl font-bold text-brand">{data.summary.commissionRmCount}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-xs text-slate-muted">Leads with commission RM</p>
          <p className="text-xl font-bold text-violet-700">{data.summary.commissionLeads}</p>
        </Card>
        {callyzer && (
          <Link href="/admin/reports/day-end?tab=callActivity" className="group">
            <Card className="flex items-center gap-3 px-4 py-3 transition-colors group-hover:border-teal-200 group-hover:bg-teal-50/40">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                <Phone className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-slate-muted">Callyzer calls ({periodScope})</p>
                <p className="text-xl font-bold text-brand">{callyzer.callsMtd}</p>
                <p className="text-[10px] text-slate-muted">
                  {callyzer.talkMinutesMtd} min talk · {callyzer.mappedStaff} mapped
                  {callyzer.staleStaff > 0 && (
                    <span className="font-medium text-amber-600"> · {callyzer.staleStaff} stale</span>
                  )}
                </p>
              </div>
            </Card>
          </Link>
        )}
      </div>

      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-brand">Workload at a glance</h2>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", `All (${data.staffPortfolio.length})`],
                ["regional_rm", `Regional (${data.summary.regionalRmCount})`],
                ["commission_rm", `Commission (${data.summary.commissionRmCount})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium",
                  tab === id ? "bg-brand text-white" : "bg-slate-100 text-slate-muted hover:bg-slate-200",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200">
          <Table>
            <THead>
              <TR>
                <TH className="w-4" />
                <TH>Name</TH>
                <TH>Role</TH>
                <TH>Region</TH>
                <TH>Active</TH>
                <TH>Booked {periodScope}</TH>
                <TH>Pushes {periodScope}</TH>
                <TH>Calls {periodScope}</TH>
                <TH>Conv.</TH>
                <TH>At risk</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {filtered.length === 0 ? (
                <TR>
                  <TD colSpan={11} className="py-8 text-center text-slate-muted">
                    No staff in this view
                  </TD>
                </TR>
              ) : (
                filtered.map((row) => {
                  const pct = Math.round(row.conversionRate);
                  const atRisk =
                    row.role === "regional_rm"
                      ? row.criticalUntouched
                      : row.pendingConfirmation;
                  const atRiskHot = atRisk > 0 || row.overdueTasks > 0;
                  const roleParam =
                    row.role === "commission_rm" ? "commission_rm" : "regional_rm";

                  return (
                    <TR key={row.id} className="hover:bg-slate-50/80">
                      <TD className="w-4 pl-4">
                        <span
                          className={cn(
                            "inline-block h-2.5 w-2.5 rounded-full",
                            atRiskHot ? "bg-red-500" : "bg-emerald-500",
                          )}
                          aria-hidden
                        />
                      </TD>
                      <TD className="font-medium">{row.name}</TD>
                      <TD>
                        <Badge variant={row.role === "commission_rm" ? "muted" : "default"}>
                          {ROLE_LABEL[row.role]}
                        </Badge>
                      </TD>
                      <TD className="capitalize">{row.region ?? "—"}</TD>
                      <TD>{row.activeLeads}</TD>
                      <TD className="font-medium tabular-nums">{row.bookedMtd}</TD>
                      <TD className="tabular-nums">{row.pushesMtd}</TD>
                      <TD>
                        {!row.hasCallyzer ? (
                          <span className="text-xs text-slate-muted">—</span>
                        ) : (
                          <div className={cn("tabular-nums", callyzerCellClass(row))}>
                            <p className="text-sm font-medium">{row.callsMtd}</p>
                            <p className="text-[10px]">
                              {row.talkMinutesMtd}m
                              {formatLastCall(row.daysSinceLastCall) && (
                                <> · {formatLastCall(row.daysSinceLastCall)}</>
                              )}
                            </p>
                          </div>
                        )}
                      </TD>
                      <TD className="tabular-nums text-sm">{pct}%</TD>
                      <TD>
                        {atRiskHot ? (
                          <span className="text-xs font-medium text-red-600">
                            {atRisk > 0 && `${atRisk} risk`}
                            {atRisk > 0 && row.overdueTasks > 0 && " · "}
                            {row.overdueTasks > 0 && `${row.overdueTasks} overdue`}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-muted">OK</span>
                        )}
                      </TD>
                      <TD>
                        <div className="flex flex-col items-end gap-1">
                          <Link
                            href={`/admin/tasks?tab=rm&role=${roleParam}`}
                            className="text-sm font-medium text-accent hover:underline"
                          >
                            Tasks
                          </Link>
                          <Link
                            href={`/admin/reports?rm=${encodeURIComponent(row.name)}`}
                            className="text-xs text-slate-muted hover:underline"
                          >
                            Reports
                          </Link>
                        </div>
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-slate-muted">
          Active = open leads on their queue. Booked / pushes / calls = selected month
          {isCurrentMonth ? " (through today)" : ""} (calls from Callyzer). Booked counts exclude
          cancelled bookings. Conversion = lifetime booked ÷ all leads worked. Stale = no call in 3+
          days for mapped numbers. See targets section below for monthly goal tracking.
        </p>
      </div>

      <TargetVsActualSection month={data.month} monthLabel={periodLabel} />
    </div>
  );
}
