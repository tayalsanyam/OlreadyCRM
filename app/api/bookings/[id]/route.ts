import { NextResponse } from "next/server";
import { sql, withTransaction, appendComm, insertAuditLog } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { cancelBooking } from "@/lib/booking";
import {
  commissionAmountPaid,
  commissionPaymentStatus,
  resolveBrideFullyPaidAt,
} from "@/lib/commission-booking";
import { syncCommissionCollectionAfterPayment } from "@/lib/commission-collection-tasks";
import { reconcilePostBookingTasksAfterPayment } from "@/lib/post-booking-tasks";
import { bookingAmountPaid } from "@/lib/booking-payment";
import { canAccessLead, getLeadForAccess } from "@/lib/lead-access";
import { leadTracksCommission } from "@/lib/lead-commission";
import { COMM } from "@/lib/comm-types";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import type { PaymentMode } from "@/lib/types";

const PAYMENT_MODES: PaymentMode[] = [
  "upi",
  "cash",
  "bank_transfer",
  "card",
  "other",
];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: bookingId } = await params;
  const body = (await request.json()) as {
    advancePaid?: number | null;
    fullPaid?: number | null;
    paymentMode?: PaymentMode | null;
    zohoInvoiceRef?: string | null;
    commissionPaid?: number | null;
    commissionAmount?: number | null;
    commissionPaymentMode?: PaymentMode | null;
    commissionNextFollowUpAt?: string | null;
    dismissBridePayment?: boolean;
  };

  if (
    body.paymentMode != null &&
    !PAYMENT_MODES.includes(body.paymentMode)
  ) {
    return NextResponse.json(
      { data: null, error: "Invalid payment mode" },
      { status: 400 }
    );
  }
  if (
    body.commissionPaymentMode != null &&
    !PAYMENT_MODES.includes(body.commissionPaymentMode)
  ) {
    return NextResponse.json(
      { data: null, error: "Invalid commission payment mode" },
      { status: 400 }
    );
  }

  if (USE_MOCK) {
    try {
      const updated = mockStore.updateBookingPayment(bookingId, body, auth.session);
      if (!updated) {
        return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ data: updated, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Update failed";
      return NextResponse.json({ data: null, error: message }, { status: 400 });
    }
  }

  const [existing] = await sql<
    {
      leadId: string;
      pushId: string | null;
      bookedPrice: number;
      bookingDate: string;
      ceremonyType: string;
      commissionAmount: number | null;
      commissionPaid: number | null;
      commissionNextFollowUpAt: string | null;
      advancePaid: number | null;
      fullPaid: number | null;
      paymentMode: PaymentMode | null;
      zohoInvoiceRef: string | null;
      commissionPaymentMode: PaymentMode | null;
      brideFullyPaidAt: string | null;
      muaName: string;
      brideName: string;
      shiftedAt: string | null;
      leadStatus: string;
      assignedRmId: string | null;
      pushedBy: string | null;
    }[]
  >`
    SELECT
      b.lead_id,
      b.push_id,
      b.booked_price,
      b.booking_date::text AS "bookingDate",
      le.ceremony_type,
      b.commission_amount,
      b.commission_paid,
      b.commission_next_follow_up_at::text AS "commissionNextFollowUpAt",
      b.advance_paid AS "advancePaid",
      b.full_paid AS "fullPaid",
      b.payment_mode AS "paymentMode",
      b.zoho_invoice_ref AS "zohoInvoiceRef",
      b.commission_payment_mode AS "commissionPaymentMode",
      b.bride_fully_paid_at,
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

  if (!existing) {
    return NextResponse.json({ data: null, error: "Booking not found" }, { status: 404 });
  }

  const lead = await getLeadForAccess(existing.leadId);
  if (!lead || !canAccessLead(auth.session, lead)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

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
  const commissionPaymentMode =
    body.commissionPaymentMode !== undefined
      ? body.commissionPaymentMode
      : existing.commissionPaymentMode;

  if (advancePaid != null && advancePaid < 0) {
    return NextResponse.json({ data: null, error: "Invalid advance" }, { status: 400 });
  }
  if (fullPaid != null && fullPaid < 0) {
    return NextResponse.json({ data: null, error: "Invalid balance" }, { status: 400 });
  }

  const paid = (advancePaid ?? 0) + (fullPaid ?? 0);
  if (paid > Number(existing.bookedPrice)) {
    return NextResponse.json(
      { data: null, error: "Advance + balance cannot exceed booked price" },
      { status: 400 }
    );
  }

  const leadTracks = await leadTracksCommission(existing.leadId);
  const elevated =
    auth.session.role === "admin" || auth.session.role === "owner";
  const allowCommission =
    leadTracks ||
    (elevated &&
      (existing.commissionAmount != null ||
        body.commissionAmount !== undefined ||
        body.commissionPaid !== undefined));
  const commissionAmount =
    body.commissionAmount !== undefined ? body.commissionAmount : undefined;
  const commissionPaid =
    body.commissionPaid !== undefined ? body.commissionPaid : undefined;

  if (allowCommission && commissionAmount != null && commissionAmount < 0) {
    return NextResponse.json(
      { data: null, error: "Invalid commission due" },
      { status: 400 }
    );
  }

  const effectiveCommissionDue =
    commissionAmount !== undefined
      ? commissionAmount
      : existing.commissionAmount != null
        ? Number(existing.commissionAmount)
        : null;

  if (
    allowCommission &&
    commissionPaid != null &&
    effectiveCommissionDue != null &&
    commissionPaid > effectiveCommissionDue
  ) {
    return NextResponse.json(
      { data: null, error: "Commission received cannot exceed commission due" },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  let brideFullyPaidAt: string | null;
  if (body.dismissBridePayment) {
    const effectivePaid =
      commissionPaid !== undefined
        ? commissionPaid ?? 0
        : existing.commissionPaid != null
          ? Number(existing.commissionPaid)
          : 0;
    const effectiveDue =
      commissionAmount !== undefined
        ? commissionAmount ?? 0
        : existing.commissionAmount != null
          ? Number(existing.commissionAmount)
          : 0;
    if (effectiveDue > 0 && effectivePaid < effectiveDue) {
      return NextResponse.json(
        {
          data: null,
          error: "Clear Olready commission before closing bride payment tracking",
        },
        { status: 400 }
      );
    }
    brideFullyPaidAt = existing.brideFullyPaidAt ?? nowIso;
  } else {
    brideFullyPaidAt = resolveBrideFullyPaidAt(
      {
        bookedPrice: Number(existing.bookedPrice),
        advancePaid,
        fullPaid,
        brideFullyPaidAt: existing.brideFullyPaidAt,
      },
      nowIso
    );
  }

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
    (commissionPaid !== undefined ||
      commissionAmount !== undefined ||
      body.commissionPaymentMode !== undefined);

  const brideFieldsTouched =
    body.advancePaid !== undefined ||
    body.fullPaid !== undefined ||
    body.paymentMode !== undefined ||
    body.zohoInvoiceRef !== undefined ||
    body.dismissBridePayment === true;

  const commissionNextFollowUpAt =
    body.commissionNextFollowUpAt !== undefined
      ? body.commissionNextFollowUpAt?.trim() || null
      : undefined;
  const touchCommissionFollowUp = commissionNextFollowUpAt !== undefined;
  const commissionFollowUpDate = commissionNextFollowUpAt ?? null;

  await withTransaction(async (tx) => {
    if (commissionFieldsTouched) {
      if (commissionPaid !== undefined) {
        await tx`
          UPDATE bookings SET
            advance_paid = CASE WHEN ${brideFieldsTouched} THEN ${advancePaid} ELSE advance_paid END,
            full_paid = CASE WHEN ${brideFieldsTouched} THEN ${fullPaid} ELSE full_paid END,
            payment_mode = CASE WHEN ${brideFieldsTouched} THEN ${paymentMode} ELSE payment_mode END,
            zoho_invoice_ref = CASE WHEN ${brideFieldsTouched} THEN ${zohoInvoiceRef} ELSE zoho_invoice_ref END,
            bride_fully_paid_at = ${brideFullyPaidAt},
            commission_amount = COALESCE(${commissionAmount ?? null}, commission_amount),
            commission_paid = ${commissionPaid},
            commission_paid_at = ${commissionPaidAt ?? null},
            commission_payment_mode = COALESCE(${commissionPaymentMode}, commission_payment_mode),
            commission_next_follow_up_at = CASE
              WHEN ${touchCommissionFollowUp}
                THEN ${commissionFollowUpDate}::date
              ELSE commission_next_follow_up_at
            END
          WHERE id = ${bookingId}::uuid
        `;
      } else {
        await tx`
          UPDATE bookings SET
            advance_paid = CASE WHEN ${brideFieldsTouched} THEN ${advancePaid} ELSE advance_paid END,
            full_paid = CASE WHEN ${brideFieldsTouched} THEN ${fullPaid} ELSE full_paid END,
            payment_mode = CASE WHEN ${brideFieldsTouched} THEN ${paymentMode} ELSE payment_mode END,
            zoho_invoice_ref = CASE WHEN ${brideFieldsTouched} THEN ${zohoInvoiceRef} ELSE zoho_invoice_ref END,
            bride_fully_paid_at = ${brideFullyPaidAt},
            commission_amount = ${commissionAmount},
            commission_payment_mode = COALESCE(${commissionPaymentMode}, commission_payment_mode),
            commission_next_follow_up_at = CASE
              WHEN ${touchCommissionFollowUp}
                THEN ${commissionFollowUpDate}::date
              ELSE commission_next_follow_up_at
            END
          WHERE id = ${bookingId}::uuid
        `;
      }
    } else if (brideFieldsTouched || touchCommissionFollowUp) {
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
        WHERE id = ${bookingId}::uuid
      `;
    }

    const [row] = await tx<
      { advancePaid: number | null; fullPaid: number | null; bookedPrice: number }[]
    >`
      SELECT advance_paid, full_paid, booked_price FROM bookings WHERE id = ${bookingId}::uuid
    `;

    const total = row ? bookingAmountPaid(row) : 0;
    await appendComm(tx, {
      leadId: existing.leadId,
      entryType: COMM.note,
      description: `Bride payment updated for ${existing.ceremonyType}: Rs. ${total.toLocaleString("en-IN")} of Rs. ${Number(existing.bookedPrice).toLocaleString("en-IN")}`,
      actorId: auth.session.userId,
      metadata: { bookingId, action: "payment_updated" },
    });

    if (allowCommission && commissionPaid !== undefined && effectiveCommissionDue != null) {
      await appendComm(tx, {
        leadId: existing.leadId,
        entryType: COMM.note,
        description: `Commission from MUA for ${existing.ceremonyType}: Rs. ${commissionAmountPaid({ commissionPaid }).toLocaleString("en-IN")} of Rs. ${effectiveCommissionDue.toLocaleString("en-IN")}`,
        actorId: auth.session.userId,
        metadata: { bookingId, action: "commission_payment_updated" },
      });
    } else if (allowCommission && commissionAmount != null) {
      await appendComm(tx, {
        leadId: existing.leadId,
        entryType: COMM.note,
        description: `Commission due set for ${existing.ceremonyType}: Rs. ${commissionAmount.toLocaleString("en-IN")}`,
        actorId: auth.session.userId,
        metadata: { bookingId, action: "commission_amount_set" },
      });
    }

    await insertAuditLog(tx, {
      tableName: "bookings",
      recordId: bookingId,
      action: "update_payment",
      actorId: auth.session.userId,
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
        bookingId,
        leadId: existing.leadId,
        pushId: existing.pushId,
        bookingDate: existing.bookingDate,
        commissionAmount: effectiveDue,
        commissionPaid: effectivePaid,
        commissionNextFollowUpAt: followUp,
        muaName: existing.muaName,
        brideName: existing.brideName,
        ceremonyLabel: existing.ceremonyType,
        isCommissionLead:
          existing.shiftedAt != null || existing.leadStatus === "commission_rm",
        assignedRmId: existing.assignedRmId,
        pushedBy: existing.pushedBy,
        actorId: auth.session.userId,
        scheduleFollowUpTask: commissionNextFollowUpAt !== undefined,
      });
    }

    await reconcilePostBookingTasksAfterPayment(tx, existing.leadId);
  });

  const [updated] = await sql`
    SELECT * FROM bookings WHERE id = ${bookingId}::uuid
  `;

  return NextResponse.json({ data: updated, error: null });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: bookingId } = await params;

  if (USE_MOCK) {
    const result = mockStore.cancelBooking({
      bookingId,
      actorId: auth.session.userId,
      actorName: auth.session.name,
    });
    if (!result) {
      return NextResponse.json({ data: null, error: "Booking not found" }, { status: 404 });
    }
    return NextResponse.json({ data: result, error: null });
  }

  const [row] = await sql<{ leadId: string }[]>`
    SELECT lead_id FROM bookings WHERE id = ${bookingId}::uuid
  `;
  if (!row) {
    return NextResponse.json({ data: null, error: "Booking not found" }, { status: 404 });
  }

  const lead = await getLeadForAccess(row.leadId);
  if (!lead || !canAccessLead(auth.session, lead)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const result = await withTransaction((tx) =>
    cancelBooking(tx, {
      bookingId,
      actorId: auth.session.userId,
      reason: "Deleted via API",
    })
  );

  if (!result) {
    return NextResponse.json({ data: null, error: "Booking not found" }, { status: 404 });
  }

  return NextResponse.json({ data: result, error: null });
}
