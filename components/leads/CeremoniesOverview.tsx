"use client";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ceremonyIcon } from "@/components/leads/CeremonyBudgetFields";
import { coerceBudgetAmount } from "@/lib/budget-tier";
import { REGION_OPTIONS } from "@/lib/mua-region";
import type { LeadEvent, Region } from "@/lib/types";
import { formatDate } from "@/lib/utils";

function regionLabel(r: Region | null | undefined): string {
  if (!r) return "—";
  return REGION_OPTIONS.find((o) => o.value === r)?.label ?? r;
}

function formatRs(amount: unknown): string {
  return `Rs. ${coerceBudgetAmount(amount).toLocaleString("en-IN")}`;
}

interface CeremoniesOverviewProps {
  events: LeadEvent[];
  leadBudgetAmount?: number | null;
}

export function CeremoniesOverview({
  events,
  leadBudgetAmount,
}: CeremoniesOverviewProps) {
  const rows = events.filter((e) => e.status !== "notNeeded");
  if (!rows.length) return null;

  const totalCeremonyBudget = rows.reduce(
    (sum, e) => sum + coerceBudgetAmount(e.budgetAmount),
    0,
  );
  const regions = [...new Set(rows.map((e) => e.region).filter(Boolean))];

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-lg font-semibold text-brand">Ceremonies overview</h2>
        <p className="text-xs text-slate-muted">
          Date, location, and budget per ceremony
          {regions.length > 1 && (
            <span className="ml-1 font-medium text-amber-800">
              · Multiple regions
            </span>
          )}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-muted">
              <th className="px-4 py-2">Ceremony</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Location</th>
              <th className="px-4 py-2">Region</th>
              <th className="px-4 py-2 text-right">Budget</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((ev) => (
              <tr key={ev.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium">
                  {ceremonyIcon(ev.ceremonyType)} {ev.ceremonyType}
                </td>
                <td className="px-4 py-2 whitespace-nowrap text-slate-muted">
                  {ev.eventDate ? formatDate(ev.eventDate) : "—"}
                </td>
                <td className="px-4 py-2 max-w-[180px] text-slate-muted">
                  {ev.eventLocation?.trim() || "—"}
                </td>
                <td className="px-4 py-2 capitalize text-slate-muted">
                  {regionLabel(ev.region)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {ev.budgetAmount != null && coerceBudgetAmount(ev.budgetAmount) > 0
                    ? formatRs(ev.budgetAmount)
                    : "—"}
                </td>
                <td className="px-4 py-2">
                  {ev.status === "booked" ? (
                    <Badge variant="success">Booked</Badge>
                  ) : (
                    <Badge variant="muted">Open</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {(totalCeremonyBudget > 0 || leadBudgetAmount != null) && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-medium">
                <td colSpan={4} className="px-4 py-2">
                  Total (ceremonies)
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {totalCeremonyBudget > 0
                    ? formatRs(totalCeremonyBudget)
                    : leadBudgetAmount != null &&
                        coerceBudgetAmount(leadBudgetAmount) > 0
                      ? formatRs(leadBudgetAmount)
                      : "—"}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}
