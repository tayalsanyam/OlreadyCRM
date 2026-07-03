import { matchesCommissionPaymentFilter } from "@/lib/commission-booking";
import type { CommissionPaymentFilter } from "@/lib/commission-booking";
import { toDateOnly } from "@/lib/date-only";
import type { BookingRow, PlanTier } from "@/lib/types";

export type BookingsListFilters = {
  leadQuery: string;
  muaId: string;
  plan: PlanTier | "";
  commissionStatus: CommissionPaymentFilter;
};

export function matchesLeadSearch(booking: BookingRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    booking.brideName.toLowerCase().includes(q) ||
    booking.displayId.toLowerCase().includes(q) ||
    booking.city.toLowerCase().includes(q) ||
    booking.leadId.toLowerCase().includes(q)
  );
}

export function filterBookingsList(
  bookings: BookingRow[],
  filters: BookingsListFilters,
  bookingDates?: { from?: string; to?: string }
): BookingRow[] {
  const { from, to } = bookingDates ?? {};
  return bookings.filter((b) => {
    const d = toDateOnly(b.bookingDate);
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    if (filters.muaId && b.muaId !== filters.muaId) return false;
    if (filters.plan && b.muaPlan !== filters.plan) return false;
    if (!matchesCommissionPaymentFilter(b, filters.commissionStatus)) return false;
    if (!matchesLeadSearch(b, filters.leadQuery)) return false;
    return true;
  });
}

export function uniqueMuaOptions(
  bookings: BookingRow[]
): { id: string; name: string }[] {
  const map = new Map<string, string>();
  for (const b of bookings) {
    if (!map.has(b.muaId)) map.set(b.muaId, b.muaName);
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function uniquePlanOptions(bookings: BookingRow[]): PlanTier[] {
  const set = new Set<PlanTier>();
  for (const b of bookings) {
    if (b.muaPlan) set.add(b.muaPlan);
  }
  const order: PlanTier[] = [
    "highestPrivy",
    "phoenix2",
    "phoenix",
    "pro",
    "prime",
  ];
  return order.filter((p) => set.has(p));
}
