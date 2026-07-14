import { sql } from "@/db/index";
import { fromDbTier } from "@/lib/db-mappers";
import {
  bookingAmountPaid,
  bookingPaymentStatus,
} from "@/lib/booking-payment";
import {
  commissionOutstanding,
  commissionPaymentStatus,
  isCommissionOverdue,
} from "@/lib/commission-booking";
import { csvDateCell } from "@/lib/utils";
import { toDateOnly } from "@/lib/date-only";
import { leadTracksCommissionSync } from "@/lib/lead-tracks-commission";
import type { BookingRow, BudgetTier } from "@/lib/types";

function mapPlan(raw: string | null) {
  if (!raw) return null;
  const map: Record<string, string> = {
    highest_privy: "highestPrivy",
    phoenix_2: "phoenix2",
    phoenix: "phoenix",
    pro: "pro",
    prime: "prime",
  };
  return map[raw] ?? raw;
}

export type CommissionOverdueRow = BookingRow & {
  overdueReason: string;
};

export const COMMISSION_OVERDUE_CSV_HEADERS = [
  "Booking Date",
  "Bride",
  "Display ID",
  "Ceremony",
  "Commission RM",
  "MUA",
  "Booked Price",
  "Bride Payment",
  "Commission Due",
  "Commission Received",
  "Commission Status",
  "Overdue",
  "Overdue Reason",
  "Region",
  "City",
  "Event Date",
] as const;

export function commissionOverdueToCsv(r: CommissionOverdueRow): unknown[] {
  const bridePay =
    bookingPaymentStatus(r) === "paid"
      ? "Paid"
      : `${bookingAmountPaid(r)} / ${r.bookedPrice}`;
  let commissionStatus = "Unpaid";
  if (r.commissionOverdue) {
    commissionStatus = "Overdue";
  } else if (commissionPaymentStatus(r) === "paid") {
    commissionStatus = "Paid";
  } else if (commissionPaymentStatus(r) === "partial") {
    commissionStatus = `Partial · ${commissionOutstanding(r)} due`;
  }

  return [
    csvDateCell(r.bookingDate),
    r.brideName,
    r.displayId,
    r.ceremonyType,
    r.rmName ?? "",
    r.muaName,
    r.bookedPrice,
    bridePay,
    r.commissionAmount ?? "",
    r.commissionPaid ?? 0,
    commissionStatus,
    r.commissionOverdue ? "Yes" : "No",
    r.overdueReason,
    r.region,
    r.city,
    csvDateCell(r.eventDate),
  ];
}

export async function fetchCommissionOverdueBookings(options: {
  role: string;
  userId: string;
  overdueOnly?: boolean;
  commissionRmId?: string | null;
  bookingFrom?: string | null;
  bookingTo?: string | null;
}): Promise<CommissionOverdueRow[]> {
  const isRegional = options.role === "regionalRm";
  const isCommission = options.role === "commissionRm";
  const commissionRmId = options.commissionRmId ?? null;
  const bookingFrom = options.bookingFrom ?? null;
  const bookingTo = options.bookingTo ?? null;

  const rows = await sql<
    (BookingRow & {
      budgetTier: string;
      muaPlan: string | null;
      shiftedAt: string | null;
      leadStatus: string;
    })[]
  >`
    SELECT
      b.id,
      b.booked_price,
      b.advance_paid,
      b.full_paid,
      b.payment_mode,
      b.booking_date,
      b.zoho_invoice_ref,
      b.commission_amount,
      b.commission_paid,
      b.commission_paid_at,
      b.bride_fully_paid_at,
      b.cancelled,
      b.cancel_reason,
      bl.id AS lead_id,
      bl.display_id,
      bl.bride_name,
      bl.city,
      bl.region,
      bl.budget_tier,
      bl.shifted_at,
      bl.status::text AS lead_status,
      le.ceremony_type,
      le.event_date,
      m.id AS mua_id,
      m.name AS mua_name,
      m.plan_tier AS mua_plan,
      s.name AS rm_name,
      mp.stage AS push_stage
    FROM bookings b
    JOIN bride_leads bl ON bl.id = b.lead_id
    JOIN lead_events le ON le.id = b.event_id
    JOIN muas m ON m.id = b.mua_id
    LEFT JOIN staff s ON s.id = bl.assigned_rm_id
    LEFT JOIN mua_pushes mp ON mp.id = b.push_id
    WHERE COALESCE(b.cancelled, false) = false
      AND (
        bl.shifted_at IS NOT NULL
        OR bl.status = 'commission_rm'
      )
      AND (
        ${isRegional}::boolean = false
        OR bl.assigned_rm_id = ${options.userId}::uuid
      )
      AND (
        ${isCommission}::boolean = false
        OR (
          bl.shifted_at IS NOT NULL
          OR bl.status = 'commission_rm'
          OR mp.pushed_by = ${options.userId}::uuid
        )
      )
      AND (${commissionRmId}::uuid IS NULL OR bl.assigned_rm_id = ${commissionRmId}::uuid)
      AND (${bookingFrom}::date IS NULL OR b.booking_date >= ${bookingFrom}::date)
      AND (${bookingTo}::date IS NULL OR b.booking_date <= ${bookingTo}::date)
    ORDER BY b.booking_date DESC
  `;

  const mapped: CommissionOverdueRow[] = [];

  for (const r of rows) {
    const trackCommission = leadTracksCommissionSync({
      shiftedAt: r.shiftedAt ?? null,
      status: r.leadStatus,
    });
    if (!trackCommission) continue;

    const commissionAmount = Number(r.commissionAmount);
    const commissionPaid =
      r.commissionPaid != null ? Number(r.commissionPaid) : null;
    const bookingDate = toDateOnly(r.bookingDate) ?? "";
    const brideFullyPaidAt = toDateOnly(r.brideFullyPaidAt);

    const overdue = isCommissionOverdue({
      commissionAmount,
      commissionPaid,
      bookingDate,
      brideFullyPaidAt,
    });

    if (options.overdueOnly && !overdue) continue;

    let overdueReason = "";
    if (overdue) {
      overdueReason = "30+ days since booking";
    }

    mapped.push({
      id: r.id,
      bookedPrice: Number(r.bookedPrice),
      advancePaid: r.advancePaid != null ? Number(r.advancePaid) : null,
      fullPaid: r.fullPaid != null ? Number(r.fullPaid) : null,
      paymentMode: r.paymentMode ?? null,
      bookingDate,
      zohoInvoiceRef: r.zohoInvoiceRef,
      trackCommission: true,
      commissionAmount,
      commissionPaid,
      commissionPaidAt: r.commissionPaidAt ?? null,
      commissionPaymentMode: r.commissionPaymentMode ?? null,
      brideFullyPaidAt,
      commissionOverdue: overdue,
      cancelled: false,
      cancelReason: null,
      leadId: r.leadId,
      displayId: r.displayId,
      brideName: r.brideName,
      city: r.city,
      region: r.region,
      budgetTier: fromDbTier(String(r.budgetTier)) as BudgetTier,
      ceremonyType: r.ceremonyType,
      eventDate: r.eventDate,
      muaId: r.muaId,
      muaName: r.muaName,
      muaPlan: mapPlan(r.muaPlan) as BookingRow["muaPlan"],
      rmName: r.rmName,
      pushStage: r.pushStage,
      commissionNextFollowUpAt: null,
      overdueReason,
    });
  }

  return mapped;
}
