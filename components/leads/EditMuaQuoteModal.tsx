"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { LeadEvent, MuaPushEventPrice, MuaPushWithDetails } from "@/lib/types";

interface EditMuaQuoteModalProps {
  push: MuaPushWithDetails;
  events: LeadEvent[];
  pushEventPrices: MuaPushEventPrice[];
  onClose: () => void;
  onSaved: () => void;
}

export function EditMuaQuoteModal({
  push,
  events,
  pushEventPrices,
  onClose,
  onSaved,
}: EditMuaQuoteModalProps) {
  const pricedEvents = useMemo(() => {
    const ids = new Set(push.eventIds ?? []);
    return events.filter((e) => ids.has(e.id));
  }, [events, push.eventIds]);

  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const ev of pricedEvents) {
      const pep = pushEventPrices.find(
        (p) => p.pushId === push.id && p.eventId === ev.id
      );
      initial[ev.id] =
        pep != null ? String(pep.quotedPrice) : "";
    }
    setPrices(initial);
  }, [pricedEvents, push.id, pushEventPrices]);

  const total = useMemo(
    () =>
      pricedEvents.reduce((sum, ev) => {
        const n = Number(prices[ev.id]);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0),
    [pricedEvents, prices]
  );

  async function save() {
    setError(null);
    const payload: Record<string, number> = {};
    for (const ev of pricedEvents) {
      const n = Number(prices[ev.id]);
      if (!Number.isFinite(n) || n < 0) {
        setError(`Enter a valid quote for ${ev.ceremonyType}`);
        return;
      }
      payload[ev.id] = n;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/pushes/${push.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices: payload }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not save quote");
        return;
      }
      onSaved();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit quote — ${push.muaName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy || pricedEvents.length === 0}>
            Save quote
          </Button>
        </>
      }
    >
      {pricedEvents.length === 0 ? (
        <p className="text-sm text-slate-muted">No events linked to this push.</p>
      ) : (
        <div className="space-y-3">
          {pricedEvents.map((ev) => (
            <Input
              key={ev.id}
              label={ev.ceremonyType}
              type="number"
              min={0}
              value={prices[ev.id] ?? ""}
              onChange={(e) =>
                setPrices((prev) => ({ ...prev, [ev.id]: e.target.value }))
              }
            />
          ))}
          <p className="border-t border-slate-100 pt-2 text-sm font-medium text-brand">
            Total: Rs. {total.toLocaleString("en-IN")}
          </p>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
