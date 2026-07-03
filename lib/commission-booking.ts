import { bookingAmountPaid, bookingPaymentStatus } from "@/lib/booking-payment";
import { toDateOnly } from "@/lib/date-only";

export type CommissionPaymentStatus = "unpaid" | "partial" | "paid";

/** Client-side filter for commission bookings lists. */
export type CommissionPaymentFilter =
  | ""
  | "paid"
  | "pending"
  | "sla_due"
  | "partial"
  | "overdue"
  | "none";

export const COMMISSION_PAYMENT_FILTER_LABELS: Record<
  CommissionPaymentFilter,
  string
> = {
  "": "All commission",
  paid: "Received (paid)",
  pending: "Pending",
  sla_due: "SLA due (7d+)",
  partial: "Partial",
  overdue: "Overdue (30d+)",
  none: "No commission",
};

export const COMMISSION_SLA_DAYS = 7;
export const COMMISSION_OVERDUE_DAYS = 30;

export type CommissionCollectionStage =
  | "paid"
  | "partial"
  | "pending"
  | "sla_due"
  | "overdue";

export const COMMISSION_COLLECTION_STAGE_LABELS: Record<
  CommissionCollectionStage,
  string
> = {
  paid: "Received",
  partial: "Partial",
  pending: "Due",
  sla_due: "SLA due",
  overdue: "Overdue",
};

export function commissionAmountPaid(booking: {
  commissionPaid: number | null;
}): number {
  return booking.commissionPaid ?? 0;
}

/** Show commission columns/values when the lead tracks commission or amounts exist on the booking. */
export function bookingShowsCommission(booking: {
  trackCommission?: boolean;
  commissionAmount: number | null;
  commissionPaid: number | null;
}): boolean {
  if (booking.trackCommission) return true;
  if (booking.commissionAmount != null && booking.commissionAmount > 0) return true;
  if ((booking.commissionPaid ?? 0) > 0) return true;
  return false;
}

export function commissionOutstanding(booking: {
  commissionAmount: number | null;
  commissionPaid: number | null;
}): number {
  const due = booking.commissionAmount ?? 0;
  if (due <= 0) return 0;
  return Math.max(0, due - commissionAmountPaid(booking));
}

export function matchesCommissionPaymentFilter(
  booking: {
    trackCommission?: boolean;
    commissionAmount: number | null;
    commissionPaid: number | null;
    commissionOverdue?: boolean;
    cancelled?: boolean;
    bookingDate: string;
  },
  filter: CommissionPaymentFilter
): boolean {
  if (!filter) return true;
  const shows = bookingShowsCommission(booking);
  if (filter === "none") return !shows;
  if (!shows) return false;
  if (booking.cancelled) return false;
  if (filter === "overdue") return !!booking.commissionOverdue;
  const stage = commissionCollectionStage({
    commissionAmount: booking.commissionAmount,
    commissionPaid: booking.commissionPaid,
    bookingDate: (booking as { bookingDate?: string }).bookingDate ?? "",
  });
  if (filter === "paid") return stage === "paid";
  if (filter === "partial") return stage === "partial";
  if (filter === "sla_due") return stage === "sla_due";
  if (filter === "pending") return stage === "pending";
  return true;
}

export function commissionPaymentStatus(booking: {
  commissionAmount: number | null;
  commissionPaid: number | null;
}): CommissionPaymentStatus {
  const due = booking.commissionAmount ?? 0;
  if (due <= 0) return "paid";
  const paid = commissionAmountPaid(booking);
  if (paid <= 0) return "unpaid";
  if (paid >= due) return "paid";
  return "partial";
}

export function addDaysToDate(isoDate: string, days: number): string | null {
  const base = toDateOnly(isoDate);
  if (!base) return null;
  const d = new Date(base + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function commissionSlaDueDate(bookingDate: string): string | null {
  return addDaysToDate(bookingDate, COMMISSION_SLA_DAYS);
}

export function commissionOverdueDate(bookingDate: string): string | null {
  return addDaysToDate(bookingDate, COMMISSION_OVERDUE_DAYS);
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isCommissionSlaBreached(booking: {
  commissionAmount: number | null;
  commissionPaid: number | null;
  bookingDate: string | Date;
}): boolean {
  if (commissionPaymentStatus(booking) === "paid") return false;
  const due = booking.commissionAmount ?? 0;
  if (due <= 0) return false;
  const bookDate = toDateOnly(booking.bookingDate);
  if (!bookDate) return false;
  const slaDate = commissionSlaDueDate(bookDate);
  return !!slaDate && todayDateOnly() >= slaDate;
}

/** Overdue if commission still due and 30+ days since booking. */
export function isCommissionOverdue(booking: {
  commissionAmount: number | null;
  commissionPaid: number | null;
  bookingDate: string | Date;
  brideFullyPaidAt?: string | Date | null;
}): boolean {
  if (commissionPaymentStatus(booking) === "paid") return false;
  const due = booking.commissionAmount ?? 0;
  if (due <= 0) return false;

  const bookDate = toDateOnly(booking.bookingDate);
  if (!bookDate) return false;

  const bookPlus30 = commissionOverdueDate(bookDate);
  return !!bookPlus30 && todayDateOnly() > bookPlus30;
}

export function commissionCollectionStage(booking: {
  commissionAmount: number | null;
  commissionPaid: number | null;
  bookingDate: string | Date;
}): CommissionCollectionStage {
  const status = commissionPaymentStatus(booking);
  if (status === "paid") return "paid";
  if (isCommissionOverdue(booking)) return "overdue";
  if (status === "partial") return "partial";
  if (isCommissionSlaBreached(booking)) return "sla_due";
  return "pending";
}

export function brideFullyPaidNow(booking: {
  bookedPrice: number;
  advancePaid: number | null;
  fullPaid: number | null;
}): boolean {
  return bookingPaymentStatus(booking) === "paid";
}

export function resolveBrideFullyPaidAt(
  booking: {
    bookedPrice: number;
    advancePaid: number | null;
    fullPaid: number | null;
    brideFullyPaidAt?: string | null;
  },
  nowIso: string
): string | null {
  if (!brideFullyPaidNow(booking)) return null;
  return booking.brideFullyPaidAt ?? nowIso;
}
