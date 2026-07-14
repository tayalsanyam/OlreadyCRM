import type { TransactionSql } from "@/db/index";
import { appendComm, insertAuditLog } from "@/db/index";
import { resolveBrideFullyPaidAt } from "@/lib/commission-booking";
import { COMM } from "@/lib/comm-types";
import {
  syncPushesAfterEventBooked,
  syncWinningPushAfterEventUnbooked,
} from "@/lib/push-event-booking";
import { reconcileLeadLifecycle } from "@/lib/lead-lifecycle";
import { refreshLeadPhase } from "@/lib/lead-phase";
import {
  cancelPostBookingTasks,
  scheduleBookingCancelledFollowUp,
  syncPostBookingTasks,
} from "@/lib/post-booking-tasks";
import {
  cancelCommissionCollectionTasks,
  scheduleCommissionCollectionOnBooking,
} from "@/lib/commission-collection-tasks";

async function reconcileLeadBookingStatus(
  tx: TransactionSql,
  leadId: string
): Promise<void> {
  const [counts] = await tx<{ booked: number; pending: number }[]>`
    SELECT
      COUNT(*) FILTER (WHERE status = 'booked')::int AS booked,
      COUNT(*) FILTER (WHERE status NOT IN ('booked', 'not_needed'))::int AS pending
    FROM lead_events
    WHERE lead_id = ${leadId}::uuid
  `;
  if (!counts) return;

  if (counts.pending === 0 && counts.booked > 0) {
    await tx`
      UPDATE bride_leads SET status = 'booked', updated_at = NOW()
      WHERE id = ${leadId}::uuid
        AND status IN ('assigned', 'commission_rm')
    `;
    await refreshLeadPhase(tx, leadId);
    return;
  }

  await tx`
    UPDATE bride_leads SET
      status = CASE
        WHEN shifted_at IS NOT NULL THEN 'commission_rm'::lead_status
        ELSE 'assigned'::lead_status
      END,
      updated_at = NOW()
    WHERE id = ${leadId}::uuid
      AND status = 'booked'
      AND ${counts.pending} > 0
  `;

  await refreshLeadPhase(tx, leadId);
}

export interface ConfirmBookingParams {
  leadId: string;
  eventId: string;
  muaId: string;
  pushId: string;
  bookedPrice: number;
  actorId: string;
  advancePaid?: number | null;
  fullPaid?: number | null;
  zohoInvoiceRef?: string | null;
  commissionAmount?: number | null;
  commissionPaid?: number | null;
  trackCommission?: boolean;
}

export async function confirmBooking(
  tx: TransactionSql,
  params: ConfirmBookingParams
): Promise<void> {
  const {
    leadId,
    eventId,
    muaId,
    pushId,
    bookedPrice,
    actorId,
    advancePaid,
    fullPaid,
    zohoInvoiceRef,
    commissionAmount,
    commissionPaid,
    trackCommission,
  } = params;

  const nowIso = new Date().toISOString();
  const brideFullyPaidAt = resolveBrideFullyPaidAt(
    {
      bookedPrice,
      advancePaid: advancePaid ?? null,
      fullPaid: fullPaid ?? null,
    },
    nowIso
  );
  const commissionPaidAt =
    trackCommission &&
    commissionAmount != null &&
    commissionAmount > 0 &&
    (commissionPaid ?? 0) >= commissionAmount
      ? nowIso
      : (commissionPaid ?? 0) > 0
        ? nowIso
        : null;

  await tx`
    UPDATE lead_events SET
      status = 'booked',
      mua_id = ${muaId}::uuid,
      booked_price = ${bookedPrice},
      updated_at = NOW()
    WHERE id = ${eventId}::uuid AND lead_id = ${leadId}::uuid
  `;

  const [mua] = await tx<{ name: string }[]>`
    SELECT name FROM muas WHERE id = ${muaId}::uuid
  `;
  const [ev] = await tx<{ ceremonyType: string }[]>`
    SELECT ceremony_type FROM lead_events WHERE id = ${eventId}::uuid
  `;
  const ceremonyLabel = ev?.ceremonyType ?? "event";

  await appendComm(tx, {
    leadId,
    muaId,
    entryType: COMM.bookingConfirmed,
    description: `Booking confirmed: ${mua?.name ?? "MUA"} for ${ceremonyLabel} — Rs. ${bookedPrice.toLocaleString("en-IN")}`,
    actorId,
    metadata: { eventId, muaId, pushId, bookedPrice },
  });

  const [lead] = await tx<{
    assignedRmId: string | null;
    brideName: string;
    shiftedAt: string | null;
    status: string;
  }[]>`
    SELECT
      assigned_rm_id,
      bride_name,
      shifted_at AS "shiftedAt",
      status::text AS status
    FROM bride_leads
    WHERE id = ${leadId}::uuid
  `;
  const isCommissionLead =
    lead?.shiftedAt != null || lead?.status === "commission_rm";

  await syncPushesAfterEventBooked(tx, {
    leadId,
    eventId,
    winningPushId: pushId,
    ceremonyLabel,
    actorId,
    assignedRmId: lead?.assignedRmId ?? null,
    brideName: lead?.brideName ?? "Lead",
  });

  await reconcileLeadBookingStatus(tx, leadId);
  await reconcileLeadLifecycle(tx, leadId);

  const [inserted] = await tx<{ id: string; bookingDate: string }[]>`
    INSERT INTO bookings (
      lead_id, event_id, mua_id, push_id, booked_price,
      advance_paid, full_paid, zoho_invoice_ref,
      commission_amount, commission_paid, commission_paid_at, bride_fully_paid_at,
      created_by
    )
    VALUES (
      ${leadId}::uuid,
      ${eventId}::uuid,
      ${muaId}::uuid,
      ${pushId}::uuid,
      ${bookedPrice},
      ${advancePaid ?? null},
      ${fullPaid ?? null},
      ${zohoInvoiceRef ?? null},
      ${trackCommission ? commissionAmount ?? null : null},
      ${trackCommission ? commissionPaid ?? null : null},
      ${trackCommission ? commissionPaidAt : null},
      ${brideFullyPaidAt},
      ${actorId}::uuid
    )
    RETURNING id, booking_date::text AS "bookingDate"
  `;

  if (trackCommission && commissionAmount != null && inserted) {
    await appendComm(tx, {
      leadId,
      muaId,
      entryType: COMM.note,
      description: `Commission from MUA for ${ceremonyLabel}: Rs. ${commissionAmount.toLocaleString("en-IN")}${
        (commissionPaid ?? 0) >= commissionAmount
          ? " — received at booking"
          : (commissionPaid ?? 0) > 0
            ? ` — Rs. ${(commissionPaid ?? 0).toLocaleString("en-IN")} received at booking`
            : " — pending"
      }`,
      actorId,
      metadata: { bookingId: eventId, commissionAmount, commissionPaid },
    });
  }

  await syncPostBookingTasks(tx, {
    leadId,
    pushId,
    muaId,
    actorId,
    isCommissionLead,
    assignedRmId: lead?.assignedRmId ?? null,
    brideName: lead?.brideName ?? "Lead",
  });

  if (
    trackCommission &&
    commissionAmount != null &&
    inserted &&
    isCommissionLead
  ) {
    const [pushRow] = await tx<{ pushedBy: string | null }[]>`
      SELECT pushed_by AS "pushedBy" FROM mua_pushes WHERE id = ${pushId}::uuid
    `;
    await scheduleCommissionCollectionOnBooking(tx, {
      bookingId: inserted.id,
      leadId,
      pushId,
      bookingDate: inserted.bookingDate,
      commissionAmount,
      commissionPaid: commissionPaid ?? null,
      muaName: mua?.name ?? "MUA",
      brideName: lead?.brideName ?? "Lead",
      ceremonyLabel,
      isCommissionLead,
      assignedRmId: lead?.assignedRmId ?? null,
      pushedBy: pushRow?.pushedBy ?? null,
      actorId,
    });
  }

  await insertAuditLog(tx, {
    tableName: "bookings",
    recordId: leadId,
    action: "confirm",
    actorId,
    changes: params as unknown as Record<string, unknown>,
  });
}

export async function cancelBooking(
  tx: TransactionSql,
  params: { bookingId: string; actorId: string; reason?: string }
): Promise<{ leadId: string } | null> {
  const reason = params.reason?.trim() || "Cancelled";

  const [booking] = await tx<
    {
      id: string;
      leadId: string;
      eventId: string;
      muaId: string;
      pushId: string | null;
      bookedPrice: number;
      cancelled: boolean;
    }[]
  >`
    SELECT
      id,
      lead_id AS "leadId",
      event_id AS "eventId",
      mua_id AS "muaId",
      push_id AS "pushId",
      booked_price AS "bookedPrice",
      cancelled
    FROM bookings
    WHERE id = ${params.bookingId}::uuid
  `;

  if (!booking || booking.cancelled) return null;

  const [leadRow] = await tx<{
    brideName: string;
    assignedRmId: string | null;
    shiftedAt: string | null;
  }[]>`
    SELECT
      bride_name AS "brideName",
      assigned_rm_id AS "assignedRmId",
      shifted_at AS "shiftedAt"
    FROM bride_leads
    WHERE id = ${booking.leadId}::uuid
  `;
  const isCommissionLead = leadRow?.shiftedAt != null;

  const [ev] = await tx<{ ceremonyType: string }[]>`
    SELECT ceremony_type FROM lead_events WHERE id = ${booking.eventId}::uuid
  `;
  const [mua] = await tx<{ name: string }[]>`
    SELECT name FROM muas WHERE id = ${booking.muaId}::uuid
  `;
  const ceremonyLabel = ev?.ceremonyType ?? "event";
  const muaName = mua?.name ?? "MUA";

  await tx`
    UPDATE bookings SET
      cancelled = true,
      cancelled_at = NOW(),
      cancel_reason = ${reason}
    WHERE id = ${params.bookingId}::uuid AND cancelled = false
  `;

  await tx`
    UPDATE lead_events SET
      status = 'open',
      mua_id = NULL,
      booked_price = NULL,
      updated_at = NOW()
    WHERE id = ${booking.eventId}::uuid
  `;

  if (booking.pushId) {
    await syncWinningPushAfterEventUnbooked(tx, booking.pushId);
  }

  await reconcileLeadBookingStatus(tx, booking.leadId);
  await reconcileLeadLifecycle(tx, booking.leadId);
  await cancelPostBookingTasks(tx, booking.leadId);
  await cancelCommissionCollectionTasks(tx, booking.id);

  await scheduleBookingCancelledFollowUp(tx, {
    leadId: booking.leadId,
    pushId: booking.pushId,
    muaId: booking.muaId,
    muaName,
    brideName: leadRow?.brideName ?? "Lead",
    ceremonyLabel,
    actorId: params.actorId,
    isCommissionLead,
    assignedRmId: leadRow?.assignedRmId ?? null,
  });

  await appendComm(tx, {
    leadId: booking.leadId,
    muaId: booking.muaId,
    entryType: COMM.note,
    description: `Booking cancelled: ${muaName} — ${ceremonyLabel} (Rs. ${Number(booking.bookedPrice).toLocaleString("en-IN")})`,
    actorId: params.actorId,
    metadata: {
      bookingId: booking.id,
      eventId: booking.eventId,
      action: "booking_cancelled",
      reason,
    },
  });

  await insertAuditLog(tx, {
    tableName: "bookings",
    recordId: booking.id,
    action: "cancel",
    actorId: params.actorId,
    changes: { bookingId: booking.id, leadId: booking.leadId, reason },
  });

  return { leadId: booking.leadId };
}
