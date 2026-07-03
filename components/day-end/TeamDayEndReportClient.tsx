"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OverviewDateRangeFilter } from "@/components/admin/OverviewDateRangeFilter";
import { DayEndFormByTemplate } from "@/components/day-end/DayEndForm";
import type { DayEndCheckoutRow } from "@/lib/day-end";
import { addDaysToYmd, todayIstYmd } from "@/lib/day-end";
import type {
  DayEndCumulativeOverview,
  DayEndOverview,
} from "@/lib/day-end-queries";
import {
  buildOverviewDateQuery,
  defaultOverviewDateRange,
  overviewDateRangeLabel,
  type OverviewDateRange,
} from "@/lib/admin-overview-date-range";
import { formatDate } from "@/lib/utils";

type ViewMode = "daily" | "cumulative";

function statusBadge(status: string) {
  if (status === "submitted") return <Badge variant="success">Submitted</Badge>;
  if (status === "leave") return <Badge variant="muted">Leave</Badge>;
  return <Badge variant="critical">Missing</Badge>;
}

function complianceBadge(pct: number) {
  if (pct >= 90) return <Badge variant="success">{pct}%</Badge>;
  if (pct >= 70) return <Badge variant="muted">{pct}%</Badge>;
  return <Badge variant="critical">{pct}%</Badge>;
}

type Props = {
  currentUserId: string;
};

export function TeamDayEndReportClient({ currentUserId }: Props) {
  const [mode, setMode] = useState<ViewMode>("daily");
  const [selectedDate, setSelectedDate] = useState(todayIstYmd);
  const [appliedDate, setAppliedDate] = useState(todayIstYmd);
  const [range, setRange] = useState<OverviewDateRange>(defaultOverviewDateRange);
  const [appliedRange, setAppliedRange] = useState<OverviewDateRange>(defaultOverviewDateRange);
  const [dailyData, setDailyData] = useState<DayEndOverview | null>(null);
  const [cumulativeData, setCumulativeData] = useState<DayEndCumulativeOverview | null>(null);
  const [detail, setDetail] = useState<(DayEndCheckoutRow & { staffName?: string }) | null>(null);
  const [loading, setLoading] = useState(false);

  const sortRows = <T extends { staffId: string; staffName: string }>(rows: T[]) =>
    [...rows].sort((a, b) => {
      if (a.staffId === currentUserId) return -1;
      if (b.staffId === currentUserId) return 1;
      return a.staffName.localeCompare(b.staffName);
    });

  const loadDaily = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/me/day-end/team?date=${encodeURIComponent(date)}&mode=day`, {
        cache: "no-store",
      });
      const json = (await res.json()) as { data: DayEndOverview | null };
      setDailyData(json.data);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCumulative = useCallback(async (nextRange: OverviewDateRange) => {
    setLoading(true);
    try {
      const qs = `${buildOverviewDateQuery(nextRange)}&mode=cumulative`;
      const res = await fetch(`/api/me/day-end/team?${qs}`, { cache: "no-store" });
      const json = (await res.json()) as { data: DayEndCumulativeOverview | null };
      setCumulativeData(json.data);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "daily") void loadDaily(appliedDate);
    else void loadCumulative(appliedRange);
  }, [mode, appliedDate, appliedRange, loadDaily, loadCumulative]);

  async function openDetail(checkoutId: string) {
    const res = await fetch(`/api/me/day-end/team?checkoutId=${encodeURIComponent(checkoutId)}`);
    const json = (await res.json()) as {
      data: (DayEndCheckoutRow & { staffName?: string }) | null;
    };
    if (!res.ok || !json.data) return;
    setDetail(json.data);
  }

  function jumpToDaily(date: string) {
    setMode("daily");
    setSelectedDate(date);
    setAppliedDate(date);
  }

  const dailyRows = sortRows(dailyData?.rows ?? []);
  const cumulativeRows = sortRows(cumulativeData?.rows ?? []);
  const dailySummary = dailyData?.summary ?? { submitted: 0, leave: 0, missing: 0, total: 0 };
  const cumulativeSummary = cumulativeData?.summary ?? {
    workingDays: 0,
    staffCount: 0,
    totalSubmitted: 0,
    totalLeave: 0,
    totalMissing: 0,
    avgCompliancePct: 0,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Team Day End Reports</h1>
          <p className="text-sm text-slate-muted">
            Track daily submissions and cumulative compliance for your team. File your own report on{" "}
            <Link href="/day-end" className="text-accent hover:underline">
              Day End Report
            </Link>
            .
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 p-1">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              mode === "daily" ? "bg-accent text-white" : "text-slate-muted hover:text-text"
            }`}
            onClick={() => setMode("daily")}
          >
            Daily
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              mode === "cumulative" ? "bg-accent text-white" : "text-slate-muted hover:text-text"
            }`}
            onClick={() => setMode("cumulative")}
          >
            Cumulative
          </button>
        </div>
      </div>

      {mode === "daily" ? (
        <Card className="p-4">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <p className="text-sm text-slate-muted">
              Status for <strong>{formatDate(appliedDate)}</strong>
              {loading ? " · Loading…" : null}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const prev = addDaysToYmd(appliedDate, -1);
                  setSelectedDate(prev);
                  setAppliedDate(prev);
                }}
              >
                ← Prev
              </Button>
              <div className="min-w-[10rem]">
                <label className="mb-1 block text-xs text-slate-muted">Date</label>
                <Input
                  type="date"
                  value={selectedDate}
                  max={todayIstYmd()}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!selectedDate || selectedDate > todayIstYmd()}
                onClick={() => setAppliedDate(selectedDate)}
              >
                Apply
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={appliedDate >= todayIstYmd()}
                onClick={() => {
                  const next = addDaysToYmd(appliedDate, 1);
                  if (next > todayIstYmd()) return;
                  setSelectedDate(next);
                  setAppliedDate(next);
                }}
              >
                Next →
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={appliedDate === todayIstYmd()}
                onClick={() => {
                  const today = todayIstYmd();
                  setSelectedDate(today);
                  setAppliedDate(today);
                }}
              >
                Today
              </Button>
            </div>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-light-bg px-3 py-2">
              <p className="text-xs text-slate-muted">Submitted</p>
              <p className="text-xl font-bold text-text">{dailySummary.submitted}</p>
            </div>
            <div className="rounded-lg bg-light-bg px-3 py-2">
              <p className="text-xs text-slate-muted">Leave</p>
              <p className="text-xl font-bold text-text">{dailySummary.leave}</p>
            </div>
            <div className="rounded-lg bg-light-bg px-3 py-2">
              <p className="text-xs text-slate-muted">Missing</p>
              <p className="text-xl font-bold text-danger">{dailySummary.missing}</p>
            </div>
            <div className="rounded-lg bg-light-bg px-3 py-2">
              <p className="text-xs text-slate-muted">Team members</p>
              <p className="text-xl font-bold text-text">{dailySummary.total}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-muted">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Submitted at</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {dailyRows.map((row) => (
                  <tr key={row.staffId} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium text-text">
                      {row.staffName}
                      {row.staffId === currentUserId && (
                        <span className="ml-1 text-xs font-normal text-slate-muted">(You)</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{statusBadge(row.status)}</td>
                    <td className="py-2 pr-4 text-slate-muted">
                      {row.submittedAt ? formatDate(row.submittedAt) : "—"}
                    </td>
                    <td className="py-2 text-right">
                      {row.checkoutId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void openDetail(row.checkoutId!)}
                        >
                          View report
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-muted">Not filed</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && dailyRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-muted">
                      No team members found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <p className="text-sm text-slate-muted">
              Cumulative · {overviewDateRangeLabel(appliedRange)}
              {loading ? " · Loading…" : null}
            </p>
            <OverviewDateRangeFilter
              values={range}
              onChange={setRange}
              onApply={() => setAppliedRange(range)}
              onReset={() => {
                const next = defaultOverviewDateRange();
                setRange(next);
                setAppliedRange(next);
              }}
            />
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-5">
            <div className="rounded-lg bg-light-bg px-3 py-2">
              <p className="text-xs text-slate-muted">Working days</p>
              <p className="text-xl font-bold text-text">{cumulativeSummary.workingDays}</p>
            </div>
            <div className="rounded-lg bg-light-bg px-3 py-2">
              <p className="text-xs text-slate-muted">Reports filed</p>
              <p className="text-xl font-bold text-text">{cumulativeSummary.totalSubmitted}</p>
            </div>
            <div className="rounded-lg bg-light-bg px-3 py-2">
              <p className="text-xs text-slate-muted">Leave days</p>
              <p className="text-xl font-bold text-text">{cumulativeSummary.totalLeave}</p>
            </div>
            <div className="rounded-lg bg-light-bg px-3 py-2">
              <p className="text-xs text-slate-muted">Missing days</p>
              <p className="text-xl font-bold text-danger">{cumulativeSummary.totalMissing}</p>
            </div>
            <div className="rounded-lg bg-light-bg px-3 py-2">
              <p className="text-xs text-slate-muted">Avg compliance</p>
              <p className="text-xl font-bold text-text">{cumulativeSummary.avgCompliancePct}%</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-muted">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Submitted</th>
                  <th className="py-2 pr-4">Leave</th>
                  <th className="py-2 pr-4">Missing</th>
                  <th className="py-2 pr-4">Compliance</th>
                  <th className="py-2">Missing dates</th>
                </tr>
              </thead>
              <tbody>
                {cumulativeRows.map((row) => (
                  <tr key={row.staffId} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-4 font-medium text-text">
                      {row.staffName}
                      {row.staffId === currentUserId && (
                        <span className="ml-1 text-xs font-normal text-slate-muted">(You)</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{row.submitted}</td>
                    <td className="py-2 pr-4">{row.leave}</td>
                    <td className="py-2 pr-4">
                      {row.missing > 0 ? (
                        <span className="font-medium text-danger">{row.missing}</span>
                      ) : (
                        row.missing
                      )}
                    </td>
                    <td className="py-2 pr-4">{complianceBadge(row.compliancePct)}</td>
                    <td className="py-2">
                      {row.missingDates.length === 0 ? (
                        <span className="text-slate-muted">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {row.missingDates.map((d) => (
                            <button
                              key={d}
                              type="button"
                              className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-danger hover:bg-red-100"
                              onClick={() => jumpToDaily(d)}
                              title="Open daily view for this date"
                            >
                              {formatDate(d)}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && cumulativeRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-slate-muted">
                      No team members found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {detail && (
        <Card className="p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-text">{detail.staffName ?? "Report"}</h2>
              <p className="text-sm text-slate-muted">
                {formatDate(detail.reportDate)} · {detail.submissionType}
                {detail.submittedAt ? ` · filed ${formatDate(detail.submittedAt)}` : ""}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDetail(null)}>
              Close
            </Button>
          </div>
          {detail.submissionType === "report" ? (
            <DayEndFormByTemplate
              templateKey={detail.templateKey}
              payload={detail.payload as Record<string, unknown>}
              onChange={() => {}}
              readOnly
            />
          ) : (
            <p className="text-sm text-slate-muted">Marked on leave for this day.</p>
          )}
        </Card>
      )}
    </div>
  );
}
