"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  bookingAmountPaid,
  bookingOutstanding,
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
import type { Booking, LeadEvent, MuaPushWithDetails, PaymentMode } from "@/lib/types";
import { cn } from "@/lib/utils";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function asAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

type BrideDraft = {
  advancePaid: string;
  fullPaid: string;
  paymentMode: PaymentMode | "";
  zohoInvoiceRef: string;
};

type CommissionDraft = {
  commissionAmount: string;
  commissionIncrement: string;
  commissionPaymentMode: PaymentMode | "";
  commissionFollowUp: string;
};

function brideDraftFromBooking(b: Booking): BrideDraft {
  return {
    advancePaid: b.advancePaid != null ? String(b.advancePaid) : "",
    fullPaid: b.fullPaid != null ? String(b.fullPaid) : "",
    paymentMode: b.paymentMode ?? "",
    zohoInvoiceRef: b.zohoInvoiceRef ?? "",
  };
}

function commissionDraftFromBooking(b: Booking): CommissionDraft {
  return {
    commissionAmount:
      b.commissionAmount != null ? String(b.commissionAmount) : "",
    commissionIncrement: "",
    commissionPaymentMode: b.commissionPaymentMode ?? "",
    commissionFollowUp: b.commissionNextFollowUpAt?.slice(0, 10) ?? "",
  };
}

function parseAmount(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function showsCommissionForBooking(b: Booking, trackCommission: boolean): boolean {
  return bookingShowsCommission({
    trackCommission,
    commissionAmount: asAmount(b.commissionAmount),
    commissionPaid: asAmount(b.commissionPaid),
  });
}

interface LeadBookingsPanelProps {
  bookings: Booking[];
  events: LeadEvent[];
  pushes: MuaPushWithDetails[];
  trackCommission?: boolean;
  onUpdated: () => void;
}

export function LeadBookingsPanel({
  bookings,
  events,
  pushes,
  trackCommission = false,
  onUpdated,
}: LeadBookingsPanelProps) {
  const { toast } = useToast();
  const active = useMemo(
    () => bookings.filter((b) => !b.cancelled),
    [bookings],
  );

  const [brideDrafts, setBrideDrafts] = useState<Record<string, BrideDraft>>({});
  const [commissionDrafts, setCommissionDrafts] = useState<
    Record<string, CommissionDraft>
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [brideDetailsOpen, setBrideDetailsOpen] = useState<Record<string, boolean>>(
    {},
  );

  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const bride: Record<string, BrideDraft> = {};
    const commission: Record<string, CommissionDraft> = {};
    for (const b of active) {
      if (!editingIds.has(b.id)) {
        bride[b.id] = brideDraftFromBooking(b);
        commission[b.id] = commissionDraftFromBooking(b);
      }
    }
    setBrideDrafts((prev) => ({ ...prev, ...bride }));
    setCommissionDrafts((prev) => ({ ...prev, ...commission }));
  }, [bookings, active, editingIds]);

  const pendingCommissionTotal = useMemo(() => {
    let total = 0;
    for (const b of active) {
      if (!showsCommissionForBooking(b, trackCommission)) continue;
      total += commissionOutstanding({
        commissionAmount: asAmount(b.commissionAmount),
        commissionPaid: asAmount(b.commissionPaid),
      });
    }
    return total;
  }, [active, trackCommission]);

  const overdueCount = useMemo(() => {
    return active.filter((b) => {
      if (!showsCommissionForBooking(b, trackCommission)) return false;
      return (
        commissionCollectionStage({
          commissionAmount: asAmount(b.commissionAmount),
          commissionPaid: asAmount(b.commissionPaid),
          bookingDate: b.bookingDate,
        }) === "overdue"
      );
    }).length;
  }, [active, trackCommission]);

  if (active.length === 0) return null;

  const muaName = (muaId: string) =>
    pushes.find((p) => p.muaId === muaId)?.muaName ?? "MUA";

  async function saveCommission(booking: Booking) {
    const draft = commissionDrafts[booking.id];
    if (!draft) return;

    const due = parseAmount(draft.commissionAmount);
    const increment = parseAmount(draft.commissionIncrement);
    const floor = asAmount(booking.commissionPaid) ?? 0;
    const savedFullyPaid =
      commissionPaymentStatus({
        commissionAmount: booking.commissionAmount,
        commissionPaid: booking.commissionPaid,
      }) === "paid";

    if (!booking.commissionAmount && !draft.commissionAmount.trim()) {
      toast("Enter commission due from MUA", "error");
      return;
    }
    if (draft.commissionAmount.trim() && due === null) {
      toast("Enter a valid commission due amount", "error");
      return;
    }
    if (draft.commissionIncrement.trim() && increment === null) {
      toast("Enter a valid commission received amount", "error");
      return;
    }
    if (!savedFullyPaid && !draft.commissionIncrement.trim()) {
      toast("Enter the commission amount received in this payment", "error");
      return;
    }
    const paidVal = floor + (increment ?? 0);
    if (paidVal < floor) {
      toast("Commission received cannot be reduced", "error");
      return;
    }
    const dueVal = due ?? asAmount(booking.commissionAmount) ?? 0;
    if (dueVal > 0 && paidVal > dueVal) {
      toast("Commission received cannot exceed commission due", "error");
      return;
    }

    setSavingId(booking.id);
    const body: Record<string, unknown> = {
      commissionNextFollowUpAt: draft.commissionFollowUp.trim() || null,
    };
    if (due !== null) body.commissionAmount = due;
    if (increment !== null) body.commissionPaid = paidVal;
    if (draft.commissionPaymentMode) {
      body.commissionPaymentMode = draft.commissionPaymentMode;
    }

    const res = await fetch(`/api/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { error?: string };
    setSavingId(null);
    setEditingIds((prev) => {
      const next = new Set(prev);
      next.delete(booking.id);
      return next;
    });
    if (!res.ok) {
      toast(json.error ?? "Could not save commission", "error");
      return;
    }
    toast("Commission updated");
    onUpdated();
  }

  async function saveBridePayment(booking: Booking) {
    const draft = brideDrafts[booking.id];
    if (!draft) return;

    const advancePaid = parseAmount(draft.advancePaid);
    const fullPaid = parseAmount(draft.fullPaid);
    if (draft.advancePaid.trim() && advancePaid === null) {
      toast("Enter a valid advance amount", "error");
      return;
    }
    if (draft.fullPaid.trim() && fullPaid === null) {
      toast("Enter a valid balance amount", "error");
      return;
    }

    const paid = (advancePaid ?? 0) + (fullPaid ?? 0);
    const booked = asAmount(booking.bookedPrice) ?? 0;
    if (paid > booked) {
      toast("Advance + balance cannot exceed booked price", "error");
      return;
    }

    setSavingId(booking.id);
    const res = await fetch(`/api/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        advancePaid,
        fullPaid,
        paymentMode: draft.paymentMode || null,
        zohoInvoiceRef: draft.zohoInvoiceRef.trim() || null,
      }),
    });
    const json = (await res.json()) as { error?: string };
    setSavingId(null);
    setEditingIds((prev) => {
      const next = new Set(prev);
      next.delete(booking.id);
      return next;
    });
    if (!res.ok) {
      toast(json.error ?? "Could not save payment", "error");
      return;
    }
    toast("Bride payment note saved");
    onUpdated();
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="text-lg font-semibold text-brand">Bookings</h2>
        <p className="text-sm text-slate-muted">
          {trackCommission
            ? "Olready tracks booking value and commission from the MUA. Bride pays the artist directly."
            : "Confirmed ceremonies — booking amount and commission collection."}
        </p>
      </div>

      {pendingCommissionTotal > 0 && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3",
            overdueCount > 0
              ? "border-red-300 bg-red-50"
              : "border-amber-300 bg-amber-50",
          )}
        >
          <p
            className={cn(
              "text-sm font-semibold",
              overdueCount > 0 ? "text-red-900" : "text-amber-900",
            )}
          >
            Commission still due: {inr.format(pendingCommissionTotal)}
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            {overdueCount > 0
              ? `${overdueCount} booking${overdueCount === 1 ? "" : "s"} overdue (30+ days) — follow up with MUA`
              : "Record commission received below as MUA pays Olready"}
          </p>
        </div>
      )}

      <div className="space-y-4">
        {active.map((b) => {
          const ev = events.find((e) => e.id === b.eventId);
          const bookedPrice = asAmount(b.bookedPrice) ?? 0;
          const showsCommission = showsCommissionForBooking(b, trackCommission);
          const commDraft = commissionDrafts[b.id] ?? commissionDraftFromBooking(b);
          const brideDraft = brideDrafts[b.id] ?? brideDraftFromBooking(b);

          const commDue =
            parseAmount(commDraft.commissionAmount) ??
            asAmount(b.commissionAmount);
          const incrementPreview = parseAmount(commDraft.commissionIncrement) ?? 0;
          const commPaid =
            (asAmount(b.commissionPaid) ?? 0) + incrementPreview;
          const commissionSavedFullyPaid =
            commissionPaymentStatus({
              commissionAmount: b.commissionAmount,
              commissionPaid: b.commissionPaid,
            }) === "paid";
          const commPreview = {
            commissionAmount: commDue,
            commissionPaid: commPaid,
            bookingDate: b.bookingDate,
          };
          const commStage = showsCommission
            ? commissionCollectionStage({
                commissionAmount: b.commissionAmount,
                commissionPaid: b.commissionPaid,
                bookingDate: b.bookingDate,
              })
            : "paid";
          const commDueAmount = commissionOutstanding(commPreview);
          const slaDate = commissionSlaDueDate(b.bookingDate);

          const bridePreview = {
            bookedPrice,
            advancePaid: parseAmount(brideDraft.advancePaid),
            fullPaid: parseAmount(brideDraft.fullPaid),
          };
          const brideOutstanding = bookingOutstanding(bridePreview);

          return (
            <div
              key={b.id}
              className={cn(
                "rounded-lg border p-4 space-y-3",
                showsCommission && commDueAmount > 0
                  ? "border-amber-200 bg-amber-50/40"
                  : "border-slate-200 bg-slate-50/50",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-brand">
                    {ev?.ceremonyType ?? "Ceremony"}
                    {ev?.eventDate ? (
                      <span className="ml-2 text-sm font-normal text-slate-muted">
                        {ev.eventDate.slice(0, 10)}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-slate-muted">{muaName(b.muaId)}</p>
                  <p className="mt-1 text-sm font-semibold text-brand">
                    Booking amount: {inr.format(bookedPrice)}
                  </p>
                </div>
                {showsCommission && (
                  <Badge
                    variant={
                      commStage === "paid"
                        ? "success"
                        : commStage === "overdue" || commStage === "sla_due"
                          ? "hot"
                          : commDueAmount > 0
                            ? "hot"
                            : "muted"
                    }
                  >
                    {commStage === "partial"
                      ? `Commission partial · ${inr.format(commDueAmount)} due`
                      : commStage === "paid"
                        ? "Commission received"
                        : `${COMMISSION_COLLECTION_STAGE_LABELS[commStage]} · ${inr.format(commDueAmount)}`}
                  </Badge>
                )}
              </div>

              {showsCommission && (
                <div className="space-y-3 rounded-lg border border-violet-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-900">
                    Olready commission from MUA
                  </p>
                  {slaDate && commStage !== "paid" && (
                    <p className="text-xs text-slate-muted">
                      SLA due{" "}
                      {new Date(slaDate).toLocaleDateString("en-IN")}
                      {" · "}
                      overdue after 30 days from booking
                    </p>
                  )}
                  {b.commissionAmount == null && (
                    <Input
                      label="Commission due (Rs.) *"
                      type="number"
                      min={0}
                      value={commDraft.commissionAmount}
                      onChange={(e) =>
                        setCommissionDrafts((prev) => ({
                          ...prev,
                          [b.id]: {
                            ...commDraft,
                            commissionAmount: e.target.value,
                          },
                        }))
                      }
                    />
                  )}
                  {b.commissionAmount != null && (
                    <p className="text-sm text-slate-700">
                      Due: <strong>{inr.format(commDue ?? 0)}</strong>
                      {" · "}
                      Received:{" "}
                      <strong className="text-emerald-700">
                        {inr.format(commPaid)}
                      </strong>
                      {commDueAmount > 0 && (
                        <>
                          {" · "}
                          <span className="font-semibold text-amber-800">
                            Still due {inr.format(commDueAmount)}
                          </span>
                        </>
                      )}
                    </p>
                  )}
                  {commissionSavedFullyPaid ? (
                    <p className="text-sm font-medium text-emerald-700">
                      Commission fully received —{" "}
                      {inr.format(asAmount(b.commissionPaid) ?? 0)}
                    </p>
                  ) : (
                    <>
                      <Input
                        label={
                          (asAmount(b.commissionPaid) ?? 0) > 0
                            ? "Additional commission received now (Rs.)"
                            : "Commission received (Rs.)"
                        }
                        type="number"
                        min={0}
                        value={commDraft.commissionIncrement}
                        onChange={(e) => {
                          setEditingIds((prev) => new Set(prev).add(b.id));
                          setCommissionDrafts((prev) => ({
                            ...prev,
                            [b.id]: {
                              ...commDraft,
                              commissionIncrement: e.target.value,
                            },
                          }));
                        }}
                        placeholder="0 if not yet received"
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
                        value={commDraft.commissionPaymentMode}
                        onChange={(e) => {
                          setEditingIds((prev) => new Set(prev).add(b.id));
                          setCommissionDrafts((prev) => ({
                            ...prev,
                            [b.id]: {
                              ...commDraft,
                              commissionPaymentMode: e.target.value as
                                | PaymentMode
                                | "",
                            },
                          }));
                        }}
                      />
                    </>
                  )}
                  {!commissionSavedFullyPaid && (
                    <Input
                      label="Next commission follow-up"
                      type="date"
                      value={commDraft.commissionFollowUp}
                      onChange={(e) => {
                        setEditingIds((prev) => new Set(prev).add(b.id));
                        setCommissionDrafts((prev) => ({
                          ...prev,
                          [b.id]: {
                            ...commDraft,
                            commissionFollowUp: e.target.value,
                          },
                        }));
                      }}
                    />
                  )}
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={savingId === b.id}
                      onClick={() => void saveCommission(b)}
                    >
                      {savingId === b.id ? "Saving…" : "Save commission"}
                    </Button>
                  </div>
                </div>
              )}

              {!trackCommission && (
                <div className="border-t border-slate-200 pt-2">
                  <button
                    type="button"
                    className="text-xs font-medium text-slate-muted hover:text-brand"
                    onClick={() =>
                      setBrideDetailsOpen((prev) => ({
                        ...prev,
                        [b.id]: !prev[b.id],
                      }))
                    }
                  >
                    {brideDetailsOpen[b.id] ? "Hide" : "Show"} bride payment
                    notes (optional)
                  </button>
                  {brideDetailsOpen[b.id] && (
                    <div className="mt-3 space-y-3">
                      <p className="text-xs text-slate-muted">
                        Bride pays MUA directly — for your notes only.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Input
                          label="Advance (Rs.)"
                          type="number"
                          min={0}
                          value={brideDraft.advancePaid}
                          onChange={(e) =>
                            setBrideDrafts((prev) => ({
                              ...prev,
                              [b.id]: {
                                ...brideDraft,
                                advancePaid: e.target.value,
                              },
                            }))
                          }
                        />
                        <Input
                          label="Balance (Rs.)"
                          type="number"
                          min={0}
                          value={brideDraft.fullPaid}
                          onChange={(e) =>
                            setBrideDrafts((prev) => ({
                              ...prev,
                              [b.id]: { ...brideDraft, fullPaid: e.target.value },
                            }))
                          }
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
                          value={brideDraft.paymentMode}
                          onChange={(e) =>
                            setBrideDrafts((prev) => ({
                              ...prev,
                              [b.id]: {
                                ...brideDraft,
                                paymentMode: e.target.value as PaymentMode | "",
                              },
                            }))
                          }
                        />
                        <Input
                          label="Zoho ref"
                          value={brideDraft.zohoInvoiceRef}
                          onChange={(e) =>
                            setBrideDrafts((prev) => ({
                              ...prev,
                              [b.id]: {
                                ...brideDraft,
                                zohoInvoiceRef: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <p className="text-xs text-slate-muted">
                        Collected {inr.format(bookingAmountPaid(bridePreview))}
                        {brideOutstanding > 0
                          ? ` · Bride balance ${inr.format(brideOutstanding)} (not Olready revenue)`
                          : ""}
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={savingId === b.id}
                        onClick={() => void saveBridePayment(b)}
                      >
                        Save bride payment note
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
