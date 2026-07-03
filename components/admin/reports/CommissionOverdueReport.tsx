"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import {
  bookingAmountPaid,
  bookingPaymentStatus,
} from "@/lib/booking-payment";
import {
  commissionOutstanding,
  commissionPaymentStatus,
} from "@/lib/commission-booking";
import type { CommissionOverdueRow } from "@/lib/commission-overdue-query";

const fmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

type RmOption = { id: string; name: string };

export function CommissionOverdueReport({
  apiBase,
  leadHref = (id) => `/rm/leads/${id}`,
  showAdminFilters = false,
}: {
  apiBase: "/api/reports" | "/api/admin/reports";
  leadHref?: (leadId: string) => string;
  showAdminFilters?: boolean;
}) {
  const [rows, setRows] = useState<CommissionOverdueRow[]>([]);
  const [overdueOnly, setOverdueOnly] = useState(true);
  const [commissionRmId, setCommissionRmId] = useState("");
  const [bookingFrom, setBookingFrom] = useState("");
  const [bookingTo, setBookingTo] = useState("");
  const [commissionRms, setCommissionRms] = useState<RmOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!showAdminFilters) return;
    void fetch("/api/admin/rms?role=commission_rm")
      .then((r) => r.json())
      .then((json: { data: RmOption[] }) => setCommissionRms(json.data ?? []));
  }, [showAdminFilters]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      overdueOnly: overdueOnly ? "true" : "false",
    });
    if (showAdminFilters) {
      if (commissionRmId) params.set("commissionRmId", commissionRmId);
      if (bookingFrom) params.set("bookingFrom", bookingFrom);
      if (bookingTo) params.set("bookingTo", bookingTo);
    }
    void fetch(`${apiBase}/commission-overdue?${params}`)
      .then(async (r) => {
        const json = (await r.json()) as {
          data: { rows: CommissionOverdueRow[]; overdueCount: number } | null;
          error?: string | null;
        };
        if (!r.ok) {
          throw new Error(json.error ?? "Failed to load commission overdue");
        }
        setRows(json.data?.rows ?? []);
      })
      .catch((e: unknown) => {
        setRows([]);
        setError(e instanceof Error ? e.message : "Failed to load commission overdue");
      })
      .finally(() => setLoading(false));
  }, [
    apiBase,
    overdueOnly,
    showAdminFilters,
    commissionRmId,
    bookingFrom,
    bookingTo,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  const overdueCount = rows.filter((r) => r.commissionOverdue).length;

  const buildExportParams = () => {
    const params = new URLSearchParams({
      format: "csv",
      overdueOnly: overdueOnly ? "true" : "false",
    });
    if (showAdminFilters) {
      if (commissionRmId) params.set("commissionRmId", commissionRmId);
      if (bookingFrom) params.set("bookingFrom", bookingFrom);
      if (bookingTo) params.set("bookingTo", bookingTo);
    }
    return params.toString();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOverdueOnly(true)}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            overdueOnly
              ? "bg-accent text-white"
              : "border border-slate-200 text-slate-muted"
          }`}
        >
          Overdue only ({overdueCount})
        </button>
        <button
          type="button"
          onClick={() => setOverdueOnly(false)}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            !overdueOnly
              ? "bg-accent text-white"
              : "border border-slate-200 text-slate-muted"
          }`}
        >
          All commission bookings
        </button>
        <Button
          type="button"
          variant="secondary"
          className="ml-auto"
          onClick={() => {
            window.location.href = `${apiBase}/commission-overdue?${buildExportParams()}`;
          }}
        >
          {overdueOnly ? "Export overdue CSV ↓" : "Export commission bookings CSV ↓"}
        </Button>
      </div>

      {showAdminFilters && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <label className="text-sm">
            Commission RM
            <select
              className="mt-1 block min-w-[160px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={commissionRmId}
              onChange={(e) => setCommissionRmId(e.target.value)}
            >
              <option value="">All commission RMs</option>
              {commissionRms.map((rm) => (
                <option key={rm.id} value={rm.id}>
                  {rm.name}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Booked from"
            type="date"
            value={bookingFrom}
            onChange={(e) => setBookingFrom(e.target.value)}
          />
          <Input
            label="Booked to"
            type="date"
            value={bookingTo}
            onChange={(e) => setBookingTo(e.target.value)}
          />
        </div>
      )}

      <p className="text-sm text-slate-muted">
        SLA follow-up at 7 days from booking; overdue at 30 days if commission
        from MUA is still due.
      </p>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-200" />
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-muted">
          {overdueOnly ? "No overdue commission" : "No commission bookings"}
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Booking</TH>
              <TH>Bride</TH>
              {showAdminFilters && <TH>Commission RM</TH>}
              <TH>MUA</TH>
              <TH>Booked</TH>
              <TH>Bride pay</TH>
              <TH>Commission due</TH>
              <TH>Received</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((b) => (
              <TR key={b.id}>
                <TD className="text-xs text-slate-muted">
                  {new Date(b.bookingDate).toLocaleDateString("en-IN")}
                </TD>
                <TD>
                  <Link
                    href={leadHref(b.leadId)}
                    className="font-medium text-accent hover:underline"
                  >
                    {b.brideName}
                  </Link>
                  <p className="text-[10px] text-slate-muted">
                    {b.ceremonyType}
                  </p>
                </TD>
                {showAdminFilters && (
                  <TD className="text-sm">{b.rmName ?? "—"}</TD>
                )}
                <TD className="text-sm">{b.muaName}</TD>
                <TD>{fmt.format(b.bookedPrice)}</TD>
                <TD className="text-xs">
                  {bookingPaymentStatus(b) === "paid" ? (
                    <span className="text-emerald-600">Paid</span>
                  ) : (
                    <span className="text-amber-700">
                      {fmt.format(bookingAmountPaid(b))} /{" "}
                      {fmt.format(b.bookedPrice)}
                    </span>
                  )}
                </TD>
                <TD className="font-medium">
                  {b.commissionAmount != null
                    ? fmt.format(b.commissionAmount)
                    : "—"}
                </TD>
                <TD className="text-xs">
                  {fmt.format(b.commissionPaid ?? 0)}
                </TD>
                <TD>
                  {b.commissionOverdue ? (
                    <Badge variant="hot">{b.overdueReason}</Badge>
                  ) : (
                    <Badge
                      variant={
                        commissionPaymentStatus(b) === "paid"
                          ? "success"
                          : commissionPaymentStatus(b) === "partial"
                            ? "hot"
                            : "muted"
                      }
                    >
                      {commissionPaymentStatus(b) === "paid"
                        ? "Paid"
                        : commissionPaymentStatus(b) === "partial"
                          ? `Partial · ${fmt.format(commissionOutstanding(b))} due`
                          : "Unpaid"}
                    </Badge>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
