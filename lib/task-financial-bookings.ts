import type { TransactionSql } from "@/db/index";
import { parseCommissionBookingIdFromTitle, isPostBookingFollowUpTitle } from "@/lib/task-utils";
import { loadBookingFinancialRow, type BookingFinancialRow } from "@/lib/booking-financial-update";
import {
  bookingShowsCommission,
  commissionCollectionStage,
  commissionOutstanding,
  commissionPaymentStatus,
} from "@/lib/commission-booking";
import {
  bookingAmountPaid,
  bookingOutstanding,
  bookingPaymentStatus,
} from "@/lib/booking-payment";
import { leadTracksCommissionSync } from "@/lib/lead-tracks-commission";

export type TaskFinancialBookingSnapshot = {
  id: string;
  ceremonyType: string;
  muaName: string;
  bookedPrice: number;
  bookingDate: string;
  advancePaid: number | null;
  fullPaid: number | null;
  paymentMode: string | null;
  zohoInvoiceRef: string | null;
  brideFullyPaidAt: string | null;
  brideStatus: "unpaid" | "partial" | "paid";
  brideOutstanding: number;
  brideCollected: number;
  trackCommission: boolean;
  commissionAmount: number | null;
  commissionPaid: number | null;
  commissionOutstanding: number;
  commissionStatus: "unpaid" | "partial" | "paid";
  commissionStage: string;
  commissionNextFollowUpAt: string | null;
  bridePaymentDismissed: boolean;
};

function toSnapshot(row: BookingFinancialRow): TaskFinancialBookingSnapshot {
  const trackCommission =
    leadTracksCommissionSync({
      shiftedAt: row.shiftedAt,
      status: row.leadStatus,
    }) ||
    bookingShowsCommission({
      trackCommission: true,
      commissionAmount: row.commissionAmount,
      commissionPaid: row.commissionPaid,
    });

  const bridePreview = {
    bookedPrice: Number(row.bookedPrice),
    advancePaid: row.advancePaid,
    fullPaid: row.fullPaid,
  };

  return {
    id: row.id,
    ceremonyType: row.ceremonyType,
    muaName: row.muaName,
    bookedPrice: Number(row.bookedPrice),
    bookingDate: row.bookingDate,
    advancePaid: row.advancePaid,
    fullPaid: row.fullPaid,
    paymentMode: row.paymentMode,
    zohoInvoiceRef: row.zohoInvoiceRef,
    brideFullyPaidAt: row.brideFullyPaidAt,
    brideStatus: bookingPaymentStatus(bridePreview),
    brideOutstanding: bookingOutstanding(bridePreview),
    brideCollected: bookingAmountPaid(bridePreview),
    trackCommission,
    commissionAmount: row.commissionAmount,
    commissionPaid: row.commissionPaid,
    commissionOutstanding: trackCommission
      ? commissionOutstanding({
          commissionAmount: row.commissionAmount,
          commissionPaid: row.commissionPaid,
        })
      : 0,
    commissionStatus: trackCommission
      ? commissionPaymentStatus({
          commissionAmount: row.commissionAmount,
          commissionPaid: row.commissionPaid,
        })
      : "paid",
    commissionStage: trackCommission
      ? commissionCollectionStage({
          commissionAmount: row.commissionAmount,
          commissionPaid: row.commissionPaid,
          bookingDate: row.bookingDate,
        })
      : "paid",
    commissionNextFollowUpAt: row.commissionNextFollowUpAt,
    bridePaymentDismissed:
      row.brideFullyPaidAt != null &&
      bookingPaymentStatus(bridePreview) !== "paid",
  };
}

export async function loadFinancialBookingsForTask(
  tx: TransactionSql,
  task: {
    leadId: string | null;
    title: string;
  }
): Promise<TaskFinancialBookingSnapshot[]> {
  if (!task.leadId) return [];

  if (isPostBookingFollowUpTitle(task.title)) {
    const rows = await tx<BookingFinancialRow[]>`
      SELECT
        b.id,
        b.lead_id AS "leadId",
        b.push_id AS "pushId",
        b.booked_price AS "bookedPrice",
        b.booking_date::text AS "bookingDate",
        le.ceremony_type AS "ceremonyType",
        b.advance_paid AS "advancePaid",
        b.full_paid AS "fullPaid",
        b.payment_mode AS "paymentMode",
        b.zoho_invoice_ref AS "zohoInvoiceRef",
        b.bride_fully_paid_at AS "brideFullyPaidAt",
        b.commission_amount AS "commissionAmount",
        b.commission_paid AS "commissionPaid",
        b.commission_next_follow_up_at::text AS "commissionNextFollowUpAt",
        m.name AS "muaName",
        bl.bride_name AS "brideName",
        bl.shifted_at AS "shiftedAt",
        bl.status::text AS "leadStatus",
        bl.assigned_rm_id AS "assignedRmId",
        mp.pushed_by AS "pushedBy"
      FROM bookings b
      JOIN lead_events le ON le.id = b.event_id
      JOIN bride_leads bl ON bl.id = b.lead_id
      JOIN muas m ON m.id = b.mua_id
      LEFT JOIN mua_pushes mp ON mp.id = b.push_id
      WHERE b.lead_id = ${task.leadId}::uuid
        AND COALESCE(b.cancelled, false) = false
      ORDER BY le.event_date NULLS LAST, le.ceremony_type
    `;
    return rows.map(toSnapshot);
  }

  const bookingId = parseCommissionBookingIdFromTitle(task.title);
  if (!bookingId) return [];
  const row = await loadBookingFinancialRow(tx, bookingId);
  return row ? [toSnapshot(row)] : [];
}
