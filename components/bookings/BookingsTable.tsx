"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookingDateFilter } from "@/components/bookings/BookingDateFilter";
import { bookingDateBounds } from "@/lib/booking-date-range";
import type { BookingDateFilterValue } from "@/lib/booking-date-range";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { BookingPaymentModal } from "@/components/bookings/BookingPaymentModal";
import { BookingsFiltersBar } from "@/components/bookings/BookingsFiltersBar";
import { Badge } from "@/components/ui/Badge";
import {
  filterBookingsList,
  type BookingsListFilters,
} from "@/lib/bookings-filters";
import { ceremonyIcon } from "@/components/leads/CeremonyBudgetFields";
import {
  bookingAmountPaid,
  bookingOutstanding,
  bookingPaymentStatus,
  bridePaymentTrackingDismissed,
  PAYMENT_MODE_OPTIONS,
} from "@/lib/booking-payment";
import {
  bookingShowsCommission,
  commissionCollectionStage,
  commissionOutstanding,
  COMMISSION_COLLECTION_STAGE_LABELS,
} from "@/lib/commission-booking";
import { cn } from "@/lib/utils";
import type { BookingRow } from "@/lib/types";
import { PLAN_TIER_LABELS } from "@/lib/types";

const fmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

interface BookingsTableProps {
  bookings: BookingRow[];
  showRm?: boolean;
  showRegion?: boolean;
  showCommission?: boolean;
  hideDateFilter?: boolean;
  leadHref?: (leadId: string) => string;
  onRefresh?: () => void;
  canCancel?: boolean;
}

export function BookingsTable({
  bookings,
  showRm = false,
  showRegion = false,
  showCommission = false,
  hideDateFilter = false,
  leadHref = (id) => `/rm/leads/${id}`,
  onRefresh,
  canCancel = true,
}: BookingsTableProps) {
  const { toast } = useToast();
  const [bookingDateRange, setBookingDateRange] =
    useState<BookingDateFilterValue>({ mode: "all" });
  const [listFilters, setListFilters] = useState<BookingsListFilters>({
    leadQuery: "",
    muaId: "",
    plan: "",
    commissionStatus: "",
  });
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<BookingRow | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const paymentModeLabel = (mode: BookingRow["paymentMode"]) =>
    PAYMENT_MODE_OPTIONS.find((o) => o.value === mode)?.label ?? "—";

  const filtered = useMemo(() => {
    if (hideDateFilter) {
      return filterBookingsList(bookings, listFilters);
    }
    const bounds = bookingDateBounds(bookingDateRange);
    return filterBookingsList(bookings, listFilters, bounds);
  }, [bookings, bookingDateRange, listFilters, hideDateFilter]);

  /** Admin table has region + RM columns — show commission next to price so it stays visible. */
  const commissionAfterPrice =
    showCommission && showRm && showRegion;

  const summary = useMemo(() => {
    let totalValue = 0;
    let collected = 0;
    let fullyPaid = 0;
    let pendingCollection = 0;
    let commissionDue = 0;
    let commissionReceived = 0;
    let commissionOverdue = 0;
    for (const b of filtered) {
      if (b.cancelled) continue;
      totalValue += b.bookedPrice;
      const paid = bookingAmountPaid(b);
      collected += paid;
      if (!bridePaymentTrackingDismissed(b)) {
        pendingCollection += bookingOutstanding(b);
      }
      if (bookingPaymentStatus(b) === "paid") fullyPaid += 1;
      if (showCommission && bookingShowsCommission(b)) {
        commissionDue += b.commissionAmount ?? 0;
        commissionReceived += b.commissionPaid ?? 0;
        if (b.commissionOverdue) commissionOverdue += 1;
      }
    }
    return {
      count: filtered.filter((b) => !b.cancelled).length,
      totalValue,
      collected,
      fullyPaid,
      pendingCollection,
      commissionDue,
      commissionReceived,
      commissionOverdue,
    };
  }, [filtered, showCommission]);

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/bookings/${cancelTarget.id}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Cancelled by user" }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast(json.error ?? "Could not cancel booking", "error");
        return;
      }
      toast("Booking cancelled — lead returned to active queue");
      setCancelTarget(null);
      onRefresh?.();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
          Total bookings: {summary.count}
        </span>
        <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800">
          Total value: {fmt.format(summary.totalValue)}
        </span>
        {!showCommission && (
          <>
            <span className="rounded-full bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-800">
              Collected: {fmt.format(summary.collected)}
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
              Fully paid: {summary.fullyPaid}
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900">
              Pending collection: {fmt.format(summary.pendingCollection)}
            </span>
          </>
        )}
        {showCommission && (
          <>
            <span
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                summary.commissionDue - summary.commissionReceived > 0
                  ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300"
                  : "bg-violet-50 text-violet-900",
              )}
            >
              Commission still due:{" "}
              {fmt.format(
                Math.max(0, summary.commissionDue - summary.commissionReceived),
              )}
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
              Commission received: {fmt.format(summary.commissionReceived)}
            </span>
            {summary.commissionOverdue > 0 && (
              <span className="rounded-full bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-900 ring-1 ring-red-300">
                Overdue: {summary.commissionOverdue} booking
                {summary.commissionOverdue === 1 ? "" : "s"}
              </span>
            )}
          </>
        )}
      </div>

      <BookingsFiltersBar
        bookings={bookings}
        filters={listFilters}
        onChange={setListFilters}
        filteredCount={filtered.length}
        showCommissionFilter={showCommission}
      />

      {!hideDateFilter && (
        <BookingDateFilter
          value={bookingDateRange}
          onChange={setBookingDateRange}
        />
      )}

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-muted">
          {bookings.length === 0
            ? "No bookings found"
            : "No bookings match your filters"}
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Booking date</TH>
              <TH>Bride</TH>
              <TH>Ceremony</TH>
              <TH>Event date</TH>
              <TH>MUA</TH>
              <TH>Plan</TH>
              {showRegion && <TH>Region</TH>}
              <TH>Price</TH>
              {commissionAfterPrice && (
                <>
                  <TH className="bg-violet-50/80">Comm. due</TH>
                  <TH className="bg-violet-50/80">Comm. rcvd</TH>
                  <TH className="bg-violet-50/80">Commission</TH>
                </>
              )}
              <TH>Status</TH>
              <TH>Advance</TH>
              <TH>Balance</TH>
              <TH>Mode</TH>
              {showCommission && !commissionAfterPrice && <TH>Comm. due</TH>}
              {showCommission && !commissionAfterPrice && <TH>Comm. rcvd</TH>}
              {showCommission && !commissionAfterPrice && <TH>Commission</TH>}
              {showRm && <TH>RM</TH>}
              <TH className="sticky right-0 min-w-[140px] bg-light-bg">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((b) => (
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
                  <p className="text-[10px] text-slate-muted">{b.displayId}</p>
                  {!b.cancelled && (
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-accent hover:underline"
                      onClick={() => setPaymentTarget(b)}
                    >
                      {showCommission ? "Record commission →" : "Record payment →"}
                    </button>
                  )}
                </TD>
                <TD>
                  {ceremonyIcon(b.ceremonyType)} {b.ceremonyType}
                </TD>
                <TD className="text-xs text-slate-muted">
                  {b.eventDate
                    ? new Date(b.eventDate).toLocaleDateString("en-IN")
                    : "—"}
                </TD>
                <TD>{b.muaName}</TD>
                <TD className="text-xs">
                  {b.muaPlan ? PLAN_TIER_LABELS[b.muaPlan] : "—"}
                </TD>
                {showRegion && (
                  <TD className="capitalize text-xs">{b.region}</TD>
                )}
                <TD className="font-medium">{fmt.format(b.bookedPrice)}</TD>
                {commissionAfterPrice && (
                  <>
                    <CommissionDueCell booking={b} fmt={fmt} />
                    <CommissionReceivedCell booking={b} fmt={fmt} />
                    <CommissionStatusCell
                      booking={b}
                      fmt={fmt}
                      onRecord={() => setPaymentTarget(b)}
                    />
                  </>
                )}
                <TD>
                  {b.cancelled ? (
                    <span className="text-xs text-slate-muted">Cancelled</span>
                  ) : showCommission && bookingShowsCommission(b) ? (
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => setPaymentTarget(b)}
                      title="Record or update commission"
                    >
                      <CommissionStatusBadge booking={b} fmt={fmt} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => setPaymentTarget(b)}
                      title="Record or update payment"
                    >
                      {bridePaymentTrackingDismissed(b) ? (
                        <Badge variant="muted">Not tracked</Badge>
                      ) : (
                        <Badge
                          variant={
                            bookingPaymentStatus(b) === "paid"
                              ? "success"
                              : bookingPaymentStatus(b) === "partial"
                                ? "hot"
                                : "muted"
                          }
                        >
                          {bookingPaymentStatus(b) === "paid"
                            ? "Paid"
                            : bookingPaymentStatus(b) === "partial"
                              ? "Partial"
                              : "Unpaid"}
                        </Badge>
                      )}
                    </button>
                  )}
                </TD>
                <TD
                  className={cn(
                    "text-xs",
                    b.advancePaid ? "text-emerald-600" : "text-slate-muted"
                  )}
                >
                  {b.advancePaid ? fmt.format(b.advancePaid) : "—"}
                </TD>
                <TD
                  className={cn(
                    "text-xs",
                    b.fullPaid ? "text-emerald-600" : "text-slate-muted"
                  )}
                >
                  {b.fullPaid ? fmt.format(b.fullPaid) : "—"}
                </TD>
                <TD className="text-xs text-slate-muted">
                  {paymentModeLabel(b.paymentMode)}
                </TD>
                {showCommission && !commissionAfterPrice && (
                  <>
                    <CommissionDueCell booking={b} fmt={fmt} />
                    <CommissionReceivedCell booking={b} fmt={fmt} />
                    <CommissionStatusCell
                      booking={b}
                      fmt={fmt}
                      onRecord={() => setPaymentTarget(b)}
                    />
                  </>
                )}
                {showRm && (
                  <TD className="text-xs">{b.rmName ?? "—"}</TD>
                )}
                <TD className="sticky right-0 bg-white shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                  <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap">
                    {!b.cancelled && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => setPaymentTarget(b)}
                      >
                        {showCommission ? "Record commission" : "Record payment"}
                      </Button>
                    )}
                    {canCancel && !b.cancelled && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger"
                        onClick={() => setCancelTarget(b)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <BookingPaymentModal
        booking={paymentTarget}
        open={!!paymentTarget}
        onClose={() => setPaymentTarget(null)}
        onSaved={() => onRefresh?.()}
      />

      <Modal
        open={!!cancelTarget}
        onClose={() => !cancelling && setCancelTarget(null)}
        title="Cancel booking"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={cancelling}
              onClick={() => setCancelTarget(null)}
            >
              Keep booking
            </Button>
            <Button
              variant="secondary"
              disabled={cancelling}
              onClick={() => void confirmCancel()}
            >
              {cancelling ? "Cancelling…" : "Cancel booking"}
            </Button>
          </>
        }
      >
        {cancelTarget && (
          <p className="text-sm text-slate-muted">
            Cancel the {cancelTarget.ceremonyType} booking for{" "}
            <strong>{cancelTarget.brideName}</strong> with {cancelTarget.muaName}?
            The event will reopen and the lead will return to your queue if it was
            fully booked.
          </p>
        )}
      </Modal>
    </div>
  );
}

function CommissionStatusBadge({
  booking: b,
  fmt,
}: {
  booking: BookingRow;
  fmt: Intl.NumberFormat;
}) {
  const stage = commissionCollectionStage(b);
  const outstanding = commissionOutstanding(b);
  return (
    <Badge
      variant={
        stage === "paid"
          ? "success"
          : stage === "overdue"
            ? "hot"
            : stage === "sla_due" || stage === "partial" || outstanding > 0
              ? "hot"
              : "muted"
      }
    >
      {stage === "partial" || (stage !== "paid" && outstanding > 0)
        ? `${COMMISSION_COLLECTION_STAGE_LABELS[stage]} · ${fmt.format(outstanding)} due`
        : COMMISSION_COLLECTION_STAGE_LABELS[stage]}
    </Badge>
  );
}

function CommissionDueCell({
  booking: b,
  fmt,
}: {
  booking: BookingRow;
  fmt: Intl.NumberFormat;
}) {
  return (
    <TD className="bg-violet-50/30 text-xs">
      {bookingShowsCommission(b) && b.commissionAmount != null
        ? fmt.format(b.commissionAmount)
        : "—"}
    </TD>
  );
}

function CommissionReceivedCell({
  booking: b,
  fmt,
}: {
  booking: BookingRow;
  fmt: Intl.NumberFormat;
}) {
  return (
    <TD className="bg-violet-50/30 text-xs text-emerald-700">
      {bookingShowsCommission(b) ? fmt.format(b.commissionPaid ?? 0) : "—"}
    </TD>
  );
}

function CommissionStatusCell({
  booking: b,
  fmt,
  onRecord,
}: {
  booking: BookingRow;
  fmt: Intl.NumberFormat;
  onRecord: () => void;
}) {
  const stage = commissionCollectionStage(b);
  return (
    <TD className="bg-violet-50/30">
      {!bookingShowsCommission(b) || b.cancelled ? (
        <span className="text-xs text-slate-muted">—</span>
      ) : (
        <button type="button" className="text-left" onClick={onRecord}>
          <Badge
            variant={
              stage === "paid"
                ? "success"
                : stage === "overdue"
                  ? "hot"
                  : stage === "sla_due" || stage === "partial"
                    ? "hot"
                    : "muted"
            }
          >
            {stage === "partial"
              ? `Partial · ${fmt.format(commissionOutstanding(b))}`
              : COMMISSION_COLLECTION_STAGE_LABELS[stage]}
          </Badge>
          {b.commissionNextFollowUpAt && stage !== "paid" && (
            <p className="mt-0.5 text-[10px] text-slate-muted">
              Follow-up{" "}
              {new Date(b.commissionNextFollowUpAt).toLocaleDateString("en-IN")}
            </p>
          )}
        </button>
      )}
    </TD>
  );
}
