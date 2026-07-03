"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
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
  commissionPaymentStatus,
  COMMISSION_COLLECTION_STAGE_LABELS,
  commissionSlaDueDate,
} from "@/lib/commission-booking";
import type { BookingRow, PaymentMode } from "@/lib/types";
import { cn } from "@/lib/utils";

function parseAmount(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

interface BookingPaymentModalProps {
  booking: BookingRow | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function BookingPaymentModal({
  booking,
  open,
  onClose,
  onSaved,
}: BookingPaymentModalProps) {
  const { toast } = useToast();
  const [advancePaid, setAdvancePaid] = useState("");
  const [fullPaid, setFullPaid] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode | "">("");
  const [zohoInvoiceRef, setZohoInvoiceRef] = useState("");
  const [commissionAmount, setCommissionAmount] = useState("");
  const [commissionIncrement, setCommissionIncrement] = useState("");
  const [commissionPaymentMode, setCommissionPaymentMode] = useState<
    PaymentMode | ""
  >("");
  const [commissionFollowUp, setCommissionFollowUp] = useState("");
  const [saving, setSaving] = useState(false);
  const [brideSectionOpen, setBrideSectionOpen] = useState(false);
  const [dismissBridePayment, setDismissBridePayment] = useState(false);
  const [commissionTouched, setCommissionTouched] = useState(false);
  const [brideTouched, setBrideTouched] = useState(false);

  useEffect(() => {
    if (!booking || !open) return;
    setBrideSectionOpen(false);
    setDismissBridePayment(
      bridePaymentTrackingDismissed({
        brideFullyPaidAt: booking.brideFullyPaidAt,
        bookedPrice: booking.bookedPrice,
        advancePaid: booking.advancePaid,
        fullPaid: booking.fullPaid,
      }),
    );
    setAdvancePaid(
      booking.advancePaid != null ? String(booking.advancePaid) : ""
    );
    setFullPaid(booking.fullPaid != null ? String(booking.fullPaid) : "");
    setPaymentMode(booking.paymentMode ?? "");
    setZohoInvoiceRef(booking.zohoInvoiceRef ?? "");
    setCommissionAmount(
      booking.commissionAmount != null ? String(booking.commissionAmount) : ""
    );
    setCommissionIncrement("");
    setCommissionPaymentMode(booking.commissionPaymentMode ?? "");
    setCommissionFollowUp(booking.commissionNextFollowUpAt?.slice(0, 10) ?? "");
    setCommissionTouched(false);
    setBrideTouched(false);
  }, [booking, open]);

  if (!booking) return null;

  const trackCommission = bookingShowsCommission(booking);
  const bridePreview = {
    bookedPrice: booking.bookedPrice,
    advancePaid: parseAmount(advancePaid),
    fullPaid: parseAmount(fullPaid),
  };
  const brideStatus = bookingPaymentStatus(bridePreview);
  const brideOutstanding = bookingOutstanding(bridePreview);

  const commissionFloor = booking.commissionPaid ?? 0;
  const commissionSavedFullyPaid =
    commissionPaymentStatus({
      commissionAmount: booking.commissionAmount,
      commissionPaid: booking.commissionPaid,
    }) === "paid";
  const brideFloor = bookingAmountPaid({
    advancePaid: booking.advancePaid,
    fullPaid: booking.fullPaid,
  });
  const incrementPreview = parseAmount(commissionIncrement) ?? 0;
  const commDue = parseAmount(commissionAmount);
  const commPreview = {
    commissionAmount: commDue ?? booking.commissionAmount,
    commissionPaid: commissionFloor + incrementPreview,
    bookingDate: booking.bookingDate,
  };
  const commStage = trackCommission
    ? commissionCollectionStage({
        commissionAmount: booking.commissionAmount,
        commissionPaid: booking.commissionPaid,
        bookingDate: booking.bookingDate,
      })
    : "paid";
  const commOutstanding = trackCommission
    ? commissionOutstanding(commPreview)
    : 0;
  const defaultSlaDate = commissionSlaDueDate(booking.bookingDate);

  async function save() {
    const advance = parseAmount(advancePaid);
    const balance = parseAmount(fullPaid);
    const brideSectionActive =
      !trackCommission || brideSectionOpen || brideTouched;

    if (brideSectionActive && !dismissBridePayment) {
      if (advancePaid.trim() && advance === null) {
        toast("Enter a valid advance amount", "error");
        return;
      }
      if (fullPaid.trim() && balance === null) {
        toast("Enter a valid balance amount", "error");
        return;
      }
      const paid = (advance ?? 0) + (balance ?? 0);
      if (paid > booking!.bookedPrice) {
        toast("Advance + balance cannot exceed booked price", "error");
        return;
      }
      if (paid < brideFloor) {
        toast("Recorded bride payment cannot be reduced", "error");
        return;
      }
    }

    let commDueVal: number | null | undefined = undefined;
    let commPaid: number | null | undefined = undefined;
    if (trackCommission && commissionTouched) {
      if (!booking!.commissionAmount && !commissionAmount.trim()) {
        toast("Enter commission due from MUA", "error");
        return;
      }
      if (commissionAmount.trim()) {
        commDueVal = parseAmount(commissionAmount);
        if (commDueVal === null) {
          toast("Enter a valid commission due amount", "error");
          return;
        }
      }
      if (commissionIncrement.trim()) {
        const increment = parseAmount(commissionIncrement);
        if (increment === null) {
          toast("Enter a valid commission received amount", "error");
          return;
        }
        commPaid = commissionFloor + increment;
      } else if (commissionSavedFullyPaid) {
        commPaid = commissionFloor;
      }
      if (commPaid != null && commPaid < commissionFloor) {
        toast("Commission received cannot be reduced", "error");
        return;
      }
      const due =
        commDueVal ?? booking!.commissionAmount ?? 0;
      if (commPaid != null && due > 0 && commPaid > due) {
        toast("Commission received cannot exceed commission due", "error");
        return;
      }
      if (
        !commissionSavedFullyPaid &&
        !commissionIncrement.trim() &&
        (commissionAmount.trim() || commissionPaymentMode || commissionFollowUp.trim())
      ) {
        toast("Enter the commission amount received in this payment", "error");
        return;
      }
    }

    const body: Record<string, unknown> = {};

    if (brideSectionActive && !dismissBridePayment) {
      body.advancePaid = advance;
      body.fullPaid = balance;
      body.paymentMode = paymentMode || null;
      body.zohoInvoiceRef = zohoInvoiceRef.trim() || null;
    } else if (!trackCommission && dismissBridePayment) {
      body.dismissBridePayment = true;
    }

    if (trackCommission && commissionTouched) {
      if (commDueVal !== undefined) body.commissionAmount = commDueVal;
      if (commPaid !== undefined) body.commissionPaid = commPaid;
      if (commissionPaymentMode) {
        body.commissionPaymentMode = commissionPaymentMode;
      }
      if (commissionFollowUp.trim() || booking!.commissionNextFollowUpAt) {
        body.commissionNextFollowUpAt = commissionFollowUp.trim() || null;
      }
    }

    if (Object.keys(body).length === 0) {
      toast("Nothing to save — enter a payment or commission amount", "error");
      return;
    }

    setSaving(true);

    const res = await fetch(`/api/bookings/${booking!.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      toast(json.error ?? "Could not save", "error");
      return;
    }
    toast("Saved");
    onSaved();
    onClose();
  }

  const fmt = (n: number) =>
    n.toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    });

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={trackCommission ? "Record commission" : "Record payments"}
      footer={
        <>
          <Button variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <p className="font-medium text-brand">
            {booking.brideName} · {booking.ceremonyType}
          </p>
          <p className="text-sm text-slate-muted">
            {booking.muaName} · Booking amount {fmt(booking.bookedPrice)}
          </p>
          {trackCommission && (
            <p className="mt-1 text-xs text-slate-muted">
              Olready tracks commission from the MUA. Bride pays the artist
              directly.
            </p>
          )}
        </div>

        {trackCommission && (
          <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-brand">
                Olready commission from MUA
              </h3>
              {commStage !== "paid" && (
                <Badge
                  variant={
                    commStage === "overdue" || commStage === "sla_due"
                      ? "hot"
                      : commStage === "partial"
                        ? "hot"
                        : "muted"
                  }
                >
                  {COMMISSION_COLLECTION_STAGE_LABELS[commStage]}
                </Badge>
              )}
              {commStage === "paid" && (
                <Badge variant="success">Received</Badge>
              )}
            </div>
            <p className="text-xs text-slate-muted">
              7-day SLA from booking
              {defaultSlaDate
                ? ` (${new Date(defaultSlaDate).toLocaleDateString("en-IN")})`
                : ""}
              ; overdue at 30 days.
            </p>
            {booking.commissionAmount == null && (
              <Input
                label="Commission due from MUA (Rs.) *"
                type="number"
                min={0}
                required
                value={commissionAmount}
                onChange={(e) => {
                  setCommissionTouched(true);
                  setCommissionAmount(e.target.value);
                }}
                placeholder="Required for older bookings"
              />
            )}
            {booking.commissionAmount != null && (
              <p className="text-xs text-slate-muted">
                Due at booking:{" "}
                <strong>{fmt(booking.commissionAmount)}</strong>
                {commissionFloor > 0 && (
                  <>
                    {" · "}
                    Already received: <strong>{fmt(commissionFloor)}</strong>
                  </>
                )}
              </p>
            )}
            {commissionSavedFullyPaid && (booking.commissionAmount ?? 0) > 0 ? (
              <p className="text-sm font-medium text-emerald-700">
                Commission fully received — {fmt(commissionFloor)}
                {booking.commissionPaymentMode && (
                  <>
                    {" · "}
                    {
                      PAYMENT_MODE_OPTIONS.find(
                        (o) => o.value === booking.commissionPaymentMode
                      )?.label
                    }
                  </>
                )}
              </p>
            ) : (
              <>
                <Input
                  label={
                    commissionFloor > 0
                      ? "Additional commission received now (Rs.)"
                      : "Commission received (Rs.)"
                  }
                  type="number"
                  min={0}
                  value={commissionIncrement}
                  onChange={(e) => {
                    setCommissionTouched(true);
                    setCommissionIncrement(e.target.value);
                  }}
                  placeholder={
                    commissionFloor > 0
                      ? `Adds to ${fmt(commissionFloor)} already recorded`
                      : "0 if not yet received"
                  }
                />
                <Select
                  label="Commission payment method"
                  options={[
                    { value: "", label: "—" },
                    ...PAYMENT_MODE_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label,
                    })),
                  ]}
                  value={commissionPaymentMode}
                  onChange={(e) => {
                    setCommissionTouched(true);
                    setCommissionPaymentMode(e.target.value as PaymentMode | "");
                  }}
                />
              </>
            )}
            {!commissionSavedFullyPaid && (
              <>
                <Input
                  label="Next commission follow-up"
                  type="date"
                  value={commissionFollowUp}
                  onChange={(e) => {
                    setCommissionTouched(true);
                    setCommissionFollowUp(e.target.value);
                  }}
                />
                <p className="text-xs text-slate-muted">
                  Sets a task for the commission RM. SLA is 7 days from booking
                  {defaultSlaDate
                    ? ` (${new Date(defaultSlaDate).toLocaleDateString("en-IN")})`
                    : ""}
                  .
                </p>
              </>
            )}
            <p
              className={cn(
                "text-sm font-semibold",
                commOutstanding > 0 ? "text-amber-900" : "text-emerald-700"
              )}
            >
              Received {fmt(commPreview.commissionPaid ?? 0)}
              {commOutstanding > 0
                ? ` · Still due ${fmt(commOutstanding)}`
                : " · Commission closed"}
            </p>
          </section>
        )}

        <section className="space-y-3 rounded-lg border border-slate-200 p-4">
          {trackCommission ? (
            <>
              <button
                type="button"
                className="flex w-full items-center justify-between text-left"
                onClick={() => setBrideSectionOpen((o) => !o)}
              >
                <h3 className="text-sm font-medium text-slate-muted">
                  Bride payment notes (optional)
                </h3>
                <span className="text-xs text-slate-muted">
                  {brideSectionOpen ? "Hide" : "Show"}
                </span>
              </button>
              {!brideSectionOpen && (
                <p className="text-xs text-slate-muted">
                  Bride pays MUA directly — not tracked as Olready revenue.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-brand">
                  Bride payment (to MUA)
                </h3>
                {!dismissBridePayment && (
                  <Badge
                    variant={
                      brideStatus === "paid"
                        ? "success"
                        : brideStatus === "partial"
                          ? "hot"
                          : "muted"
                    }
                  >
                    {brideStatus === "paid"
                      ? "Paid"
                      : brideStatus === "partial"
                        ? "Partial"
                        : "Unpaid"}
                  </Badge>
                )}
                {dismissBridePayment && (
                  <Badge variant="muted">Not tracked</Badge>
                )}
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={dismissBridePayment}
                  onChange={(e) => setDismissBridePayment(e.target.checked)}
                />
                <span>
                  Not tracking bride–MUA payment — bride pays artist directly
                </span>
              </label>
              {dismissBridePayment && (
                <p className="text-xs text-slate-muted">
                  Olready will not flag pending bride payment on this booking.
                  Booking amount is still recorded.
                </p>
              )}
            </>
          )}

          {(!trackCommission || brideSectionOpen) && !dismissBridePayment && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {brideFloor > 0 && (
                  <p className="sm:col-span-2 text-xs text-slate-muted">
                    Bride payment already recorded:{" "}
                    <strong>{fmt(brideFloor)}</strong> (cannot reduce total)
                  </p>
                )}
                <Input
                  label="Advance (Rs.)"
                  type="number"
                  min={0}
                  value={advancePaid}
                  onChange={(e) => {
                    setBrideTouched(true);
                    setAdvancePaid(e.target.value);
                  }}
                  placeholder="Optional"
                />
                <Input
                  label="Balance (Rs.)"
                  type="number"
                  min={0}
                  value={fullPaid}
                  onChange={(e) => {
                    setBrideTouched(true);
                    setFullPaid(e.target.value);
                  }}
                  placeholder="Optional"
                />
                <Select
                  label="Payment mode"
                  options={[
                    { value: "", label: "—" },
                    ...PAYMENT_MODE_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label,
                    })),
                  ]}
                  value={paymentMode}
                  onChange={(e) => {
                    setBrideTouched(true);
                    setPaymentMode(e.target.value as PaymentMode | "");
                  }}
                />
                <Input
                  label="Zoho ref (optional)"
                  value={zohoInvoiceRef}
                  onChange={(e) => {
                    setBrideTouched(true);
                    setZohoInvoiceRef(e.target.value);
                  }}
                />
              </div>

              <p className="text-sm text-slate-muted">
                Collected {fmt(bookingAmountPaid(bridePreview))}
                {brideOutstanding > 0
                  ? ` · Bride balance ${fmt(brideOutstanding)} (reference only)`
                  : ""}
              </p>
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
