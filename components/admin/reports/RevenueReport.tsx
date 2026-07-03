"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DateRangeFilter } from "@/components/ui/DateRangeFilter";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { toSearchParams } from "@/lib/date-range";
import type { BudgetTier, DateRangeFilterValue } from "@/lib/types";
import { BUDGET_TIER_LABELS } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

type RevenuePaymentStatus = "Fully Paid" | "Partial" | "Unpaid" | "Feedback";

type RevenueRow = {
  id: string;
  bookingDate: string;
  bookedPrice: number;
  advancePaid: number | null;
  fullPaid: number | null;
  zohoInvoiceRef: string | null;
  outstanding: number;
  brideName: string;
  ceremonyType: string;
  eventDate: string;
  muaName: string;
  muaPlan: string | null;
  rmName: string | null;
  region: string;
  source: "formal" | "feedback";
  status: RevenuePaymentStatus;
};

type Summary = {
  totalBooked: number;
  totalAdvance: number;
  totalFullPaid: number;
  totalOutstanding: number;
  countBookings: number;
  countFormal?: number;
  countFeedback?: number;
  countFullyPaid: number;
  countPartial: number;
  countUnpaid: number;
};

type RmOption = { id: string; name: string; region: string | null };

const STATUS_BADGE: Record<RevenuePaymentStatus, string> = {
  "Fully Paid": "bg-emerald-100 text-emerald-800",
  Partial: "bg-amber-100 text-amber-800",
  Unpaid: "bg-red-100 text-red-800",
  Feedback: "bg-sky-100 text-sky-800",
};

const TIERS: BudgetTier[] = ["tier1", "tier2", "tier3", "tier4"];

export function RevenueReport({
  apiBase = "/api/admin/reports",
  scoped = false,
  hideRmFilter = false,
  showCancelledToggle = false,
  deEmphasizeOutstanding = false,
  title,
  defaultDateRange = { mode: "preset", preset: "thisQuarter" },
}: {
  apiBase?: string;
  scoped?: boolean;
  hideRmFilter?: boolean;
  showCancelledToggle?: boolean;
  deEmphasizeOutstanding?: boolean;
  title?: string;
  defaultDateRange?: DateRangeFilterValue;
} = {}) {
  const [dateRange, setDateRange] = useState<DateRangeFilterValue>(defaultDateRange);
  const [region, setRegion] = useState("");
  const [rmId, setRmId] = useState("");
  const [tier, setTier] = useState<BudgetTier | "">("");
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [rms, setRms] = useState<RmOption[]>([]);
  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    if (hideRmFilter) return;
    void fetch("/api/admin/rms")
      .then((r) => r.json())
      .then((json: { data: RmOption[] }) => setRms(json.data ?? []));
  }, [hideRmFilter]);

  const load = useCallback(() => {
    const { eventFrom, eventTo } = toSearchParams(dateRange);
    const params = new URLSearchParams();
    if (eventFrom) params.set("bookingFrom", eventFrom);
    if (eventTo) params.set("bookingTo", eventTo);
    if (region) params.set("region", region);
    if (rmId) params.set("rmId", rmId);
    if (tier) params.set("tier", tier);
    if (includeCancelled) params.set("includeCancelled", "true");
    void fetch(`${apiBase}/revenue?${params}`)
      .then((r) => r.json())
      .then((json: { data: { rows: RevenueRow[]; summary: Summary } }) => {
        setRows(json.data?.rows ?? []);
        setSummary(json.data?.summary ?? null);
      });
  }, [apiBase, dateRange, region, rmId, tier, includeCancelled]);

  useEffect(() => {
    load();
  }, [load]);

  function buildExportParams() {
    const { eventFrom, eventTo } = toSearchParams(dateRange);
    const params = new URLSearchParams({ format: "csv" });
    if (eventFrom) params.set("bookingFrom", eventFrom);
    if (eventTo) params.set("bookingTo", eventTo);
    if (region) params.set("region", region);
    if (rmId) params.set("rmId", rmId);
    if (tier) params.set("tier", tier);
    if (includeCancelled) params.set("includeCancelled", "true");
    return params;
  }

  return (
    <div className="space-y-4">
      {title ? <h2 className="font-semibold text-brand">{title}</h2> : null}
      <DateRangeFilter value={dateRange} onChange={setDateRange} />
      <div className="flex flex-wrap items-end gap-2">
        {["", "north", "east", "west", "south"].map((r) => (
          <button
            key={r || "all"}
            type="button"
            onClick={() => setRegion(r)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              region === r ? "bg-brand text-white" : "bg-slate-100"
            )}
          >
            {r ? r : "All regions"}
          </button>
        ))}
        {!hideRmFilter && (
          <label className="text-sm">
            <span className="text-slate-muted">RM</span>
            <select
              className="mt-1 block min-w-[140px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={rmId}
              onChange={(e) => setRmId(e.target.value)}
            >
              <option value="">All RMs</option>
              {rms.map((rm) => (
                <option key={rm.id} value={rm.id}>
                  {rm.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm">
          <span className="text-slate-muted">Tier</span>
          <select
            className="mt-1 block rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={tier}
            onChange={(e) => setTier(e.target.value as BudgetTier | "")}
          >
            <option value="">All tiers</option>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {BUDGET_TIER_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        {showCancelledToggle ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeCancelled}
              onChange={(e) => setIncludeCancelled(e.target.checked)}
            />
            Include cancelled bookings
          </label>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          className="ml-auto"
          onClick={() => {
            window.location.href = `${apiBase}/revenue?${buildExportParams()}`;
          }}
        >
          {scoped ? "Export CSV ↓" : "Export MUA Revenue CSV ↓"}
        </Button>
      </div>

      {summary && (
        <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <span>Total Booked: Rs. {summary.totalBooked.toLocaleString("en-IN")}</span>
          <span>Advance: Rs. {summary.totalAdvance.toLocaleString("en-IN")}</span>
          <span>Fully Paid: Rs. {summary.totalFullPaid.toLocaleString("en-IN")}</span>
          <span
            className={cn(
              !deEmphasizeOutstanding &&
                summary.totalOutstanding > 0 &&
                "font-semibold text-red-600"
            )}
          >
            Outstanding: Rs. {summary.totalOutstanding.toLocaleString("en-IN")}
          </span>
          <span>{summary.countBookings} bookings</span>
          {summary.countFormal != null || summary.countFeedback != null ? (
            <span>
              {summary.countFormal ?? 0} formal · {summary.countFeedback ?? 0} feedback
            </span>
          ) : null}
          <span>{summary.countFullyPaid} fully paid</span>
          <span>
            {summary.countPartial} partial · {summary.countUnpaid} unpaid
          </span>
        </div>
      )}

      <p className="text-xs text-slate-muted">
        Includes formal bookings (RM/commission revenue) and feedback-captured MUA bookings.
        {includeCancelled
          ? " Cancelled formal bookings are included."
          : " Cancelled formal bookings are excluded."}
      </p>

      <Table>
        <THead>
          <TR>
            <TH>Date</TH>
            <TH>Source</TH>
            <TH>Bride</TH>
            <TH>Ceremony</TH>
            <TH>Event Date</TH>
            <TH>MUA</TH>
            <TH>Plan</TH>
            <TH>RM</TH>
            <TH>Region</TH>
            <TH>Booked</TH>
            <TH>Advance</TH>
            <TH>Full Paid</TH>
            <TH>Outstanding</TH>
            <TH>Zoho</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={`${r.source}-${r.id}`}>
              <TD>{formatDate(r.bookingDate)}</TD>
              <TD className="capitalize text-sm">{r.source}</TD>
              <TD>{r.brideName}</TD>
              <TD>{r.ceremonyType}</TD>
              <TD>{formatDate(r.eventDate)}</TD>
              <TD>{r.muaName}</TD>
              <TD>{r.muaPlan ?? "—"}</TD>
              <TD>{r.rmName ?? "—"}</TD>
              <TD className="capitalize">{r.region}</TD>
              <TD>
                {r.source === "feedback" && r.bookedPrice === 0
                  ? "—"
                  : r.bookedPrice.toLocaleString("en-IN")}
              </TD>
              <TD>{(r.advancePaid ?? 0).toLocaleString("en-IN")}</TD>
              <TD>{(r.fullPaid ?? 0).toLocaleString("en-IN")}</TD>
              <TD>{r.outstanding.toLocaleString("en-IN")}</TD>
              <TD className="text-xs">{r.zohoInvoiceRef ?? "—"}</TD>
              <TD>
                <Badge className={STATUS_BADGE[r.status]}>{r.status}</Badge>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
