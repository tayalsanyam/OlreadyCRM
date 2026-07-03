import type { PaymentMode } from "@/lib/types";

export const PAYMENT_MODE_OPTIONS: { value: PaymentMode; label: string }[] = [
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

export function bookingAmountPaid(booking: {
  advancePaid: number | null;
  fullPaid: number | null;
}): number {
  return (booking.advancePaid ?? 0) + (booking.fullPaid ?? 0);
}

export function bookingOutstanding(booking: {
  bookedPrice: number;
  advancePaid: number | null;
  fullPaid: number | null;
}): number {
  return Math.max(
    0,
    Number(booking.bookedPrice) - bookingAmountPaid(booking)
  );
}

export function bookingPaymentStatus(booking: {
  bookedPrice: number;
  advancePaid: number | null;
  fullPaid: number | null;
}): "unpaid" | "partial" | "paid" {
  const paid = bookingAmountPaid(booking);
  if (paid <= 0) return "unpaid";
  if (paid >= Number(booking.bookedPrice)) return "paid";
  return "partial";
}

/** Bride–MUA payment closed without recording full collection (regional RM). */
export function bridePaymentTrackingDismissed(booking: {
  brideFullyPaidAt?: string | null;
  bookedPrice: number;
  advancePaid: number | null;
  fullPaid: number | null;
}): boolean {
  return (
    booking.brideFullyPaidAt != null &&
    bookingPaymentStatus(booking) !== "paid"
  );
}
