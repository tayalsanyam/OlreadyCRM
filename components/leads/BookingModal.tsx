"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import type {
  Booking,
  LeadEvent,
  MuaPushEventPrice,
  MuaPushWithDetails,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type BookMode = "single" | "all";

interface BookingModalProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  events: LeadEvent[];
  pushes: MuaPushWithDetails[];
  pushEventPrices?: MuaPushEventPrice[];
  bookings?: Booking[];
  onBooked: () => void;
  /** When true, Olready commission from MUA is required (shifted / commission queue leads). */
  requireCommission?: boolean;
  commissionAgreed?: number | null;
  commissionOffered?: number | null;
}

type EventPriceRow = {
  eventId: string;
  label: string;
  price: string;
  commissionAmount: string;
  commissionPaid: string;
};

export function BookingModal({
  open,
  onClose,
  leadId,
  events,
  pushes,
  pushEventPrices = [],
  bookings = [],
  onBooked,
  requireCommission = false,
  commissionAgreed,
  commissionOffered,
}: BookingModalProps) {
  const bookedEventIds = useMemo(
    () =>
      new Set(bookings.filter((b) => !b.cancelled).map((b) => b.eventId)),
    [bookings]
  );

  const openEvents = useMemo(
    () =>
      events.filter(
        (e) => e.status === "open" && !bookedEventIds.has(e.id)
      ),
    [events, bookedEventIds]
  );

  const openEventIds = useMemo(
    () => openEvents.map((e) => e.id),
    [openEvents]
  );

  const [bookMode, setBookMode] = useState<BookMode>("single");
  const [eventId, setEventId] = useState("");
  const [pushId, setPushId] = useState("");
  const [price, setPrice] = useState("");
  const [eventPrices, setEventPrices] = useState<EventPriceRow[]>([]);
  const [advancePaid, setAdvancePaid] = useState("");
  const [fullPaid, setFullPaid] = useState("");
  const [zohoRef, setZohoRef] = useState("");
  const [commissionAmount, setCommissionAmount] = useState("");
  const [commissionPaid, setCommissionPaid] = useState("");
  const [commissionReceivedNow, setCommissionReceivedNow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePushFilter = (p: MuaPushWithDetails, forEventIds: string[]) =>
    ["active", "awaitingClose"].includes(p.status) &&
    (forEventIds.length === 0 ||
      forEventIds.every((id) => p.eventIds?.includes(id)));

  const singleEventPushes = useMemo(
    () =>
      pushes.filter((p) => activePushFilter(p, eventId ? [eventId] : [])),
    [pushes, eventId]
  );

  const allEventsPushes = useMemo(
    () =>
      openEventIds.length > 0
        ? pushes.filter((p) => activePushFilter(p, openEventIds))
        : [],
    [pushes, openEventIds]
  );

  const visiblePushes =
    bookMode === "all" ? allEventsPushes : singleEventPushes;

  useEffect(() => {
    if (!open) return;
    setBookMode(openEvents.length > 1 ? "single" : "single");
    setEventId("");
    setPushId("");
    setPrice("");
    setEventPrices([]);
    setAdvancePaid("");
    setFullPaid("");
    setZohoRef("");
    setCommissionAmount("");
    setCommissionPaid("");
    setCommissionReceivedNow(false);
    setError(null);
  }, [open, openEvents.length]);

  useEffect(() => {
    if (bookMode !== "all" || !pushId) {
      setEventPrices([]);
      return;
    }
    setEventPrices(
      openEvents.map((e) => {
        const quoted = pushEventPrices.find(
          (pep) => pep.pushId === pushId && pep.eventId === e.id
        );
        return {
          eventId: e.id,
          label: e.eventDate
            ? `${e.ceremonyType} — ${e.eventDate.slice(0, 10)}`
            : e.ceremonyType,
          price: quoted ? String(quoted.quotedPrice) : "",
          commissionAmount: "",
          commissionPaid: "",
        };
      })
    );
  }, [bookMode, pushId, openEvents, pushEventPrices]);

  useEffect(() => {
    if (!commissionReceivedNow) {
      setCommissionPaid("");
      return;
    }
    if (commissionAmount.trim()) setCommissionPaid(commissionAmount);
  }, [commissionReceivedNow, commissionAmount]);

  function applyPushTotalToAllRows(total: number | null | undefined) {
    if (total == null || !openEvents.length) return;
    const per = Math.round(total / openEvents.length);
    setEventPrices((rows) =>
      rows.map((r, i) => ({
        ...r,
        price:
          i === openEvents.length - 1
            ? String(total - per * (openEvents.length - 1))
            : String(per),
      }))
    );
  }

  function parseCommissionPaid(amountRaw: string, paidRaw: string) {
    if (!requireCommission) return null;
    if (commissionReceivedNow && amountRaw.trim()) {
      return Number(amountRaw);
    }
    return paidRaw.trim() ? Number(paidRaw) : 0;
  }

  async function confirmSingle() {
    if (!eventId || !pushId || !price) return;
    if (requireCommission && !commissionAmount.trim()) {
      setError("Enter Olready commission from MUA");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/leads/${leadId}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        pushId,
        bookedPrice: Number(price),
        advancePaid: advancePaid ? Number(advancePaid) : null,
        fullPaid: fullPaid ? Number(fullPaid) : null,
        zohoInvoiceRef: zohoRef.trim() || null,
        commissionAmount: requireCommission ? Number(commissionAmount) : null,
        commissionPaid: parseCommissionPaid(commissionAmount, commissionPaid),
      }),
    });
    const json = (await res.json()) as { error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Booking failed");
      return;
    }
    onBooked();
    onClose();
  }

  async function confirmAll() {
    if (!pushId || eventPrices.some((r) => !r.price)) return;
    if (
      requireCommission &&
      eventPrices.some((r) => !r.commissionAmount.trim())
    ) {
      setError("Enter commission from MUA for each ceremony");
      return;
    }
    setLoading(true);
    setError(null);
    const items = eventPrices.map((r, index) => ({
      eventId: r.eventId,
      bookedPrice: Number(r.price),
      advancePaid:
        index === 0 && advancePaid ? Number(advancePaid) : null,
      fullPaid: index === 0 && fullPaid ? Number(fullPaid) : null,
      commissionAmount: requireCommission ? Number(r.commissionAmount) : null,
      commissionPaid: requireCommission
        ? r.commissionPaid.trim()
          ? Number(r.commissionPaid)
          : 0
        : null,
    }));
    const res = await fetch(`/api/leads/${leadId}/book-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pushId,
        items,
        zohoInvoiceRef: zohoRef.trim() || null,
      }),
    });
    const json = (await res.json()) as { error?: string; data?: { booked: number } };
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Booking failed");
      return;
    }
    onBooked();
    onClose();
  }

  const canConfirmSingle =
    !!eventId &&
    !!pushId &&
    !!price &&
    (!requireCommission || !!commissionAmount.trim()) &&
    !loading;
  const canConfirmAll =
    !!pushId &&
    eventPrices.length > 0 &&
    eventPrices.every((r) => r.price && Number(r.price) > 0) &&
    (!requireCommission ||
      eventPrices.every((r) => r.commissionAmount.trim())) &&
    !loading;

  const totalQuoted = eventPrices.reduce(
    (sum, r) => sum + (Number(r.price) || 0),
    0
  );

  if (openEvents.length === 0) {
    return (
      <Modal open={open} onClose={onClose} title="Confirm booking">
        <p className="text-sm text-slate-muted">
          All ceremonies are already booked or marked not needed.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirm booking"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={bookMode === "all" ? !canConfirmAll : !canConfirmSingle}
            onClick={() =>
              void (bookMode === "all" ? confirmAll() : confirmSingle())
            }
          >
            {loading
              ? "Saving…"
              : bookMode === "all"
                ? `Confirm ${openEvents.length} bookings`
                : "Confirm booking"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {requireCommission && (
          <p className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-brand">
            This lead is on the commission track — you must enter Olready&apos;s
            commission from the MUA for each ceremony you book.
          </p>
        )}
        {openEvents.length > 1 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-brand">What are you booking?</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["single", "One ceremony"],
                  ["all", `All open ceremonies (${openEvents.length})`],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setBookMode(mode);
                    setPushId("");
                    setEventId("");
                    setPrice("");
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    bookMode === mode
                      ? "border-accent bg-accent/10 text-brand font-medium"
                      : "border-slate-200 text-slate-muted"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {bookMode === "single" && (
          <Select
            label="Ceremony"
            options={[
              { value: "", label: "Select ceremony…" },
              ...openEvents.map((e) => ({
                value: e.id,
                label: e.eventDate
                  ? `${e.ceremonyType} — ${e.eventDate.slice(0, 10)}`
                  : e.ceremonyType,
              })),
            ]}
            value={eventId}
            onChange={(e) => {
              setEventId(e.target.value);
              setPushId("");
            }}
          />
        )}

        {bookMode === "all" && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-muted">
            Book every open ceremony with the same MUA. Only pushes that include{" "}
            <strong>all</strong> open ceremonies are listed below.
          </p>
        )}

        <Select
          label="Winning MUA push"
          options={[
            {
              value: "",
              label:
                bookMode === "all"
                  ? allEventsPushes.length
                    ? "Select MUA push…"
                    : "No push covers all open ceremonies"
                  : "Select MUA push…",
            },
            ...visiblePushes.map((p) => ({
              value: p.id,
              label: `${p.muaName} — Rs. ${p.quotedTotal?.toLocaleString("en-IN") ?? ""}${
                bookMode === "all" ? ` (${openEvents.length} ceremonies)` : ""
              }`,
            })),
          ]}
          value={pushId}
          onChange={(e) => {
            const next = e.target.value;
            setPushId(next);
            const p = visiblePushes.find((x) => x.id === next);
            if (bookMode === "single" && p?.quotedTotal) {
              setPrice(String(p.quotedTotal));
            }
            if (bookMode === "all" && p?.quotedTotal) {
              applyPushTotalToAllRows(p.quotedTotal);
            }
          }}
        />

        {bookMode === "all" && pushId && (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-muted">
              Price per ceremony
            </p>
            {eventPrices.map((row, index) => (
              <div
                key={row.eventId}
                className="space-y-2 rounded-lg border border-slate-100 bg-white p-2"
              >
                <div className="grid gap-2 sm:grid-cols-[1fr_140px] sm:items-end">
                  <span className="text-sm font-medium text-brand">{row.label}</span>
                  <Input
                    label={index === 0 ? "Booked (Rs.)" : undefined}
                    type="number"
                    value={row.price}
                    onChange={(e) =>
                      setEventPrices((prev) =>
                        prev.map((r) =>
                          r.eventId === row.eventId
                            ? { ...r, price: e.target.value }
                            : r
                        )
                      )
                    }
                    placeholder="Price"
                  />
                </div>
                {requireCommission && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      label="Commission from MUA (Rs.) *"
                      type="number"
                      min={0}
                      value={row.commissionAmount}
                      onChange={(e) =>
                        setEventPrices((prev) =>
                          prev.map((r) =>
                            r.eventId === row.eventId
                              ? { ...r, commissionAmount: e.target.value }
                              : r
                          )
                        )
                      }
                    />
                    <Input
                      label="Received now (Rs.)"
                      type="number"
                      min={0}
                      value={row.commissionPaid}
                      onChange={(e) =>
                        setEventPrices((prev) =>
                          prev.map((r) =>
                            r.eventId === row.eventId
                              ? { ...r, commissionPaid: e.target.value }
                              : r
                          )
                        )
                      }
                      placeholder="0 if pending"
                    />
                  </div>
                )}
              </div>
            ))}
            {totalQuoted > 0 && (
              <p className="text-right text-sm font-medium text-brand">
                Total Rs. {totalQuoted.toLocaleString("en-IN")}
              </p>
            )}
          </div>
        )}

        {bookMode === "single" && (
          <Input
            label="Booked price (Rs.)"
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Enter booked price"
          />
        )}

        {requireCommission && bookMode === "single" && (
          <div className="space-y-3 rounded-lg border-2 border-accent/40 bg-accent/5 p-3">
            <p className="text-sm font-semibold text-brand">
              Olready commission from MUA (required)
            </p>
            <p className="text-xs text-slate-muted">
              Enter what the MUA owes Olready for this booking — separate from bride
              payment below.
            </p>
            {(commissionAgreed != null || commissionOffered != null) && (
              <p className="text-xs text-slate-muted">
                Follow-up:{" "}
                {commissionAgreed != null
                  ? `agreed Rs. ${commissionAgreed.toLocaleString("en-IN")}`
                  : commissionOffered != null
                    ? `offered Rs. ${commissionOffered.toLocaleString("en-IN")}`
                    : ""}
                {" "}(per deal — enter actual amount below)
              </p>
            )}
            <Input
              label="Commission due (Rs.) *"
              type="number"
              min={0}
              required
              value={commissionAmount}
              onChange={(e) => setCommissionAmount(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm text-brand">
              <input
                type="checkbox"
                checked={commissionReceivedNow}
                onChange={(e) => setCommissionReceivedNow(e.target.checked)}
              />
              Full commission received from MUA now
            </label>
            {!commissionReceivedNow && (
              <Input
                label="Partial received now (Rs.)"
                type="number"
                min={0}
                value={commissionPaid}
                onChange={(e) => setCommissionPaid(e.target.value)}
                placeholder="0 if not yet received"
              />
            )}
          </div>
        )}

        <p className="text-xs font-medium text-slate-muted">Bride collection (optional)</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Advance paid (Rs.)"
            type="number"
            value={advancePaid}
            onChange={(e) => setAdvancePaid(e.target.value)}
            placeholder="Optional"
          />
          <Input
            label="Full payment (Rs.)"
            type="number"
            value={fullPaid}
            onChange={(e) => setFullPaid(e.target.value)}
            placeholder="Optional"
          />
        </div>
        {bookMode === "all" && (
          <p className="text-xs text-slate-muted">
            Advance and full payment are stored on the first ceremony&apos;s booking
            row.
          </p>
        )}
        <Input
          label="Zoho invoice reference"
          value={zohoRef}
          onChange={(e) => setZohoRef(e.target.value)}
          placeholder="INV-2026-001"
        />
        {bookMode === "all" && allEventsPushes.length === 0 && (
          <p className="text-xs text-amber-700">
            Push this MUA for all open ceremonies first (Push MUA → select every
            ceremony), or book one ceremony at a time.
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-xs text-slate-muted">
          Other active pushes for each booked ceremony are updated automatically;
          sibling ceremonies on the same push stay active until all are booked.
        </p>
      </div>
    </Modal>
  );
}
