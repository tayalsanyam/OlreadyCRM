"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookingsTable } from "@/components/bookings/BookingsTable";
import { BookingDateFilter } from "@/components/bookings/BookingDateFilter";
import { Input } from "@/components/ui/Input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { cn } from "@/lib/utils";
import { bookingDateBounds, type BookingDateFilterValue } from "@/lib/booking-date-range";
import type { BookingRow, PlanTier, Region } from "@/lib/types";
import { PLAN_TIER_LABELS } from "@/lib/types";
import type { PaginatedResult } from "@/db/index";
import type { SelfBookingFilter } from "@/lib/bookings-list";

const REGIONS: Region[] = ["north", "east", "west", "south"];

const fmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

interface AdminBookingByMuaRow {
  muaId: string;
  muaName: string;
  leadId: string;
  displayId: string;
  brideName: string;
  ceremonyType: string | null;
  eventDate: string | null;
  bookingDate: string;
  source: "formal" | "feedback";
  bookedPrice: number | null;
  tracksCommission: boolean;
  commissionAmount: number | null;
  commissionPaid: number | null;
}

function commissionLabel(row: AdminBookingByMuaRow): string {
  if (row.source === "feedback") return "—";
  if (!row.tracksCommission) return "No";
  if (row.commissionAmount == null || row.commissionAmount <= 0) return "Tracked";
  const paid = row.commissionPaid ?? 0;
  if (paid >= row.commissionAmount) return fmt.format(row.commissionAmount) + " paid";
  if (paid > 0) {
    return `${fmt.format(row.commissionAmount)} (${fmt.format(paid)} rcvd)`;
  }
  return fmt.format(row.commissionAmount);
}

interface StaffOption {
  id: string;
  name: string;
}

const PLAN_OPTIONS: PlanTier[] = [
  "highestPrivy",
  "phoenix2",
  "phoenix",
  "pro",
  "prime",
];

type Tab = "active" | "cancelled" | "byMua";

async function fetchStaffOptions(url: string): Promise<StaffOption[]> {
  const res = await fetch(url);
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(res.ok ? "Empty response from server" : `Request failed (${res.status})`);
  }
  const json = JSON.parse(text) as { data?: StaffOption[]; error?: string | null };
  if (!res.ok || json.error) {
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }
  return json.data ?? [];
}

function buildSharedFilterParams(opts: {
  region: Region | "";
  regionalRmId: string;
  commissionRmId: string;
  selfBooking: SelfBookingFilter;
  dateRange: BookingDateFilterValue;
}) {
  const p = new URLSearchParams();
  if (opts.region) p.set("region", opts.region);
  if (opts.regionalRmId) p.set("regionalRmId", opts.regionalRmId);
  if (opts.commissionRmId) p.set("commissionRmId", opts.commissionRmId);
  if (opts.selfBooking !== "all") p.set("selfBooking", opts.selfBooking);
  const bounds = bookingDateBounds(opts.dateRange);
  if (bounds.from) p.set("fromDate", bounds.from);
  if (bounds.to) p.set("toDate", bounds.to);
  return p;
}

export default function AdminBookingsPage() {
  const [tab, setTab] = useState<Tab>("active");
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [muaRows, setMuaRows] = useState<AdminBookingByMuaRow[]>([]);
  const [regionalRms, setRegionalRms] = useState<StaffOption[]>([]);
  const [commissionRms, setCommissionRms] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [region, setRegion] = useState<Region | "">("");
  const [regionalRmId, setRegionalRmId] = useState("");
  const [commissionRmId, setCommissionRmId] = useState("");
  const [selfBooking, setSelfBooking] = useState<SelfBookingFilter>("all");
  const [dateRange, setDateRange] = useState<BookingDateFilterValue>({
    mode: "all",
  });
  const [planTier, setPlanTier] = useState<PlanTier | "">("");
  const [muaSearch, setMuaSearch] = useState("");

  const sharedFilters = useMemo(
    () =>
      buildSharedFilterParams({
        region,
        regionalRmId,
        commissionRmId,
        selfBooking,
        dateRange,
      }),
    [region, regionalRmId, commissionRmId, selfBooking, dateRange]
  );

  useEffect(() => {
    void fetchStaffOptions("/api/admin/rms")
      .then(setRegionalRms)
      .catch(() => setRegionalRms([]));
    void fetchStaffOptions("/api/admin/rms?role=commission")
      .then(setCommissionRms)
      .catch(() => setCommissionRms([]));
  }, []);

  const bookingsQuery = useMemo(() => {
    const p = new URLSearchParams(sharedFilters);
    p.set("pageSize", "500");
    p.set("cancelled", tab === "cancelled" ? "true" : "false");
    return p.toString();
  }, [sharedFilters, tab]);

  const loadBookings = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    void fetch(`/api/bookings?${bookingsQuery}`)
      .then((r) => {
        if (!r.ok) {
          return r.json().then((json: { error?: string }) => {
            throw new Error(json.error ?? `Request failed (${r.status})`);
          });
        }
        return r.json();
      })
      .then((json: { data: PaginatedResult<BookingRow> | null; error?: string }) => {
        if (json.error) throw new Error(json.error);
        setBookings(json.data?.data ?? []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setBookings([]);
        setLoadError(err instanceof Error ? err.message : "Could not load bookings");
        setLoading(false);
      });
  }, [bookingsQuery]);

  const byMuaQuery = useMemo(() => {
    const p = new URLSearchParams(sharedFilters);
    if (planTier) p.set("planTier", planTier);
    if (muaSearch.trim()) p.set("q", muaSearch.trim());
    return p.toString();
  }, [sharedFilters, planTier, muaSearch]);

  const loadByMua = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    const qs = byMuaQuery ? `?${byMuaQuery}` : "";
    void fetch(`/api/admin/bookings/by-mua${qs}`)
      .then((r) => {
        if (!r.ok) {
          return r.json().then((json: { error?: string }) => {
            throw new Error(json.error ?? `Request failed (${r.status})`);
          });
        }
        return r.json();
      })
      .then((json: { data: AdminBookingByMuaRow[]; error?: string }) => {
        if (json.error) throw new Error(json.error);
        setMuaRows(json.data ?? []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setMuaRows([]);
        setLoadError(err instanceof Error ? err.message : "Could not load MUA summary");
        setLoading(false);
      });
  }, [byMuaQuery]);

  useEffect(() => {
    if (tab === "byMua") loadByMua();
    else loadBookings();
  }, [tab, loadBookings, loadByMua]);

  const byMuaCsvHref = useMemo(() => {
    const p = new URLSearchParams(byMuaQuery);
    p.set("format", "csv");
    return `/api/admin/bookings/by-mua?${p.toString()}`;
  }, [byMuaQuery]);

  const byMuaTotals = useMemo(() => {
    return muaRows.reduce(
      (acc, r) => ({
        formal: acc.formal + (r.source === "formal" ? 1 : 0),
        feedback: acc.feedback + (r.source === "feedback" ? 1 : 0),
        revenue:
          acc.revenue + (r.source === "formal" ? (r.bookedPrice ?? 0) : 0),
      }),
      { formal: 0, feedback: 0, revenue: 0 }
    );
  }, [muaRows]);

  const csvHref = useMemo(() => {
    if (tab === "byMua") return null;
    const p = new URLSearchParams(sharedFilters);
    p.set("cancelled", tab === "cancelled" ? "true" : "false");
    return `/api/admin/bookings/export?${p.toString()}`;
  }, [tab, sharedFilters]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand">All Bookings</h1>
          <p className="text-sm text-slate-muted">
            Across all regions and RMs. Commission columns (highlighted) appear
            after Price — scroll horizontally if needed on smaller screens.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {csvHref && (
            <a
              href={csvHref}
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-brand hover:bg-slate-50"
            >
              Export bookings CSV ↓
            </a>
          )}
          {tab === "byMua" && (
            <a
              href={byMuaCsvHref}
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-brand hover:bg-slate-50"
            >
              Export by MUA CSV ↓
            </a>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {(
          [
            ["active", "Active"],
            ["cancelled", "Cancelled"],
            ["byMua", "By MUA"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === id
                ? "border-brand text-brand"
                : "border-transparent text-slate-muted hover:text-brand"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-slate-muted">Region:</span>
          <button
            type="button"
            onClick={() => setRegion("")}
            className={cn(
              "rounded-full px-3 py-1 text-xs capitalize",
              !region ? "bg-accent text-white" : "border border-slate-200"
            )}
          >
            All
          </button>
          {REGIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRegion(r)}
              className={cn(
                "rounded-full px-3 py-1 text-xs capitalize",
                region === r ? "bg-accent text-white" : "border border-slate-200"
              )}
            >
              {r}
            </button>
          ))}

          <select
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            value={regionalRmId}
            onChange={(e) => setRegionalRmId(e.target.value)}
            aria-label="Regional RM"
          >
            <option value="">All regional RMs</option>
            {regionalRms.map((rm) => (
              <option key={rm.id} value={rm.id}>
                {rm.name}
              </option>
            ))}
          </select>

          <select
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            value={commissionRmId}
            onChange={(e) => setCommissionRmId(e.target.value)}
            aria-label="Commission RM"
          >
            <option value="">All commission RMs</option>
            {commissionRms.map((rm) => (
              <option key={rm.id} value={rm.id}>
                {rm.name}
              </option>
            ))}
          </select>

          <select
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            value={selfBooking}
            onChange={(e) => setSelfBooking(e.target.value as SelfBookingFilter)}
            aria-label="Self booking"
          >
            <option value="all">All bookings</option>
            <option value="yes">Self booking (feedback)</option>
            <option value="no">RM / Commission only</option>
          </select>

          {tab === "byMua" && (
            <select
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              value={planTier}
              onChange={(e) => setPlanTier(e.target.value as PlanTier | "")}
            >
              <option value="">All plans</option>
              {PLAN_OPTIONS.map((tier) => (
                <option key={tier} value={tier}>
                  {PLAN_TIER_LABELS[tier]}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_minmax(280px,360px)]">
          <BookingDateFilter value={dateRange} onChange={setDateRange} />
          {tab === "byMua" && (
            <Input
              label="Search MUA"
              value={muaSearch}
              onChange={(e) => setMuaSearch(e.target.value)}
              placeholder="Name or display ID"
            />
          )}
        </div>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
      ) : tab === "byMua" ? (
        <div className="space-y-3">
          {muaRows.length > 0 && (
            <p className="text-sm text-slate-muted">
              {muaRows.length} bookings ({byMuaTotals.formal} RM/Commission ·{" "}
              {byMuaTotals.feedback} feedback) · {fmt.format(byMuaTotals.revenue)}{" "}
              formal revenue
            </p>
          )}
          <Table>
            <THead>
              <TR>
                <TH>MUA</TH>
                <TH>Bride</TH>
                <TH>Event date</TH>
                <TH>Booking date</TH>
                <TH>Source</TH>
                <TH>Price</TH>
                <TH>Commission</TH>
              </TR>
            </THead>
            <TBody>
              {muaRows.length === 0 ? (
                <TR>
                  <TD colSpan={7} className="py-8 text-center text-sm text-slate-muted">
                    No bookings match these filters.
                  </TD>
                </TR>
              ) : (
                muaRows.map((r) => (
                  <TR key={`${r.source}-${r.muaId}-${r.leadId}-${r.bookingDate}`}>
                    <TD className="font-medium">
                      <Link
                        href={`/admin/muas/${r.muaId}`}
                        className="text-accent hover:underline"
                      >
                        {r.muaName}
                      </Link>
                    </TD>
                    <TD>
                      <Link
                        href={`/rm/leads/${r.leadId}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {r.brideName}
                      </Link>
                      <p className="text-[10px] text-slate-muted">{r.displayId}</p>
                      {r.ceremonyType && (
                        <p className="text-[10px] text-slate-muted">{r.ceremonyType}</p>
                      )}
                    </TD>
                    <TD className="text-xs text-slate-muted">
                      {r.eventDate
                        ? new Date(r.eventDate).toLocaleDateString("en-IN")
                        : "—"}
                    </TD>
                    <TD className="text-xs text-slate-muted">
                      {r.bookingDate
                        ? new Date(r.bookingDate).toLocaleDateString("en-IN")
                        : "—"}
                    </TD>
                    <TD className="text-xs capitalize">
                      {r.source === "feedback" ? "Feedback" : "RM / Commission"}
                    </TD>
                    <TD className="text-xs">
                      {r.bookedPrice != null ? fmt.format(r.bookedPrice) : "—"}
                    </TD>
                    <TD className="text-xs text-slate-muted">
                      {commissionLabel(r)}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </div>
      ) : (
        <BookingsTable
          bookings={bookings}
          showRm
          showRegion
          showCommission
          hideDateFilter
          leadHref={(id) => `/rm/leads/${id}`}
          onRefresh={loadBookings}
          canCancel={tab === "active"}
        />
      )}
    </div>
  );
}
