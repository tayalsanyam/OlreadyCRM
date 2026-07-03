"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  bookingAmountPaid,
  bookingOutstanding,
  bookingPaymentStatus,
  PAYMENT_MODE_OPTIONS,
} from "@/lib/booking-payment";
import {
  commissionCollectionStage,
  commissionOutstanding,
  COMMISSION_COLLECTION_STAGE_LABELS,
  commissionPaymentStatus,
} from "@/lib/commission-booking";
import type { BookingFinancialUpdateInput } from "@/lib/booking-financial-update";
import type { TaskFinancialBookingSnapshot } from "@/lib/task-financial-bookings";
import type { PaymentMode, Task } from "@/lib/types";
import { cn } from "@/lib/utils";

function parseAmount(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export type TaskFinancialBookingUpdate = BookingFinancialUpdateInput & {
  bookingId: string;
};

type BookingFormState = {
  brideCollected: string;
  paymentMode: PaymentMode | "";
  zohoInvoiceRef: string;
  commissionAmount: string;
  commissionPaid: string;
  dismissBridePayment: boolean;
  showBrideSection: boolean;
};

function emptyForm(b: TaskFinancialBookingSnapshot): BookingFormState {
  const collected = bookingAmountPaid({
    advancePaid: b.advancePaid,
    fullPaid: b.fullPaid,
  });
  return {
    brideCollected: collected > 0 ? String(collected) : "",
    paymentMode: (b.paymentMode as PaymentMode | null) ?? "",
    zohoInvoiceRef: b.zohoInvoiceRef ?? "",
    commissionAmount:
      b.commissionAmount != null ? String(b.commissionAmount) : "",
    commissionPaid:
      b.commissionPaid != null ? String(b.commissionPaid) : "",
    dismissBridePayment: b.bridePaymentDismissed,
    showBrideSection:
      !b.bridePaymentDismissed &&
      (b.brideStatus !== "paid" || b.brideCollected > 0),
  };
}

function fmt(n: number) {
  return n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

export function FinancialFollowUpFields({
  task,
  onChange,
  onValidChange,
}: {
  task: Task;
  onChange: (updates: TaskFinancialBookingUpdate[]) => void;
  onValidChange: (valid: boolean) => void;
}) {
  const [bookings, setBookings] = useState<TaskFinancialBookingSnapshot[]>([]);
  const [forms, setForms] = useState<Record<string, BookingFormState>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void fetch(`/api/tasks/${task.id}/financial-bookings`)
      .then(async (res) => {
        const json = (await res.json()) as {
          data: { bookings: TaskFinancialBookingSnapshot[] } | null;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Could not load bookings");
        if (cancelled) return;
        const rows = json.data?.bookings ?? [];
        setBookings(rows);
        const next: Record<string, BookingFormState> = {};
        for (const b of rows) next[b.id] = emptyForm(b);
        setForms(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Load failed");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  const updates = useMemo(() => {
    const out: TaskFinancialBookingUpdate[] = [];
    for (const b of bookings) {
      const f = forms[b.id];
      if (!f) continue;
      const brideAmount = parseAmount(f.brideCollected);
      const commDue = parseAmount(f.commissionAmount);
      const commPaid = parseAmount(f.commissionPaid);
      const update: TaskFinancialBookingUpdate = { bookingId: b.id };
      if (f.showBrideSection && !f.dismissBridePayment && brideAmount !== null) {
        update.advancePaid = brideAmount;
        update.fullPaid = null;
      }
      if (f.paymentMode) update.paymentMode = f.paymentMode;
      if (f.zohoInvoiceRef.trim()) {
        update.zohoInvoiceRef = f.zohoInvoiceRef.trim();
      }
      if (b.trackCommission) {
        if (b.commissionAmount == null && f.commissionAmount.trim()) {
          update.commissionAmount = commDue;
        }
        if (f.commissionPaid.trim()) {
          update.commissionPaid = commPaid ?? 0;
        }
      }
      if (f.dismissBridePayment) update.dismissBridePayment = true;
      out.push(update);
    }
    return out;
  }, [bookings, forms]);

  const validationError = useMemo(() => {
    for (const b of bookings) {
      const f = forms[b.id];
      if (!f) continue;
      const brideAmount = parseAmount(f.brideCollected);
      if (
        f.showBrideSection &&
        !f.dismissBridePayment &&
        f.brideCollected.trim() &&
        brideAmount === null
      ) {
        return "Enter a valid bride payment amount";
      }
      if (
        f.showBrideSection &&
        !f.dismissBridePayment &&
        brideAmount != null &&
        brideAmount < b.brideCollected
      ) {
        return "Recorded bride payment cannot be reduced";
      }
      if (
        f.showBrideSection &&
        !f.dismissBridePayment &&
        brideAmount != null &&
        brideAmount > b.bookedPrice
      ) {
        return "Bride payment cannot exceed booked price";
      }
      if (
        b.trackCommission &&
        b.commissionAmount == null &&
        f.commissionPaid.trim() &&
        !f.commissionAmount.trim()
      ) {
        return `Enter commission due for ${b.ceremonyType}`;
      }
      if (b.trackCommission && f.commissionPaid.trim()) {
        const paid = parseAmount(f.commissionPaid);
        const due =
          parseAmount(f.commissionAmount) ?? b.commissionAmount ?? 0;
        const floor = b.commissionPaid ?? 0;
        if (paid === null) return "Enter a valid commission received amount";
        if (paid < floor) return "Commission received cannot be reduced";
        if (due > 0 && paid > due) {
          return "Commission received cannot exceed commission due";
        }
      }
      if (f.dismissBridePayment) {
        const due =
          parseAmount(f.commissionAmount) ?? b.commissionAmount ?? 0;
        const paid =
          parseAmount(f.commissionPaid) ?? b.commissionPaid ?? 0;
        const cleared = due <= 0 || paid >= due;
        if (!cleared) {
          return "Clear Olready commission before closing bride payment tracking";
        }
      }
    }
    return null;
  }, [bookings, forms]);

  useEffect(() => {
    onChange(updates);
    onValidChange(!validationError);
  }, [updates, validationError, onChange, onValidChange]);

  function patchForm(bookingId: string, patch: Partial<BookingFormState>) {
    setForms((prev) => ({
      ...prev,
      [bookingId]: { ...prev[bookingId]!, ...patch },
    }));
  }

  if (loading) {
    return <p className="mb-4 text-sm text-slate-muted">Loading booking details…</p>;
  }
  if (loadError) {
    return <p className="mb-4 text-sm text-red-600">{loadError}</p>;
  }
  if (!bookings.length) {
    return (
      <p className="mb-4 text-sm text-amber-800">
        No active bookings found for this task.
      </p>
    );
  }

  return (
    <div className="mb-4 space-y-4">
      <p className="text-sm text-slate-muted">
        Record Olready commission first. Bride–MUA payment is optional unless you
        need it for reconciliation.
      </p>
      {bookings.map((b) => {
        const f = forms[b.id];
        if (!f) return null;
        const commDuePreview =
          parseAmount(f.commissionAmount) ?? b.commissionAmount ?? 0;
        const commPaidPreview =
          parseAmount(f.commissionPaid) ?? b.commissionPaid ?? 0;
        const commStage = b.trackCommission
          ? commissionCollectionStage({
              commissionAmount: commDuePreview,
              commissionPaid: commPaidPreview,
              bookingDate: b.bookingDate,
            })
          : "paid";
        const commOutstandingPreview = b.trackCommission
          ? commissionOutstanding({
              commissionAmount: commDuePreview,
              commissionPaid: commPaidPreview,
            })
          : 0;
        const commissionCleared =
          !b.trackCommission ||
          commissionPaymentStatus({
            commissionAmount: commDuePreview,
            commissionPaid: commPaidPreview,
          }) === "paid";
        const bridePreview = {
          bookedPrice: b.bookedPrice,
          advancePaid: f.dismissBridePayment
            ? b.advancePaid
            : parseAmount(f.brideCollected),
          fullPaid: f.dismissBridePayment ? b.fullPaid : null,
        };

        const commissionFloor = b.commissionPaid ?? 0;
        const brideFloor = b.brideCollected;
        const commissionFullyPaid =
          b.trackCommission &&
          (b.commissionAmount ?? 0) > 0 &&
          commOutstandingPreview === 0;
        const brideFullyPaidByAmount =
          !f.dismissBridePayment &&
          bookingPaymentStatus(bridePreview) === "paid";

        return (
          <div
            key={b.id}
            className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
          >
            <div>
              <p className="font-medium text-brand">
                {b.ceremonyType} · {b.muaName}
              </p>
              <p className="text-xs text-slate-muted">
                Booked {fmt(b.bookedPrice)}
              </p>
            </div>

            {b.trackCommission && (
              <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-brand">
                    Olready commission from MUA
                  </h4>
                  <Badge
                    variant={
                      commStage === "paid"
                        ? "success"
                        : commStage === "overdue" || commStage === "sla_due"
                          ? "hot"
                          : "muted"
                    }
                  >
                    {COMMISSION_COLLECTION_STAGE_LABELS[commStage]}
                  </Badge>
                </div>
                {b.commissionAmount == null ? (
                  <Input
                    label="Commission due (Rs.) *"
                    type="number"
                    min={0}
                    value={f.commissionAmount}
                    onChange={(e) =>
                      patchForm(b.id, { commissionAmount: e.target.value })
                    }
                  />
                ) : (
                  <p className="text-xs text-slate-muted">
                    Due: <strong>{fmt(b.commissionAmount)}</strong>
                  </p>
                )}
                {commissionFloor > 0 && (
                  <p className="text-xs text-slate-muted">
                    Already recorded: <strong>{fmt(commissionFloor)}</strong>{" "}
                    (cannot reduce)
                  </p>
                )}
                {commissionFullyPaid ? (
                  <p className="text-sm font-medium text-emerald-700">
                    Commission fully received — {fmt(commissionFloor)}
                  </p>
                ) : (
                  <Input
                    label={
                      commissionFloor > 0
                        ? "Total commission received (Rs.)"
                        : "Commission received (Rs.)"
                    }
                    type="number"
                    min={commissionFloor}
                    value={f.commissionPaid}
                    onChange={(e) => {
                      const raw = parseAmount(e.target.value);
                      patchForm(b.id, {
                        commissionPaid:
                          raw != null && raw < commissionFloor
                            ? String(commissionFloor)
                            : e.target.value,
                      });
                    }}
                    placeholder={
                      commissionFloor > 0
                        ? `Min ${fmt(commissionFloor)}`
                        : "0 if not yet received"
                    }
                  />
                )}
                <Input
                  label="Accounting ref (Zoho / receipt)"
                  value={f.zohoInvoiceRef}
                  onChange={(e) =>
                    patchForm(b.id, { zohoInvoiceRef: e.target.value })
                  }
                  placeholder="Optional"
                />
                <p
                  className={cn(
                    "text-xs",
                    commOutstandingPreview > 0
                      ? "text-amber-800"
                      : "text-emerald-700"
                  )}
                >
                  Received {fmt(commPaidPreview)}
                  {commOutstandingPreview > 0
                    ? ` · Still due ${fmt(commOutstandingPreview)}`
                    : " · Commission closed"}
                </p>
              </section>
            )}

            <section className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-medium text-slate-700">
                  Bride payment to MUA (optional)
                </h4>
                {!f.dismissBridePayment && (
                  <button
                    type="button"
                    className="text-xs text-brand underline"
                    onClick={() =>
                      patchForm(b.id, {
                        showBrideSection: !f.showBrideSection,
                      })
                    }
                  >
                    {f.showBrideSection ? "Hide" : "Record bride payment"}
                  </button>
                )}
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={f.dismissBridePayment}
                  disabled={!commissionCleared}
                  onChange={(e) =>
                    patchForm(b.id, {
                      dismissBridePayment: e.target.checked,
                      showBrideSection: e.target.checked ? false : f.showBrideSection,
                    })
                  }
                />
                <span className={commissionCleared ? "text-text" : "text-slate-muted"}>
                  Not tracking bride–MUA payment
                  {commissionCleared
                    ? " — close once Olready commission is received or not applicable"
                    : " — available after commission is cleared"}
                </span>
              </label>

              {f.showBrideSection && !f.dismissBridePayment && (
                <>
                  {brideFloor > 0 && (
                    <p className="text-xs text-slate-muted">
                      Already recorded: <strong>{fmt(brideFloor)}</strong>{" "}
                      (cannot reduce)
                    </p>
                  )}
                  {brideFullyPaidByAmount ? (
                    <p className="text-sm font-medium text-emerald-700">
                      Bride payment recorded — {fmt(brideFloor)}
                    </p>
                  ) : (
                    <Input
                      label={`Amount bride paid MUA (Rs.) — booked ${fmt(b.bookedPrice)}`}
                      type="number"
                      min={brideFloor}
                      value={f.brideCollected}
                      onChange={(e) => {
                        const raw = parseAmount(e.target.value);
                        patchForm(b.id, {
                          brideCollected:
                            raw != null && raw < brideFloor
                              ? String(brideFloor)
                              : e.target.value,
                        });
                      }}
                      placeholder={
                        brideFloor > 0 ? `Min ${fmt(brideFloor)}` : "Optional"
                      }
                    />
                  )}
                  <Select
                    label="Payment mode"
                    options={[
                      { value: "", label: "—" },
                      ...PAYMENT_MODE_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.label,
                      })),
                    ]}
                    value={f.paymentMode}
                    onChange={(e) =>
                      patchForm(b.id, {
                        paymentMode: e.target.value as PaymentMode | "",
                      })
                    }
                  />
                  <p className="text-xs text-slate-muted">
                    {bookingPaymentStatus(bridePreview) === "paid"
                      ? `Collected ${fmt(bookingAmountPaid(bridePreview))} · Closed`
                      : `Collected ${fmt(bookingAmountPaid(bridePreview))} · Outstanding ${fmt(bookingOutstanding(bridePreview))}`}
                  </p>
                </>
              )}
            </section>
          </div>
        );
      })}
      {validationError && (
        <p className="text-xs text-red-600">{validationError}</p>
      )}
    </div>
  );
}
