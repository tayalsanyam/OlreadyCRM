"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { OverviewDateRangeFilter } from "@/components/admin/OverviewDateRangeFilter";
import { DayEndConsolidatedPanel } from "@/components/admin/DayEndConsolidatedPanel";
import { CallActivityReport } from "@/components/reports/CallActivityReport";
import {
  buildOverviewDateQuery,
  defaultOverviewDateRange,
  overviewDateRangeLabel,
  type OverviewDateRange,
} from "@/lib/admin-overview-date-range";
import type { DayEndOverview } from "@/lib/day-end-queries";
import { DayEndFormByTemplate } from "@/components/day-end/DayEndForm";
import type { DayEndCheckoutRow } from "@/lib/day-end";
import { formatDate } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  salesRm: "Sales RM",
  salesTl: "Sales TL",
  salesActivation: "Activation",
  leadUploader: "Uploader",
  feedbackRm: "Feedback",
  regionalRm: "Regional RM",
  commissionRm: "Commission RM",
  careAgent: "Care",
};

type Tab = "compliance" | "consolidated" | "callActivity";

function statusBadge(status: string) {
  if (status === "submitted") return <Badge variant="success">Submitted</Badge>;
  if (status === "leave") return <Badge variant="muted">Leave</Badge>;
  return <Badge variant="critical">Missing</Badge>;
}

export default function AdminDayEndReportPage() {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>("compliance");
  const [data, setData] = useState<DayEndOverview | null>(null);
  const [detail, setDetail] = useState<DayEndCheckoutRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<OverviewDateRange>(defaultOverviewDateRange);
  const [appliedDateRange, setAppliedDateRange] = useState<OverviewDateRange>(defaultOverviewDateRange);

  const load = useCallback(async (range: OverviewDateRange) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/day-end/overview?${buildOverviewDateQuery(range)}`);
      const json = (await res.json()) as { data: DayEndOverview | null };
      setData(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = defaultOverviewDateRange();
    setAppliedDateRange(initial);
    void load(initial);
  }, [load]);

  useEffect(() => {
    if (tabFromUrl === "callActivity" || tabFromUrl === "consolidated" || tabFromUrl === "compliance") {
      setTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  async function openDetail(checkoutId: string) {
    const res = await fetch(`/api/admin/day-end/overview?checkoutId=${checkoutId}`);
    const json = (await res.json()) as { data: DayEndCheckoutRow | null };
    setDetail(json.data);
  }

  function applyDateRange() {
    setAppliedDateRange(dateRange);
    void load(dateRange);
  }

  const summary = data?.summary ?? { submitted: 0, leave: 0, missing: 0, total: 0 };
  const rangeLabel = overviewDateRangeLabel(appliedDateRange);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Day End Report</h1>
          <p className="text-sm text-slate-muted">
            {tab === "compliance"
              ? "Compliance tracking"
              : tab === "consolidated"
                ? "All submitted reports"
                : "Callyzer call activity by staff line"}
            {" · "}
            {rangeLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex rounded-lg border border-slate-200 p-1">
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === "compliance" ? "bg-accent text-white" : "text-slate-muted hover:text-text"
              }`}
              onClick={() => setTab("compliance")}
            >
              Compliance
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === "consolidated" ? "bg-accent text-white" : "text-slate-muted hover:text-text"
              }`}
              onClick={() => setTab("consolidated")}
            >
              Consolidated
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === "callActivity" ? "bg-accent text-white" : "text-slate-muted hover:text-text"
              }`}
              onClick={() => setTab("callActivity")}
            >
              Call activity
            </button>
          </div>
          <OverviewDateRangeFilter
            values={dateRange}
            onChange={setDateRange}
            onApply={applyDateRange}
            onReset={() => {
              const next = defaultOverviewDateRange();
              setDateRange(next);
              setAppliedDateRange(next);
              void load(next);
            }}
          />
        </div>
      </div>

      {tab === "compliance" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs text-slate-muted">Submitted</p>
              <p className="text-2xl font-bold text-text">{summary.submitted}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-muted">Leave</p>
              <p className="text-2xl font-bold text-text">{summary.leave}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-muted">Missing</p>
              <p className="text-2xl font-bold text-danger">{summary.missing}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-slate-muted">Staff</p>
              <p className="text-2xl font-bold text-text">{summary.total}</p>
            </Card>
          </div>

          <Card className="overflow-hidden p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Role</TH>
                  <TH>Date</TH>
                  <TH>Status</TH>
                  <TH>Submitted</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {(data?.rows ?? []).map((row) => (
                  <TR key={row.staffId}>
                    <TD>{row.staffName}</TD>
                    <TD>{ROLE_LABELS[row.role] ?? row.role}</TD>
                    <TD>{formatDate(row.reportDate)}</TD>
                    <TD>{statusBadge(row.status)}</TD>
                    <TD>{row.submittedAt ? formatDate(row.submittedAt) : "—"}</TD>
                    <TD>
                      {row.checkoutId && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void openDetail(row.checkoutId!)}
                        >
                          View
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {loading && <p className="p-4 text-sm text-slate-muted">Loading…</p>}
          </Card>

          {detail && (
            <Card className="p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-text">
                    {(detail as DayEndCheckoutRow & { staffName?: string }).staffName ?? "Report"}
                  </h2>
                  <p className="text-sm text-slate-muted">
                    {formatDate(detail.reportDate)} · {detail.submissionType}
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
                <p className="text-sm text-slate-muted">Marked on leave.</p>
              )}
            </Card>
          )}
        </>
      ) : tab === "callActivity" ? (
        <CallActivityReport apiBase="/api/admin/reports" adminMode />
      ) : (
        <DayEndConsolidatedPanel dateRange={appliedDateRange} active={tab === "consolidated"} />
      )}
    </div>
  );
}
