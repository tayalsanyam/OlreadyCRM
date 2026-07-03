"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import {
  AdminSalesFilters,
  EMPTY_ADMIN_SALES_FILTERS,
  buildAdminSalesQuery,
  type AdminSalesFilterValues,
} from "@/components/admin/sales/AdminSalesFilters";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { CustomReportBuilder } from "@/components/admin/reports/CustomReportBuilder";
import { ChurnedReengagePanel } from "@/components/admin/sales/ChurnedReengagePanel";
import {
  AdminSalesTargetTracking,
  type AdminTargetTrackingPayload,
} from "@/components/admin/sales/AdminSalesTargetTracking";
import { PipelineQuickContact } from "@/components/sales/PipelineQuickContact";
import { isClosedDealStage } from "@/lib/sales-pipeline-stages";
import type { PipelineStage } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Cell, LineChart, Line } from "recharts";

const REPORTS = [
  { key: "overview", label: "Overview", path: "/api/admin/sales/reports/overview" },
  { key: "source", label: "Source Analysis", path: "/api/admin/sales/reports/source-analysis" },
  { key: "funnel", label: "Conversion Funnel", path: "/api/admin/sales/reports/conversion-funnel" },
  { key: "revenue", label: "Revenue", path: "/api/admin/sales/reports/revenue" },
  { key: "calls", label: "Call Activity", path: "/api/admin/sales/reports/call-activity" },
  { key: "targets", label: "Target Tracking", path: "/api/admin/sales/reports/target-tracking" },
  { key: "activationQueue", label: "Activation Queue", path: "/api/admin/sales/reports/activation-queue" },
  { key: "churned", label: "Re-engage", path: "/api/admin/sales/reports/churned-muas" },
  { key: "custom", label: "Custom Report", path: "/api/admin/sales/reports/custom" },
] as const;

type ReportKey = (typeof REPORTS)[number]["key"];

const FULL_FILTER_TABS = new Set<ReportKey>([
  "overview",
  "source",
  "funnel",
  "revenue",
  "calls",
  "targets",
]);

const LIMITED_FILTER_TABS = new Set<ReportKey>(["activationQueue", "churned"]);
const MONTH_TABS = new Set<ReportKey>(["revenue", "targets"]);

export default function AdminSalesReportsPage() {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const assignedFromUrl = searchParams.get("assigned_to") ?? "";

  const [tab, setTab] = useState<ReportKey>(() => {
    if (tabFromUrl && REPORTS.some((r) => r.key === tabFromUrl)) {
      return tabFromUrl as ReportKey;
    }
    return "overview";
  });
  const [rows, setRows] = useState<any[]>([]);
  const [targetPayload, setTargetPayload] = useState<AdminTargetTrackingPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<AdminSalesFilterValues>(() => ({
    ...EMPTY_ADMIN_SALES_FILTERS,
    assignedTo: assignedFromUrl,
  }));
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    if (tabFromUrl && REPORTS.some((r) => r.key === tabFromUrl)) {
      setTab(tabFromUrl as ReportKey);
    }
    if (assignedFromUrl) {
      setFilters((prev) =>
        prev.assignedTo === assignedFromUrl ? prev : { ...prev, assignedTo: assignedFromUrl },
      );
    }
  }, [tabFromUrl, assignedFromUrl]);

  const load = useCallback(async (nextTab = tab) => {
    if (nextTab === "custom") {
      setRows([]);
      setTargetPayload(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setRows([]);
    setTargetPayload(null);
    setLoadError(null);
    const path = REPORTS.find((r) => r.key === nextTab)?.path ?? "/api/admin/sales/reports/overview";
    const extra: Record<string, string> = {};
    if (MONTH_TABS.has(nextTab)) extra.month = month;
    const qs = buildAdminSalesQuery(filters, extra);
    try {
      const res = await fetch(`${path}?${qs}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        setLoadError(json.error ?? `Failed to load report (${res.status})`);
        setRows([]);
        setTargetPayload(null);
        return;
      }
      if (nextTab === "targets") {
        setTargetPayload(json.data as AdminTargetTrackingPayload);
        setRows([]);
      } else {
        setRows(Array.isArray(json.data) ? json.data : json.data?.rows ?? []);
        setTargetPayload(null);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, filters, month]);

  useEffect(() => { void load(); }, [load]);

  const columns = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);
  const kpis = useMemo(() => {
    if (tab !== "overview") return null;
    const total = rows.length;
    const closed = rows.filter((r) => isClosedDealStage(r.stage)).length;
    const confirm = rows.filter((r) => r.stage === "Confirm").length;
    const unassigned = rows.filter((r) => !r.assignedToName).length;
    return { total, closed, confirm, unassigned };
  }, [rows, tab]);
  const revenueRows = useMemo(() => {
    if (tab !== "revenue") return { monthly: [], byMode: [], bySales: [], byDeal: [] };
    return {
      monthly: rows.filter((r) => r.section === "monthly"),
      byMode: rows.filter((r) => r.section === "byMode"),
      bySales: rows.filter((r) => r.section === "bySalesperson"),
      byDeal: rows.filter((r) => r.section === "byDeal"),
    };
  }, [rows, tab]);
  const callRows = useMemo(() => {
    if (tab !== "calls") return { bySalesperson: [], byDay: [] };
    return {
      bySalesperson: rows.filter((r) => r.section === "bySalesperson"),
      byDay: rows.filter((r) => r.section === "byDay"),
    };
  }, [rows, tab]);
  const churnedRows = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter((r) => {
      if (typeof r.muaId !== "string" || !r.muaId) return false;
      if (!("hasActivePipeline" in r)) return false;
      if (seen.has(r.muaId)) return false;
      seen.add(r.muaId);
      return true;
    });
  }, [rows]);
  const formatDuration = (sec: number) => {
    const s = Number(sec || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
  };
  const pctClass = (pct: number) => (pct >= 80 ? "text-emerald-700" : pct >= 50 ? "text-amber-700" : "text-red-700");

  function overviewLastContactLabel(row: {
    lastContactAt?: string | null;
    lastContactChannel?: string | null;
    lastContactSource?: string | null;
  }) {
    if (!row.lastContactAt) return "—";
    const when = formatDate(row.lastContactAt);
    if (row.lastContactChannel === "whatsapp") return `${when} · WhatsApp`;
    if (row.lastContactSource === "callyzer") return `${when} · Callyzer call`;
    return `${when} · Call`;
  }

  function downloadCsv() {
    const extra: Record<string, string> = {};
    if (MONTH_TABS.has(tab)) extra.month = month;
    const qs = buildAdminSalesQuery(filters, extra);
    const url = qs
      ? `/api/admin/sales/reports/export?report=${tab}&${qs}`
      : `/api/admin/sales/reports/export?report=${tab}`;
    window.open(url, "_blank");
  }

  const showFullFilters = FULL_FILTER_TABS.has(tab);
  const showLimitedFilters = LIMITED_FILTER_TABS.has(tab);
  const showMonth = MONTH_TABS.has(tab);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand">Sales Reports</h1>
        {tab !== "custom" && (
          <Button variant="secondary" onClick={downloadCsv}>
            Download CSV
          </Button>
        )}
      </div>

      {tab !== "custom" && (showFullFilters || showLimitedFilters) && (
        <Card>
          {showMonth && (
            <div className="mb-2 grid gap-2 md:grid-cols-4">
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
          )}
          <AdminSalesFilters
            values={filters}
            onChange={setFilters}
            onApply={() => void load(tab)}
            onReset={() => setFilters(EMPTY_ADMIN_SALES_FILTERS)}
            showDates={showFullFilters}
            showSearch
          />
          {showLimitedFilters && (
            <p className="mt-2 text-xs text-slate-muted">
              Filters apply to city, source, salesperson, team, and search — not event dates.
            </p>
          )}
        </Card>
      )}

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {REPORTS.map((r) => (
          <Button
            key={r.key}
            size="sm"
            variant={tab === r.key ? "primary" : "secondary"}
            onClick={() => {
              setTab(r.key);
              setRows([]);
              void load(r.key);
            }}
          >
            {r.label}
          </Button>
        ))}
      </div>

      {tab === "custom" ? (
        <CustomReportBuilder title="Sales Custom Report" apiBase="/api/admin/sales/reports/custom" />
      ) : tab === "overview" ? (
        <div className="space-y-3">
          <div className="grid gap-2 md:grid-cols-4">
            <Card><p className="text-xs text-slate-muted">Total pipeline</p><p className="text-2xl font-bold text-brand">{kpis?.total ?? 0}</p></Card>
            <Card><p className="text-xs text-slate-muted">Confirm stage</p><p className="text-2xl font-bold text-brand">{kpis?.confirm ?? 0}</p></Card>
            <Card><p className="text-xs text-slate-muted">Deals closed</p><p className="text-2xl font-bold text-emerald-700">{kpis?.closed ?? 0}</p></Card>
            <Card><p className="text-xs text-slate-muted">Unassigned</p><p className="text-2xl font-bold text-amber-700">{kpis?.unassigned ?? 0}</p></Card>
          </div>
          <Table className="[&_table]:table-fixed">
            <THead>
              <TR>
                <TH className="w-[18%]">MUA</TH>
                <TH className="w-[9%] whitespace-nowrap">Type</TH>
                <TH className="w-[10%] whitespace-nowrap">Stage</TH>
                <TH className="w-[8%] whitespace-nowrap">City</TH>
                <TH className="w-[8%] whitespace-nowrap">Source</TH>
                <TH className="w-[10%]">Assigned</TH>
                <TH className="w-[9%]">Team</TH>
                <TH className="w-[12%] whitespace-nowrap">Last contact</TH>
                <TH className="w-[8%] whitespace-nowrap">Contact</TH>
                <TH className="w-[8%] whitespace-nowrap">Views</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <p className="truncate font-medium text-brand" title={r.muaName}>
                      {r.muaName}
                    </p>
                    {r.displayId ? (
                      <p className="truncate font-mono text-[10px] text-slate-muted">{r.displayId}</p>
                    ) : null}
                  </TD>
                  <TD className="whitespace-nowrap text-xs">
                    {r.muaType === "candidate" ? "Potential" : "Existing No Plan"}
                  </TD>
                  <TD className="whitespace-nowrap text-xs">{r.stage}</TD>
                  <TD className="whitespace-nowrap text-xs">{r.muaCity}</TD>
                  <TD className="whitespace-nowrap text-xs">{r.muaSource ?? "—"}</TD>
                  <TD className="truncate text-xs">{r.assignedToName ?? "—"}</TD>
                  <TD className="truncate text-xs">{r.teamName ?? "—"}</TD>
                  <TD className="whitespace-nowrap text-xs text-slate-muted">
                    {overviewLastContactLabel(r)}
                  </TD>
                  <TD>
                    <PipelineQuickContact
                      pipelineId={r.id}
                      muaName={r.muaName}
                      muaPhone={r.muaPhone}
                      muaWhatsapp={r.muaWhatsapp}
                      muaCity={r.muaCity}
                      stage={r.stage as PipelineStage}
                      variant="compact"
                      onLogged={() => void load("overview")}
                    />
                  </TD>
                  <TD className="whitespace-nowrap text-xs">
                    <Link href={`/admin/muas/${r.muaId}`} className="font-medium text-accent hover:underline">
                      Profile
                    </Link>
                    <span className="text-slate-300"> · </span>
                    <Link
                      href={`/admin/reports?tab=muaLedger&search=${encodeURIComponent(r.displayId || r.muaName)}`}
                      className="font-medium text-accent hover:underline"
                    >
                      Ledger
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      ) : tab === "revenue" ? (
        <div className="space-y-3">
          <Card>
            <p className="text-sm font-semibold text-brand">Monthly Summary ({month})</p>
            <p className="mt-1 text-sm">Revenue: <span className="font-semibold">₹{Number(revenueRows.monthly[0]?.totalRevenue ?? 0).toLocaleString("en-IN")}</span> · Payments: {revenueRows.monthly[0]?.paymentsCount ?? 0}</p>
          </Card>
          <Card>
            <p className="mb-2 text-sm font-semibold text-brand">By Payment Mode</p>
            <Table>
              <THead><TR><TH>Mode</TH><TH>Deals</TH><TH>Revenue</TH></TR></THead>
              <TBody>{revenueRows.byMode.map((r, i) => <TR key={i}><TD>{r.paymentMode}</TD><TD>{r.total}</TD><TD>₹{Number(r.revenue ?? 0).toLocaleString("en-IN")}</TD></TR>)}</TBody>
            </Table>
          </Card>
          <Card>
            <p className="mb-2 text-sm font-semibold text-brand">By Salesperson</p>
            <Table>
              <THead><TR><TH>Salesperson</TH><TH>Deals</TH><TH>Revenue</TH></TR></THead>
              <TBody>{revenueRows.bySales.map((r, i) => <TR key={i}><TD>{r.salesperson}</TD><TD>{r.deals}</TD><TD>₹{Number(r.revenue ?? 0).toLocaleString("en-IN")}</TD></TR>)}</TBody>
            </Table>
          </Card>
          <Card>
            <p className="mb-2 text-sm font-semibold text-brand">Deal Detail</p>
            <Table>
              <THead><TR><TH>MUA</TH><TH>Sales RM</TH><TH>Amount</TH><TH>Plan</TH><TH>Date</TH></TR></THead>
              <TBody>
                {revenueRows.byDeal.map((r, i) => (
                  <TR key={i}>
                    <TD>{r.muaName}</TD>
                    <TD>{r.salesRm}</TD>
                    <TD>₹{Number(r.amount ?? 0).toLocaleString("en-IN")}</TD>
                    <TD>{r.plan ?? "—"}</TD>
                    <TD>{r.date ? new Date(r.date).toLocaleDateString("en-IN") : "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      ) : tab === "source" ? (
        <div className="space-y-3">
          <Card>
            <p className="mb-2 text-sm font-semibold text-brand">Source Volume</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="source" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="total" fill="#0D7377" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Table>
            <THead><TR><TH>Source</TH><TH>Total</TH><TH>Confirm/Closed</TH><TH>Deal Closed</TH><TH>Avg Deal Value</TH></TR></THead>
            <TBody>{rows.map((r, i) => <TR key={i}><TD>{r.source}</TD><TD>{r.total}</TD><TD>{r.confirm_or_closed}</TD><TD>{r.deal_closed}</TD><TD>₹{Number(r.avgDealValue ?? 0).toLocaleString("en-IN")}</TD></TR>)}</TBody>
          </Table>
        </div>
      ) : tab === "funnel" ? (
        <div className="space-y-3">
          <Card>
            <p className="mb-2 text-sm font-semibold text-brand">Funnel Drop-off</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="stage" angle={-25} textAnchor="end" interval={0} height={90} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                    {rows.map((r, i) => <Cell key={i} fill={Number(r.conversionPct ?? 0) >= 60 ? "#16a34a" : Number(r.conversionPct ?? 0) >= 40 ? "#d97706" : "#dc2626"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Table>
            <THead><TR><TH>Stage</TH><TH>Total</TH><TH>Conversion %</TH></TR></THead>
            <TBody>{rows.map((r, i) => <TR key={i}><TD>{r.stage}</TD><TD>{r.total}</TD><TD className={pctClass(Number(r.conversionPct ?? 0))}>{Number(r.conversionPct ?? 0)}%</TD></TR>)}</TBody>
          </Table>
        </div>
      ) : tab === "calls" ? (
        <div className="space-y-3">
          <Card>
            <p className="mb-2 text-sm font-semibold text-brand">Call Trend</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={callRows.byDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickFormatter={(v) => new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} />
                  <YAxis />
                  <Tooltip labelFormatter={(v) => new Date(v).toLocaleDateString("en-IN")} />
                  <Line type="monotone" dataKey="calls" stroke="#0D7377" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Table>
            <THead><TR><TH>Salesperson</TH><TH>Calls</TH><TH>Duration</TH><TH>Positive Calls</TH></TR></THead>
            <TBody>{callRows.bySalesperson.map((r, i) => <TR key={i}><TD>{r.salesperson}</TD><TD>{r.calls}</TD><TD>{formatDuration(Number(r.durationSec ?? 0))}</TD><TD>{r.positiveCalls ?? 0}</TD></TR>)}</TBody>
          </Table>
        </div>
      ) : tab === "targets" ? (
        <AdminSalesTargetTracking data={targetPayload} loading={loading} loadError={loadError} />
      ) : tab === "activationQueue" ? (
        <Table>
          <THead><TR><TH>MUA</TH><TH>Assigned Sales</TH><TH>Pending Days</TH><TH>Status</TH></TR></THead>
          <TBody>{rows.map((r, i) => {
            const d = Number(r.daysPendingActivation ?? 0);
            const status = d >= 7 ? "High" : d >= 3 ? "Medium" : "Low";
            const cls = d >= 7 ? "text-red-700" : d >= 3 ? "text-amber-700" : "text-emerald-700";
            return <TR key={i}><TD>{r.muaName}</TD><TD>{r.assignedSales ?? "—"}</TD><TD>{d}</TD><TD className={cls}>{status}</TD></TR>;
          })}</TBody>
        </Table>
      ) : tab === "churned" ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-muted">
            Full win-back workflow lives on{" "}
            <Link href="/admin/muas?winBack=1" className="font-medium text-accent underline">
              Manage MUAs (Re-engage cohort)
            </Link>{" "}
            and the Needs win-back tab under Unassigned MUAs. Use the Re-engage cohort filter on Manage MUAs to see
            expired-plan former customers.
          </p>
          {loading ? <p className="text-sm text-slate-muted">Loading re-engage cohort…</p> : null}
          {!loading ? (
            <ChurnedReengagePanel rows={churnedRows} onDone={() => void load("churned")} />
          ) : null}
        <Table>
          <THead>
            <TR>
              <TH>MUA</TH>
              <TH>Contact</TH>
              <TH>City</TH>
              <TH>Last plan</TH>
              <TH>Plan expiry</TH>
              <TH>Days since expiry</TH>
              <TH>Deal closed RM</TH>
              <TH>Regional RM</TH>
              <TH>Current sales RM</TH>
              <TH>Revenue</TH>
              <TH>Win-back</TH>
            </TR>
          </THead>
          <TBody>{churnedRows.map((r) => {
            const d = Number(r.daysSincePlanExpiry ?? 0);
            const cls = d >= 30 ? "text-red-700" : d >= 15 ? "text-amber-700" : "text-slate-700";
            return (
              <TR key={r.muaId}>
                <TD>
                  <Link href={`/admin/muas/${r.muaId}`} className="font-medium text-accent hover:underline">
                    {r.muaName}
                  </Link>
                  {r.displayId ? <p className="text-[10px] text-slate-muted">{r.displayId}</p> : null}
                </TD>
                <TD className="text-sm">{r.phone ?? "—"}</TD>
                <TD>{r.muaCity ?? "—"}</TD>
                <TD>{r.lastPlan ?? "—"}</TD>
                <TD>{r.planExpiry ? new Date(r.planExpiry).toLocaleDateString("en-IN") : "—"}</TD>
                <TD className={cls}>{d}d</TD>
                <TD>{r.salesClosedByName ?? "—"}</TD>
                <TD>{r.assignedRmName ?? "—"}</TD>
                <TD>{r.currentSalesRmName ?? "—"}</TD>
                <TD>₹{Number(r.totalBookingRevenue ?? 0).toLocaleString("en-IN")}</TD>
                <TD>{r.hasActivePipeline ? "In pipeline" : "Needs win-back"}</TD>
              </TR>
            );
          })}</TBody>
        </Table>
        </div>
      ) : (
        <Table>
          <THead><TR>{(columns.length ? columns : ["No data"]).map((k) => <TH key={k}>{k}</TH>)}</TR></THead>
          <TBody>
            {rows.length === 0 ? <TR><TD colSpan={Math.max(1, columns.length)}>No data</TD></TR> : rows.map((r, i) => <TR key={i}>{columns.map((k) => <TD key={k}>{String(r[k] ?? "")}</TD>)}</TR>)}
          </TBody>
        </Table>
      )}
    </div>
  );
}
