import type { LeadFull, LeadStatus } from "@/lib/types";
import { LEAD_STATUS_LABELS } from "@/lib/types";

export function getLeadEventCounts(lead: {
  bookedEventCount?: number;
  openEventCount?: number;
  eventCount?: number;
}): { booked: number; open: number } {
  return {
    booked: lead.bookedEventCount ?? 0,
    open: lead.openEventCount ?? 0,
  };
}

/** Human-readable status from DB status + event booking state. */
export function getLeadStatusLabel(lead: {
  status: LeadStatus;
  bookedEventCount?: number;
  openEventCount?: number;
}): string {
  const { booked, open } = getLeadEventCounts(lead);
  if (open === 0 && booked > 0) return LEAD_STATUS_LABELS.booked;
  if (booked > 0 && open > 0) return "Partial booked";
  return LEAD_STATUS_LABELS[lead.status];
}

export function formatMuasOfferedLine(lead: LeadFull): string {
  const count = lead.muasOfferedCount ?? 0;
  const names = lead.muasOfferedNames?.trim();
  if (names) return names;
  if (count > 0) return `${count} MUA${count === 1 ? "" : "s"}`;
  return "—";
}

/** Events column: ceremony labels (often with per-event Rs. from queue SQL). */
export function formatEventsBudgetLine(lead: LeadFull): string {
  const events = lead.eventLabels?.trim();
  if (events) {
    if (/Rs\./.test(events)) return events;
    const total =
      lead.budgetAmount != null
        ? `Rs. ${lead.budgetAmount.toLocaleString("en-IN")}`
        : null;
    return total ? `${events} · ${total}` : events;
  }
  if (lead.budgetAmount != null) {
    return `Rs. ${lead.budgetAmount.toLocaleString("en-IN")}`;
  }
  return "—";
}
