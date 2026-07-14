"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import {
  ReportResultLine,
  ReportSummaryChip,
  ReportSummaryChips,
} from "@/components/admin/reports-hub/shared/ReportSummaryChips";
import { CustomerSummaryPanel } from "@/components/admin/CustomerSummaryPanel";
import { adminCsvHref } from "@/lib/admin-csv-export";
import type { PerformancePayload } from "@/lib/admin-reports-hub-types";
import { currentMonthKey } from "@/lib/targets";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  regional_rm: "Regional RM",
  commission_rm: "Commission RM",
};

function conversionClass(pct: number | null) {
  if (pct === null) return "text-slate-muted";
  if (pct >= 30) return "font-semibold text-emerald-600";
  if (pct >= 15) return "font-semibold text-amber-600";
  return "font-semibold text-red-600";
}

function targetProgress(actual: number, target: number | null | undefined): string {
  if (target == null || target <= 0) return "—";
  const pct = Math.round((actual / target) * 100);
  return `${actual}/${target} (${pct}%)`;
}

export function PerformanceReport({
  apiBase = "/api/admin/reports/performance",
  showCustomerSummary = true,
  scoped = false,
}: {
  apiBase?: string;
  showCustomerSummary?: boolean;
  scoped?: boolean;
} = {}) {
  const [month, setMonth] = useState(currentMonthKey());
  const [appliedMonth, setAppliedMonth] = useState(currentMonthKey());
  const [data, setData] = useState<PerformancePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const query = useMemo(() => {
    const p = new URLSearchParams({ month: appliedMonth });
    return p.toString();
  }, [appliedMonth]);

  const load = useCallback(() => {
    setLoading(true);
    void fetch(`${apiBase}?${query}`)
      .then((r) => r.json())
      .then((json: { data: PerformancePayload | null }) => {
        setData(json.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [apiBase, query]);

  useEffect(() => {
    load();
  }, [load]);

  const csvHref = adminCsvHref(apiBase, query);
  const me = scoped ? data?.rows[0] : null;
  const showCommissionCols =
    (scoped && me?.role === "commission_rm") ||
    (!scoped && (data?.rows ?? []).some((r) => r.role === "commission_rm"));
  const colCount = (scoped ? 11 : 13) + (showCommissionCols ? 2 : 0);

  return (
    <div className="space-y-4">
      {data?.summary ? (
        <ReportSummaryChips
          title={
            scoped
              ? `My performance · ${appliedMonth}`
              : `Performance · ${appliedMonth} targets vs pipeline health`
          }
        >
          <ReportSummaryChip label="Staff" value={data.summary.staffCount} />
          <ReportSummaryChip
            label="Stale leads"
            value={data.summary.totalStale}
            tone={data.summary.totalStale > 0 ? "danger" : "default"}
          />
          <ReportSummaryChip
            label="Overdue intake"
            value={data.summary.totalOverdueIntake}
            tone={data.summary.totalOverdueIntake > 0 ? "warn" : "default"}
          />
          <ReportSummaryChip label="Targets set" value={data.summary.targetsSet} />
          <ReportSummaryChip label="Bookings on track" value={data.summary.bookingsOnTrack} />
          <ReportSummaryChip
            label="Bookings behind"
            value={data.summary.bookingsBehind}
            tone={data.summary.bookingsBehind > 0 ? "warn" : "default"}
          />
        </ReportSummaryChips>
      ) : null}

      {scoped && me?.targets?.targetCommission != null ? (
        <ReportSummaryChips title="Commission target">
          <ReportSummaryChip
            label="Month commission"
            value={targetProgress(
              me.targets.actualCommissionCollected,
              me.targets.targetCommission
            )}
            tone={
              me.targets.actualCommissionCollected >= (me.targets.targetCommission ?? 0)
                ? "default"
                : "warn"
            }
          />
        </ReportSummaryChips>
      ) : null}

      {!scoped && data?.summary.bestConversion ? (
        <p className="text-sm text-slate-muted">
          Best pipeline conversion:{" "}
          <strong>{data.summary.bestConversion.name}</strong> at{" "}
          <strong>{data.summary.bestConversion.pct}%</strong>
        </p>
      ) : null}

      {data?.inactiveCriticalHot && data.inactiveCriticalHot.length > 0 ? (
        <Card className="border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-2 font-semibold text-amber-900">
            Inactive critical / hot leads ({data.inactiveCriticalHot.length})
          </h2>
          <p className="mb-3 text-xs text-amber-800">
            Assigned leads with no comms in the last {data.staleThresholdHours} hours.
          </p>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {data.inactiveCriticalHot.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/rm/leads/${l.id}`} className="font-medium text-accent hover:underline">
                  {l.brideName}
                </Link>
                <Badge variant={l.urgencyBand as "critical" | "hot"}>{l.urgencyBand}</Badge>
                <span className="text-xs text-amber-900">{Math.round(l.hoursSince)}h quiet</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="flex flex-wrap items-end gap-4 p-4">
        <Input
          label="Target month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
        <Button
          type="button"
          onClick={() => setAppliedMonth(month)}
          disabled={month === appliedMonth}
        >
          Apply
        </Button>
        <a href={csvHref} className="ml-auto">
          <Button type="button" variant="secondary" disabled={loading || !data?.rows.length}>
            Download CSV
          </Button>
        </a>
      </Card>

      <ReportResultLine>
        {scoped
          ? `Your pipeline KPIs and monthly targets for ${appliedMonth}.`
          : `Pipeline KPIs for all active RMs plus monthly targets for ${appliedMonth}. Commission targets apply to commission RMs only.`}
      </ReportResultLine>

      <Card className="overflow-x-auto p-0">
        <Table>
          <THead>
            <TR>
              {!scoped ? (
                <>
                  <TH>Staff</TH>
                  <TH>Role</TH>
                </>
              ) : null}
              <TH>Active</TH>
              <TH>Booked</TH>
              <TH>Conv %</TH>
              <TH>Stale</TH>
              <TH>Intake</TH>
              <TH>Target bookings</TH>
              <TH>Month bookings</TH>
              <TH>Target leads</TH>
              <TH>Month leads</TH>
              <TH>Target MUAs/lead</TH>
              <TH>Month MUAs/lead</TH>
              {showCommissionCols ? (
                <>
                  <TH>Target commission</TH>
                  <TH>Month commission</TH>
                </>
              ) : null}
            </TR>
          </THead>
          <TBody>
            {loading ? (
              <TR>
                <TD colSpan={colCount} className="py-8 text-center text-slate-muted">
                  Loading…
                </TD>
              </TR>
            ) : (data?.rows ?? []).length === 0 ? (
              <TR>
                <TD colSpan={colCount} className="py-8 text-center text-slate-muted">
                  No performance data
                </TD>
              </TR>
            ) : (
              (data?.rows ?? []).map((r) => (
                <TR key={r.staffId} className="align-top hover:bg-slate-50/80">
                  {!scoped ? <TD className="font-medium">{r.staffName}</TD> : null}
                  {!scoped ? <TD className="text-sm">{ROLE_LABELS[r.role] ?? r.role}</TD> : null}
                  <TD>{r.totalActive}</TD>
                  <TD>{r.totalBooked}</TD>
                  <TD className={conversionClass(r.conversionPct)}>
                    {r.conversionPct ?? "—"}%
                  </TD>
                  <TD>
                    {r.staleLeads > 0 ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                        {r.staleLeads}
                      </span>
                    ) : (
                      "0"
                    )}
                  </TD>
                  <TD className="text-xs">
                    <div>Confirm {r.pendingConfirmation}</div>
                    <div>Profiles {r.awaitingProfiles}</div>
                    <div className={cn(r.overdueIntakeTasks > 0 && "font-semibold text-red-700")}>
                      Overdue {r.overdueIntakeTasks}
                    </div>
                  </TD>
                  <TD className="text-sm">{r.targets?.targetBookings ?? "—"}</TD>
                  <TD className="text-sm">
                    {targetProgress(r.targets?.actualBookings ?? 0, r.targets?.targetBookings)}
                  </TD>
                  <TD className="text-sm">{r.targets?.targetLeadsWorked ?? "—"}</TD>
                  <TD className="text-sm">
                    {targetProgress(
                      r.targets?.actualLeadsWorked ?? 0,
                      r.targets?.targetLeadsWorked
                    )}
                  </TD>
                  <TD className="text-sm">{r.targets?.targetAvgMuasPerLead ?? "—"}</TD>
                  <TD className="text-sm">
                    {r.targets?.targetAvgMuasPerLead != null
                      ? `${r.targets.actualAvgMuasPerLead} / ${r.targets.targetAvgMuasPerLead}`
                      : "—"}
                  </TD>
                  {showCommissionCols ? (
                    <>
                      <TD className="text-sm">{r.targets?.targetCommission ?? "—"}</TD>
                      <TD className="text-sm">
                        {targetProgress(
                          r.targets?.actualCommissionCollected ?? 0,
                          r.targets?.targetCommission
                        )}
                      </TD>
                    </>
                  ) : null}
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>

      {showCustomerSummary ? (
        <div className="space-y-3 border-t border-slate-200 pt-6">
          <div>
            <h2 className="text-lg font-semibold text-brand">RM customer summary</h2>
            <p className="text-sm text-slate-muted">
              Per-RM lead contact status, intake progress, and MUA offering depth.
            </p>
          </div>
          <CustomerSummaryPanel />
        </div>
      ) : null}
    </div>
  );
}
