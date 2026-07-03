"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { buildActivationOverviewSections } from "@/lib/activation-overview-export";
import { downloadOverviewCsv } from "@/lib/download-overview-csv";
import type { AdminActivationOverview } from "@/lib/admin-activation-overview-query";
import { OverviewDateRangeFilter } from "@/components/admin/OverviewDateRangeFilter";
import {
  buildOverviewDateQuery,
  defaultOverviewDateRange,
  overviewDateRangeLabel,
  type OverviewDateRange,
} from "@/lib/admin-overview-date-range";
import { cn } from "@/lib/utils";

function Metric({
  label,
  value,
  sub,
  tone = "default",
  large = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "amber" | "red" | "green";
  large?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-slate-muted">{label}</p>
      <p
        className={cn(
          "font-bold tabular-nums",
          large ? "text-2xl" : "text-lg",
          tone === "amber" && "text-amber-700",
          tone === "red" && "text-red-600",
          tone === "green" && "text-emerald-700",
          tone === "default" && "text-brand",
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-xs text-slate-muted">{sub}</p> : null}
    </div>
  );
}

export default function AdminActivationOverviewPage() {
  const [data, setData] = useState<AdminActivationOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<OverviewDateRange>(defaultOverviewDateRange);

  const load = useCallback(async (range: OverviewDateRange) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/activation/overview?${buildOverviewDateQuery(range)}`);
      const json = await res.json();
      setData(json.data ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(defaultOverviewDateRange());
  }, [load]);

  const periodLabel = overviewDateRangeLabel(data?.dateRange ?? dateRange);

  const summary = data?.summary ?? {
    pendingActivation: 0,
    sentBack: 0,
    activatedMtd: 0,
    revenueMtd: 0,
    avgDaysPending: 0,
    pendingOver7Days: 0,
    pendingOver14Days: 0,
    overdueTasks: 0,
    atInvoiceStep: 0,
    atContractStep: 0,
  };

  const staffTotals = useMemo(() => {
    const rows = data?.staff ?? [];
    return {
      activated: rows.reduce((n, s) => n + s.activatedMtd, 0),
      openTasks: rows.reduce((n, s) => n + s.openTasks, 0),
      overdue: rows.reduce((n, s) => n + s.overdueTasks, 0),
      calls: rows.reduce((n, s) => n + s.callsMtd, 0),
    };
  }, [data]);

  function downloadExcel() {
    if (!data) return;
    downloadOverviewCsv("activation-overview", buildActivationOverviewSections(data));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Activation Overview</h1>
          <p className="text-sm text-slate-muted">
            MUA activation pipeline, aging, and activation team performance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={downloadExcel} disabled={!data || loading}>
            Download Excel
          </Button>
          <Link href="/admin/sales/activation">
            <Button variant="secondary">Activation workbench</Button>
          </Link>
        </div>
      </div>

      <Card>
        <OverviewDateRangeFilter
          values={dateRange}
          onChange={setDateRange}
          onApply={() => void load(dateRange)}
          onReset={() => {
            const next = defaultOverviewDateRange();
            setDateRange(next);
            void load(next);
          }}
        />
        <p className="mt-2 text-xs text-slate-muted">
          Activated count and revenue for{" "}
          <span className="font-medium text-brand">{periodLabel}</span>. Pipeline queue is current.
        </p>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="grid divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <div className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-muted">
                Pipeline · now
              </h2>
              <Link
                href="/admin/sales/activation"
                className="text-xs font-medium text-accent hover:underline"
              >
                Open workbench →
              </Link>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Metric
                label="Pending activation"
                value={summary.pendingActivation}
                tone="amber"
                large
              />
              <Metric label="Sent back" value={summary.sentBack} tone="red" large />
            </div>
            <div className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <span className="font-medium text-brand">Aging</span>
              <span className="mx-2 text-slate-300">·</span>
              avg {summary.avgDaysPending} days
              <span className="mx-2 text-slate-300">·</span>
              <span className={summary.pendingOver7Days > 0 ? "font-medium text-amber-700" : ""}>
                {summary.pendingOver7Days} waiting 7+ days
              </span>
              <span className="mx-2 text-slate-300">·</span>
              <span className={summary.pendingOver14Days > 0 ? "font-medium text-red-600" : ""}>
                {summary.pendingOver14Days} waiting 14+ days
              </span>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Metric
                label="At invoice step"
                value={summary.atInvoiceStep}
                sub="Profile done, invoice pending or sent"
              />
              <Metric
                label="At contract step"
                value={summary.atContractStep}
                sub="Invoice done, contract pending or sent"
              />
            </div>
          </div>

          <div className="p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-muted">
              Period · {periodLabel}
            </h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <Metric
                label="Activated"
                value={summary.activatedMtd}
                tone="green"
                large
              />
              <Metric
                label="Revenue"
                value={`₹${summary.revenueMtd.toLocaleString("en-IN")}`}
                large
              />
            </div>
            <div className="mt-5 rounded-lg border border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Metric
                  label="Overdue tasks"
                  value={summary.overdueTasks}
                  tone={summary.overdueTasks > 0 ? "red" : "default"}
                />
                <div className="text-right text-xs text-slate-muted">
                  Team total: {staffTotals.activated} activated · {staffTotals.calls} calls ·{" "}
                  {staffTotals.overdue} overdue
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-brand">Team performance</h2>
            <p className="text-xs text-slate-muted">{periodLabel}</p>
          </div>
        </div>

        <Card className="overflow-x-auto p-0">
          <Table>
            <THead>
              <TR>
                <TH>Member</TH>
                <TH>Activated</TH>
                <TH>Open tasks</TH>
                <TH>Overdue</TH>
                <TH>Calls</TH>
                <TH>Talk min</TH>
              </TR>
            </THead>
            <TBody>
              {loading && !data ? (
                <TR>
                  <TD colSpan={6} className="text-center text-slate-muted">
                    Loading…
                  </TD>
                </TR>
              ) : (data?.staff ?? []).length === 0 ? (
                <TR>
                  <TD colSpan={6} className="text-center text-slate-muted">
                    No active activation staff
                  </TD>
                </TR>
              ) : (
                (data?.staff ?? []).map((row) => (
                  <TR key={row.staffId}>
                    <TD className="font-medium">{row.name}</TD>
                    <TD>{row.activatedMtd}</TD>
                    <TD>{row.openTasks}</TD>
                    <TD className={row.overdueTasks > 0 ? "text-red-600 font-medium" : ""}>
                      {row.overdueTasks}
                    </TD>
                    <TD>{row.callsMtd}</TD>
                    <TD>{row.talkMinutesMtd}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </Card>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-brand">Pending activation queue</h2>
            <p className="text-xs text-slate-muted">
              {summary.pendingActivation} in queue · oldest first, top 50 shown
            </p>
          </div>
          <Link href="/admin/sales/activation" className="text-sm text-accent hover:underline">
            Open workbench →
          </Link>
        </div>

        <Card className="overflow-x-auto p-0">
          <Table>
            <THead>
              <TR>
                <TH>MUA</TH>
                <TH>City</TH>
                <TH>Assignee</TH>
                <TH>Days pending</TH>
                <TH>Steps</TH>
              </TR>
            </THead>
            <TBody>
              {loading && !data ? (
                <TR>
                  <TD colSpan={5} className="text-center text-slate-muted">
                    Loading…
                  </TD>
                </TR>
              ) : (data?.pending ?? []).length === 0 ? (
                <TR>
                  <TD colSpan={5} className="text-center text-slate-muted">
                    No pending activations
                  </TD>
                </TR>
              ) : (
                (data?.pending ?? []).map((row) => (
                  <TR key={row.id}>
                    <TD className="font-medium">{row.muaName}</TD>
                    <TD>{row.muaCity}</TD>
                    <TD>{row.assignedSalesName ?? "—"}</TD>
                    <TD className={row.daysPending >= 14 ? "text-red-600 font-medium" : row.daysPending >= 7 ? "text-amber-600" : ""}>
                      {row.daysPending}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {row.profileLinkVerified && (
                          <Badge variant="success">Profile</Badge>
                        )}
                        {row.invoiceGenerated && <Badge variant="default">Invoice</Badge>}
                        {row.contractGenerated && <Badge variant="default">Contract</Badge>}
                        {row.hasContract && <Badge variant="success">File</Badge>}
                        {!row.profileLinkVerified &&
                          !row.invoiceGenerated &&
                          !row.contractGenerated && (
                            <span className="text-xs text-slate-muted">Early stage</span>
                          )}
                      </div>
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
