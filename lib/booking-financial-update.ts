import type { TransactionSql } from "@/db/index";
import { appendComm, insertAuditLog } from "@/db/index";
import { bookingAmountPaid, bookingPaymentStatus } from "@/lib/booking-payment";
import {
  commissionAmountPaid,
  commissionPaymentStatus,
  resolveBrideFullyPaidAt,
} from "@/lib/commission-booking";
import { syncCommissionCollectionAfterPayment } from "@/lib/commission-collection-tasks";
import { reconcilePostBookingTasksAfterPayment } from "@/lib/post-booking-tasks";
import { leadTracksCommissionSync } from "@/lib/lead-tracks-commission";
import { COMM } from "@/lib/comm-types";
import type { PaymentMode } from "@/lib/types";

export type BookingFinancialUpdateInput = {
  advancePaid?: number | null;
  fullPaid?: number | null;
  paymentMode?: PaymentMode | null;
  zohoInvoiceRef?: string | null;
  commissionAmount?: number | null;
  commissionPaid?: number | null;
  commissionNextFollowUpAt?: string | null;
  /** Close bride–MUA payment tracking when Olready commission is received or N/A. */
  dismissBridePayment?: boolean;
};

export type BookingFinancialRow = {
  id: string;
  leadId: string;
  pushId: string | null;
  bookedPrice: number;
  bookingDate: string;
  ceremonyType: string;
  advancePaid: number | null;
  fullPaid: number | null;
  paymentMode: PaymentMode | null;
  zohoInvoiceRef: string | null;
  brideFullyPaidAt: string | null;
  commissionAmount: number | null;
  commissionPaid: number | null;
  commissionNextFollowUpAt: string | null;
  muaName: string;
  brideName: string;
  shiftedAt: string | null;
  leadStatus: string;
  assignedRmId: string | null;
  pushedBy: string | null;
};

function commissionCleared(
  due: number | null,
  paid: number | null
): boolean {
  const amountDue = due ?? 0;
  if (amountDue <= 0) return true;
  return commissionAmountPaid({ commissionPaid: paid }) >= amountDue;
}

export function validateBookingFinancialUpdate(
  existing: BookingFinancialRow,
  body: BookingFinancialUpdateInput,
  allowCommission: boolean
): string | null {
  const advancePaid =
    body.advancePaid !== undefined ? body.advancePaid : existing.advancePaid;
  const fullPaid =
    body.fullPaid !== undefined ? body.fullPaid : existing.fullPaid;

  if (advancePaid != null && advancePaid < 0) return "Invalid advance";
  if (fullPaid != null && fullPaid < 0) return "Invalid balance";

  const paid = (advancePaid ?? 0) + (fullPaid ?? 0);
  if (paid > Number(existing.bookedPrice)) {
    return "Advance + balance cannot exceed booked price";
  }

  const existingBrideTotal = bookingAmountPaid({
    advancePaid: existing.advancePaid,
    fullPaid: existing.fullPaid,
  });
  const nextAdvance =
    body.advancePaid !== undefined ? body.advancePaid : existing.advancePaid;
  const nextFull =
    body.fullPaid !== undefined ? body.fullPaid : existing.fullPaid;
  const nextBrideTotal = bookingAmountPaid({
    advancePaid: nextAdvance,
    fullPaid: nextFull,
  });
  if (nextBrideTotal < existingBrideTotal) {
    return "Recorded bride payment cannot be reduced";
  }

  if (allowCommission) {
    const commissionAmount =
      body.commissionAmount !== undefined
        ? body.commissionAmount
        : existing.commissionAmount;
    const commissionPaid =
      body.commissionPaid !== undefined
        ? body.commissionPaid
        : existing.commissionPaid;

    const commissionFloor = commissionAmountPaid({
      commissionPaid: existing.commissionPaid,
    });
    if (
      body.commissionPaid !== undefined &&
      body.commissionPaid !== null &&
      body.commissionPaid < commissionFloor
    ) {
      return "Commission received cannot be reduced";
    }

    if (commissionAmount != null && commissionAmount < 0) {
      return "Invalid commission due";
    }
    const effectiveDue =
      commissionAmount != null ? Number(commissionAmount) : null;
    if (
      commissionPaid != null &&
      effectiveDue != null &&
      commissionPaid > effectiveDue
    ) {
      return "Commission received cannot exceed commission due";
    }
  }

  if (body.dismissBridePayment) {
    const effectiveDue =
      body.commissionAmount !== undefined
        ? body.commissionAmount
        : existing.commissionAmount;
    const effectivePaid =
      body.commissionPaid !== undefined
        ? body.commissionPaid
        : existing.commissionPaid;
    if (!commissionCleared(effectiveDue, effectivePaid)) {
      return "Clear Olready commission before closing bride payment tracking";
    }
  }

  return null;
}

export async function applyBookingFinancialUpdate(
  tx: TransactionSql,
  params: {
    existing: BookingFinancialRow;
    body: BookingFinancialUpdateInput;
    actorId: string;
    allowCommission: boolean;
    scheduleCommissionFollowUpTask?: boolean;
    source?: string;
  }
): Promise<void> {
  const { existing, body, actorId, allowCommission } = params;
  const err = validateBookingFinancialUpdate(existing, body, allowCommission);
  if (err) throw new Error(err);

  const advancePaid =
    body.advancePaid !== undefined ? body.advancePaid : existing.advancePaid;
  const fullPaid =
    body.fullPaid !== undefined ? body.fullPaid : existing.fullPaid;
  const paymentMode =
    body.paymentMode !== undefined ? body.paymentMode : existing.paymentMode;
  const zohoInvoiceRef =
    body.zohoInvoiceRef !== undefined
      ? body.zohoInvoiceRef
      : existing.zohoInvoiceRef;

  const nowIso = new Date().toISOString();
  let brideFullyPaidAt = existing.brideFullyPaidAt;
  if (body.dismissBridePayment) {
    brideFullyPaidAt = brideFullyPaidAt ?? nowIso;
  } else {
    brideFullyPaidAt = resolveBrideFullyPaidAt(
      {
        bookedPrice: Number(existing.bookedPrice),
        advancePaid,
        fullPaid,
        brideFullyPaidAt,
      },
      nowIso
    );
  }

  const commissionAmount =
    body.commissionAmount !== undefined ? body.commissionAmount : undefined;
  const commissionPaid =
    body.commissionPaid !== undefined ? body.commissionPaid : undefined;
  const commissionNextFollowUpAt =
    body.commissionNextFollowUpAt !== undefined
      ? body.commissionNextFollowUpAt?.trim() || null
      : undefined;
  const touchCommissionFollowUp = commissionNextFollowUpAt !== undefined;
  const commissionFollowUpDate = commissionNextFollowUpAt ?? null;

  const effectiveCommissionDue =
    commissionAmount !== undefined
      ? commissionAmount
      : existing.commissionAmount != null
        ? Number(existing.commissionAmount)
        : null;

  let commissionPaidAt: string | null | undefined = undefined;
  if (allowCommission && commissionPaid !== undefined && commissionPaid !== null) {
    const paid = commissionPaid;
    const due = effectiveCommissionDue ?? 0;
    if (due > 0 && paid >= due) {
      commissionPaidAt = nowIso;
    } else if (paid > 0) {
      commissionPaidAt = nowIso;
    } else {
      commissionPaidAt = null;
    }
  }

  const commissionFieldsTouched =
    allowCommission &&
    (commissionPaid !== undefined || commissionAmount !== undefined);

  if (commissionFieldsTouched) {
    if (commissionPaid !== undefined) {
      await tx`
        UPDATE bookings SET
          advance_paid = ${advancePaid},
          full_paid = ${fullPaid},
          payment_mode = ${paymentMode},
          zoho_invoice_ref = ${zohoInvoiceRef},
          bride_fully_paid_at = ${brideFullyPaidAt},
          commission_amount = COALESCE(${commissionAmount ?? null}, commission_amount),
          commission_paid = ${commissionPaid},
          commission_paid_at = ${commissionPaidAt ?? null},
          commission_next_follow_up_at = CASE
            WHEN ${touchCommissionFollowUp}
              THEN ${commissionFollowUpDate}::date
            ELSE commission_next_follow_up_at
          END
        WHERE id = ${existing.id}::uuid
      `;
    } else {
      await tx`
        UPDATE bookings SET
          advance_paid = ${advancePaid},
          full_paid = ${fullPaid},
          payment_mode = ${paymentMode},
          zoho_invoice_ref = ${zohoInvoiceRef},
          bride_fully_paid_at = ${brideFullyPaidAt},
          commission_amount = ${commissionAmount},
          commission_next_follow_up_at = CASE
            WHEN ${touchCommissionFollowUp}
              THEN ${commissionFollowUpDate}::date
            ELSE commission_next_follow_up_at
          END
        WHERE id = ${existing.id}::uuid
      `;
    }
  } else {
    await tx`
      UPDATE bookings SET
        advance_paid = ${advancePaid},
        full_paid = ${fullPaid},
        payment_mode = ${paymentMode},
        zoho_invoice_ref = ${zohoInvoiceRef},
        bride_fully_paid_at = ${brideFullyPaidAt},
        commission_next_follow_up_at = CASE
          WHEN ${touchCommissionFollowUp}
            THEN ${commissionFollowUpDate}::date
          ELSE commission_next_follow_up_at
        END
      WHERE id = ${existing.id}::uuid
    `;
  }

  const total = bookingAmountPaid({ advancePaid, fullPaid });
  await appendComm(tx, {
    leadId: existing.leadId,
    entryType: COMM.note,
    description: `Bride payment updated for ${existing.ceremonyType}: Rs. ${total.toLocaleString("en-IN")} of Rs. ${Number(existing.bookedPrice).toLocaleString("en-IN")}${
      body.dismissBridePayment ? " (tracking closed — commission settled)" : ""
    }`,
    actorId,
    metadata: {
      bookingId: existing.id,
      action: "payment_updated",
      source: params.source ?? "bookings",
    },
  });

  if (allowCommission && commissionPaid !== undefined && effectiveCommissionDue != null) {
    await appendComm(tx, {
      leadId: existing.leadId,
      entryType: COMM.note,
      description: `Commission from MUA for ${existing.ceremonyType}: Rs. ${commissionAmountPaid({ commissionPaid }).toLocaleString("en-IN")} of Rs. ${effectiveCommissionDue.toLocaleString("en-IN")}`,
      actorId,
      metadata: {
        bookingId: existing.id,
        action: "commission_payment_updated",
        source: params.source ?? "bookings",
      },
    });
  } else if (allowCommission && commissionAmount != null) {
    await appendComm(tx, {
      leadId: existing.leadId,
      entryType: COMM.note,
      description: `Commission due set for ${existing.ceremonyType}: Rs. ${commissionAmount.toLocaleString("en-IN")}`,
      actorId,
      metadata: {
        bookingId: existing.id,
        action: "commission_amount_set",
        source: params.source ?? "bookings",
      },
    });
  }

  await insertAuditLog(tx, {
    tableName: "bookings",
    recordId: existing.id,
    action: "update_payment",
    actorId,
    changes: body as Record<string, unknown>,
  });

  if (allowCommission || commissionNextFollowUpAt !== undefined) {
    const effectivePaid =
      commissionPaid !== undefined
        ? commissionPaid
        : existing.commissionPaid != null
          ? Number(existing.commissionPaid)
          : null;
    const effectiveDue =
      commissionAmount !== undefined
        ? commissionAmount
        : existing.commissionAmount != null
          ? Number(existing.commissionAmount)
          : null;
    const followUp =
      commissionNextFollowUpAt !== undefined
        ? commissionNextFollowUpAt
        : existing.commissionNextFollowUpAt;

    await syncCommissionCollectionAfterPayment(tx, {
      bookingId: existing.id,
      leadId: existing.leadId,
      pushId: existing.pushId,
      bookingDate: existing.bookingDate,
      commissionAmount: effectiveDue,
      commissionPaid: effectivePaid,
      commissionNextFollowUpAt: followUp,
      muaName: existing.muaName,
      brideName: existing.brideName,
      ceremonyLabel: existing.ceremonyType,
      isCommissionLead: leadTracksCommissionSync({
        shiftedAt: existing.shiftedAt,
        status: existing.leadStatus,
      }),
      assignedRmId: existing.assignedRmId,
      pushedBy: existing.pushedBy,
      actorId,
      scheduleFollowUpTask:
        params.scheduleCommissionFollowUpTask ??
        commissionNextFollowUpAt !== undefined,
    });
  }

  await reconcilePostBookingTasksAfterPayment(tx, existing.leadId);
}

export async function loadBookingFinancialRow(
  tx: TransactionSql,
  bookingId: string
): Promise<BookingFinancialRow | null> {
  const [row] = await tx<BookingFinancialRow[]>`
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
    WHERE b.id = ${bookingId}::uuid AND COALESCE(b.cancelled, false) = false
  `;
  return row ?? null;
}
