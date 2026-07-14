"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";

type FinancialIncomeType = "sales" | "commission";
type FinancialSegmentBy = "user" | "plan" | "region" | "lead";

type Summary = {
  salesCollected: number;
  salesPayments: number;
  commissionCollected: number;
  commissionDue: number;
  commissionOutstanding: number;
  bookingGmv: number;
};

type BreakdownRow = {
  key: string;
  label: string;
  amount: number;
  count: number;
  meta?: string | null;
};

type DetailRow = {
  id: string;
  date: string;
  incomeType: FinancialIncomeType;
  amount: number;
  label: string;
  sublabel?: string | null;
  staffName?: string | null;
  plan?: string | null;
  region?: string | null;
  leadDisplayId?: string | null;
  brideName?: string | null;
};

function fmt(n: number) {
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function defaultDateFrom() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export function FinancialReport() {
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [staffId, setStaffId] = useState("");
  const [staffOptions, setStaffOptions] = useState<
    { id: string; name: string; role: string }[]
  >([]);
  const [incomeType, setIncomeType] = useState<FinancialIncomeType>("sales");
  const [segmentBy, setSegmentBy] = useState<FinancialSegmentBy>("user");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([]);
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [loading, setLoading] = useState(true);

  const segmentOptions = useMemo(() => {
    const base = [
      { value: "user", label: "Per user (staff)" },
      { value: "plan", label: incomeType === "sales" ? "Plan-wise" : "MUA plan tier" },
      { value: "region", label: incomeType === "sales" ? "MUA city" : "Bride region" },
    ] as const;
    if (incomeType === "commission") {
      return [...base, { value: "lead", label: "Bride lead" } as const];
    }
    return base;
  }, [incomeType]);

  useEffect(() => {
    if (incomeType === "sales" && segmentBy === "lead") {
      setSegmentBy("user");
    }
  }, [incomeType, segmentBy]);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (staffId) params.set("staffId", staffId);
    params.set("incomeType", incomeType);
    params.set("segmentBy", segmentBy);
    void fetch(`/api/admin/reports/financial?${params}`)
      .then((r) => r.json())
      .then(
        (json: {
          data: {
            summary: Summary;
            breakdown: BreakdownRow[];
            details: DetailRow[];
            staffOptions?: { id: string; name: string; role: string }[];
          } | null;
        }) => {
          setSummary(json.data?.summary ?? null);
          setBreakdown(json.data?.breakdown ?? []);
          setDetails(json.data?.details ?? []);
          if (json.data?.staffOptions) setStaffOptions(json.data.staffOptions);
        }
      )
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, staffId, incomeType, segmentBy]);

  useEffect(() => {
    load();
  }, [load]);

  const breakdownTotal = breakdown.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-brand">Financial overview</h2>
            <p className="text-sm text-slate-muted">
              Sales plan income and MUA commission collected — filter by date and segment
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const params = new URLSearchParams();
              if (dateFrom) params.set("dateFrom", dateFrom);
              if (dateTo) params.set("dateTo", dateTo);
              if (staffId) params.set("staffId", staffId);
              params.set("incomeType", incomeType);
              params.set("segmentBy", segmentBy);
              params.set("format", "csv");
              window.location.href = `/api/admin/reports/financial?${params}`;
            }}
          >
            Export CSV
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            label="From"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <Input
            label="To"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          <label className="text-sm">
            Staff
            <select
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
            >
              <option value="">All staff</option>
              {staffOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Income type
            <select
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={incomeType}
              onChange={(e) => setIncomeType(e.target.value as FinancialIncomeType)}
            >
              <option value="sales">Sales (MUA plan payments)</option>
              <option value="commission">Commission (from bookings)</option>
            </select>
          </label>
          <label className="text-sm">
            Segment by
            <select
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={segmentBy}
              onChange={(e) => setSegmentBy(e.target.value as FinancialSegmentBy)}
            >
              {segmentOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs text-slate-muted">Sales collected</p>
            <p className="text-2xl font-bold text-brand">{fmt(summary.salesCollected)}</p>
            <p className="text-xs text-slate-muted">{summary.salesPayments} payments</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-muted">Commission collected</p>
            <p className="text-2xl font-bold text-emerald-700">
              {fmt(summary.commissionCollected)}
            </p>
            <p className="text-xs text-slate-muted">
              Due {fmt(summary.commissionDue)} · Outstanding{" "}
              {fmt(summary.commissionOutstanding)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-muted">Booking GMV (period)</p>
            <p className="text-2xl font-bold text-brand">{fmt(summary.bookingGmv)}</p>
            <p className="text-xs text-slate-muted">Active bookings in range</p>
          </Card>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold text-brand">
            {incomeType === "sales" ? "Sales" : "Commission"} breakdown
            {loading ? "" : ` — ${fmt(breakdownTotal)}`}
          </h3>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Segment</TH>
              <TH>Count</TH>
              <TH>Amount</TH>
              <TH>Share</TH>
            </TR>
          </THead>
          <TBody>
            {breakdown.length === 0 ? (
              <TR>
                <TD colSpan={4} className="py-8 text-center text-slate-muted">
                  No data in this period
                </TD>
              </TR>
            ) : (
              breakdown.map((row) => (
                <TR key={row.key}>
                  <TD>
                    <p className="font-medium">{row.label}</p>
                    {row.meta && (
                      <p className="text-xs capitalize text-slate-muted">{row.meta}</p>
                    )}
                  </TD>
                  <TD>{row.count}</TD>
                  <TD className="font-medium">{fmt(row.amount)}</TD>
                  <TD>
                    {breakdownTotal > 0
                      ? `${Math.round((row.amount / breakdownTotal) * 100)}%`
                      : "—"}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold text-brand">
            Line items {loading ? "…" : `(${details.length})`}
          </h3>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Party</TH>
              <TH>Staff</TH>
              <TH>Plan / Region</TH>
              <TH>Lead</TH>
              <TH>Amount</TH>
            </TR>
          </THead>
          <TBody>
            {details.length === 0 ? (
              <TR>
                <TD colSpan={6} className="py-8 text-center text-slate-muted">
                  No transactions in this period
                </TD>
              </TR>
            ) : (
              details.map((row) => (
                <TR key={row.id}>
                  <TD className="text-sm">{row.date}</TD>
                  <TD>
                    <p className="font-medium">{row.label}</p>
                    {row.sublabel && (
                      <p className="text-xs text-slate-muted">{row.sublabel}</p>
                    )}
                  </TD>
                  <TD className="text-sm">{row.staffName ?? "—"}</TD>
                  <TD className="text-sm">
                    {row.plan && <span className="block">{row.plan}</span>}
                    {row.region && (
                      <span className="text-xs capitalize text-slate-muted">
                        {row.region}
                      </span>
                    )}
                  </TD>
                  <TD className="text-sm">
                    {row.brideName ? (
                      <>
                        {row.brideName}
                        {row.leadDisplayId && (
                          <span className="block text-xs text-slate-muted">
                            {row.leadDisplayId}
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="font-medium">{fmt(row.amount)}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
