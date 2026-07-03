"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import type {
  LeadEvent,
  MuaPushEventPrice,
  MuaPushWithDetails,
  PlanTier,
} from "@/lib/types";
import { PLAN_TIER_LABELS } from "@/lib/types";

const CEREMONY_ICON: Record<string, string> = {
  Haldi: "🌿",
  Mehndi: "💐",
  Wedding: "💍",
  Sangeet: "🎵",
  Reception: "🎊",
};

const PLAN_BADGE: Record<PlanTier, string> = {
  highestPrivy: "bg-amber-100 text-amber-900",
  phoenix2: "bg-indigo-100 text-indigo-900",
  phoenix: "bg-blue-100 text-blue-800",
  pro: "bg-slate-200 text-slate-800",
  prime: "bg-gray-100 text-gray-600",
};

const inrFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function asAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatRs(value: number | null | undefined): string {
  if (value == null) return "—";
  return `Rs. ${inrFormat.format(value)}`;
}

interface EventPricingPanelProps {
  events: LeadEvent[];
  pushes: MuaPushWithDetails[];
  pushEventPrices: MuaPushEventPrice[];
}

function eventStatusChip(events: LeadEvent[]): string {
  const active = events.filter((e) => e.status !== "notNeeded");
  const booked = active.filter((e) => e.status === "booked").length;
  if (booked === 0) return "Open";
  if (booked === active.length) return "Booked";
  return "Partial";
}

export function EventPricingPanel({
  events,
  pushes,
  pushEventPrices,
}: EventPricingPanelProps) {
  const [open, setOpen] = useState(false);

  const ceremonyEvents = useMemo(
    () => events.filter((e) => e.status !== "notNeeded"),
    [events]
  );

  const rows = useMemo(
    () =>
      pushes.filter((p) => p.status === "active" || p.status === "booked"),
    [pushes]
  );

  const matrix = useMemo(() => {
    if (ceremonyEvents.length <= 1) return null;

    const priceMap = new Map<string, number>();
    for (const pep of pushEventPrices) {
      const amount = asAmount(pep.quotedPrice);
      if (amount != null) {
        priceMap.set(`${pep.pushId}:${pep.eventId}`, amount);
      }
    }

    const cells: Record<
      string,
      Record<
        string,
        {
          price: number | null;
          booked: boolean;
          awaitingClose: boolean;
          proposed: boolean;
        }
      >
    > = {};

    for (const push of rows) {
      cells[push.id] = {};
      for (const ev of ceremonyEvents) {
        const proposed = push.eventIds?.includes(ev.id) ?? false;
        const price = proposed
          ? (priceMap.get(`${push.id}:${ev.id}`) ?? null)
          : null;
        const booked =
          ev.status === "booked" && ev.muaId === push.muaId && proposed;
        const awaitingClose = push.status === "awaitingClose" && proposed;
        cells[push.id][ev.id] = { price, booked, awaitingClose, proposed };
      }
    }

    const footerByEvent: Record<string, number> = {};
    for (const ev of ceremonyEvents) {
      if (ev.status === "booked" && ev.bookedPrice != null) {
        footerByEvent[ev.id] = asAmount(ev.bookedPrice) ?? 0;
      } else {
        const quotes = rows
          .map((p) => cells[p.id]?.[ev.id]?.price)
          .filter((x): x is number => x != null);
        footerByEvent[ev.id] = quotes.length ? Math.min(...quotes) : 0;
      }
    }

    const rowTotals: Record<string, number> = {};
    for (const push of rows) {
      rowTotals[push.id] = ceremonyEvents.reduce((sum, ev) => {
        const c = cells[push.id][ev.id];
        return c.proposed && c.price != null ? sum + c.price : sum;
      }, 0);
    }

    return { cells, footerByEvent, rowTotals };
  }, [ceremonyEvents, rows, pushEventPrices]);

  if (!matrix || rows.length === 0) return null;

  const bookedEventIds = new Set(
    ceremonyEvents.filter((e) => e.status === "booked").map((e) => e.id)
  );

  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mb-2 text-brand"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Hide pricing breakdown ▴" : "Show pricing breakdown ▾"}
      </Button>

      {open && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-lg font-semibold text-brand">
              Event Pricing Overview
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-muted">
                  <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 min-w-[140px]">
                    MUA
                  </th>
                  {ceremonyEvents.map((ev) => {
                    const chip = eventStatusChip([ev]);
                    const chipVariant =
                      chip === "Booked"
                        ? "success"
                        : chip === "Partial"
                          ? "muted"
                          : "default";
                    return (
                      <th
                        key={ev.id}
                        className={cn(
                          "px-3 py-2 min-w-[100px]",
                          bookedEventIds.has(ev.id) && "bg-emerald-50/60"
                        )}
                      >
                        <span className="mr-1">
                          {CEREMONY_ICON[ev.ceremonyType] ?? "✦"}
                        </span>
                        {ev.ceremonyType}
                        <Badge variant={chipVariant} className="ml-1 text-[9px]">
                          {chip}
                        </Badge>
                      </th>
                    );
                  })}
                  <th className="px-3 py-2 text-right">Total quoted</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((push) => (
                  <tr key={push.id} className="border-t border-slate-100">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2">
                      <p className="font-medium text-brand">{push.muaName}</p>
                      {push.planTier && (
                        <span
                          className={cn(
                            "mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                            PLAN_BADGE[push.planTier]
                          )}
                        >
                          {PLAN_TIER_LABELS[push.planTier]}
                        </span>
                      )}
                    </td>
                    {ceremonyEvents.map((ev) => {
                      const cell = matrix.cells[push.id][ev.id];
                      return (
                        <td
                          key={ev.id}
                          className={cn(
                            "px-3 py-2 align-top",
                            bookedEventIds.has(ev.id) && "bg-emerald-50/40",
                            cell.awaitingClose && "bg-amber-50",
                            !cell.proposed && "bg-slate-50 text-slate-400"
                          )}
                        >
                          {!cell.proposed ? (
                            "—"
                          ) : (
                            <>
                              <p className="font-medium tabular-nums">
                                {formatRs(cell.price)}
                              </p>
                              {cell.booked && (
                                <p className="text-[10px] font-semibold text-emerald-700">
                                  ✓ Booked
                                </p>
                              )}
                              {cell.awaitingClose && !cell.booked && (
                                <p className="text-[10px] font-medium text-amber-800">
                                  Awaiting close
                                </p>
                              )}
                            </>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatRs(matrix.rowTotals[push.id] ?? 0)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-medium">
                  <td className="sticky left-0 z-10 bg-slate-50 px-3 py-2">
                    Total if all booked
                  </td>
                  {ceremonyEvents.map((ev) => (
                    <td
                      key={ev.id}
                      className={cn(
                        "px-3 py-2 tabular-nums",
                        bookedEventIds.has(ev.id) && "bg-emerald-50/40"
                      )}
                    >
                      {formatRs(matrix.footerByEvent[ev.id] ?? 0)}
                    </td>
                  ))}
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
