"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import type {
  LeadEvent,
  MuaPushEventPrice,
  MuaPushWithDetails,
  PlanTier,
} from "@/lib/types";
import { PLAN_TIER_LABELS } from "@/lib/types";
import { ceremonyIcon } from "@/components/leads/CeremonyBudgetFields";

const fmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function asAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function quoteIndicator(
  quote: number,
  budget: number | null
): { symbol: string; className: string } {
  if (budget == null || budget <= 0) {
    return { symbol: "—", className: "text-slate-muted" };
  }
  const overPct = ((quote - budget) / budget) * 100;
  if (quote <= budget) {
    return { symbol: "✓", className: "text-emerald-600 font-semibold" };
  }
  if (overPct <= 20) {
    return { symbol: "⚠", className: "text-amber-600 font-semibold" };
  }
  return { symbol: "✗", className: "text-red-600 font-semibold" };
}

interface BudgetQuotePanelProps {
  events: LeadEvent[];
  pushes: MuaPushWithDetails[];
  pushEventPrices: MuaPushEventPrice[];
}

export function BudgetQuotePanel({
  events,
  pushes,
  pushEventPrices,
}: BudgetQuotePanelProps) {
  const ceremonyEvents = useMemo(
    () => events.filter((e) => e.status !== "notNeeded"),
    [events]
  );

  const quotedPushes = useMemo(() => {
    const priceMap = new Map<string, number>();
    for (const pep of pushEventPrices) {
      const amount = asAmount(pep.quotedPrice);
      if (amount != null) {
        priceMap.set(`${pep.pushId}:${pep.eventId}`, amount);
      }
    }
    return pushes.filter((p) =>
      ceremonyEvents.some((ev) => priceMap.has(`${p.id}:${ev.id}`))
    );
  }, [pushes, pushEventPrices, ceremonyEvents]);

  const hasBudgets = ceremonyEvents.some((e) => e.budgetAmount != null && e.budgetAmount > 0);
  const hasQuotes = quotedPushes.length > 0;

  if (!hasBudgets && !hasQuotes) {
    return (
      <Card className="py-8 text-center text-sm text-slate-muted">
        Budgets and MUA quotes will appear here as they come in
      </Card>
    );
  }

  const priceMap = new Map<string, number>();
  for (const pep of pushEventPrices) {
    const amount = asAmount(pep.quotedPrice);
    if (amount != null) {
      priceMap.set(`${pep.pushId}:${pep.eventId}`, amount);
    }
  }

  const totalBudget = ceremonyEvents.reduce((s, e) => {
    const n = Number(e.budgetAmount);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-muted">
            <th className="px-4 py-2 font-medium">Event</th>
            <th className="px-4 py-2 font-medium">Budget (stated)</th>
            {quotedPushes.map((p) => (
              <th key={p.id} className="px-4 py-2 font-medium">
                <div>{p.muaName}</div>
                {p.planTier && (
                  <span className="text-[10px] font-normal text-slate-muted">
                    ({PLAN_TIER_LABELS[p.planTier as PlanTier]})
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ceremonyEvents.map((ev) => (
            <tr key={ev.id} className="border-b border-slate-100">
              <td className="px-4 py-2 font-medium text-brand">
                {ceremonyIcon(ev.ceremonyType)} {ev.ceremonyType}
              </td>
              <td className="px-4 py-2 text-slate-muted">
                {ev.budgetAmount != null && ev.budgetAmount > 0
                  ? fmt.format(ev.budgetAmount)
                  : "—"}
              </td>
              {quotedPushes.map((p) => {
                const quote = priceMap.get(`${p.id}:${ev.id}`);
                if (quote == null) {
                  return (
                    <td key={p.id} className="px-4 py-2 text-slate-muted">
                      —
                    </td>
                  );
                }
                const ind = quoteIndicator(quote, ev.budgetAmount ?? null);
                return (
                  <td key={p.id} className={cn("px-4 py-2", ind.className)}>
                    {fmt.format(quote)} {ind.symbol}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="bg-slate-50/80 font-semibold">
            <td className="px-4 py-2">Total</td>
            <td className="px-4 py-2">
              {totalBudget > 0 ? fmt.format(totalBudget) : "—"}
            </td>
            {quotedPushes.map((p) => {
              const total = ceremonyEvents.reduce((s, ev) => {
                const q = priceMap.get(`${p.id}:${ev.id}`);
                return s + (q ?? 0);
              }, 0);
              const ind = quoteIndicator(total, totalBudget > 0 ? totalBudget : null);
              return (
                <td key={p.id} className={cn("px-4 py-2", ind.className)}>
                  {total > 0 ? fmt.format(total) : "—"} {total > 0 ? ind.symbol : ""}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
      {hasBudgets && !hasQuotes && (
        <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-muted">
          No MUA quotes yet
        </p>
      )}
    </Card>
  );
}
