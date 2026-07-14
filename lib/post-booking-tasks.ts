import type { TransactionSql } from "@/db/index";
import { appendComm, generateTaskDisplayId } from "@/db/index";
import { bookingPaymentStatus } from "@/lib/booking-payment";
import {
  commissionOutstanding,
  commissionPaymentStatus,
} from "@/lib/commission-booking";
import { COMM } from "@/lib/comm-types";
import { createNotification } from "@/lib/notifications";
import { closePushAndClearTasks } from "@/lib/stage-tasks";

const POST_BOOKING_FOLLOW_UP_DAYS = 1;
const BOOKING_CANCELLED_FOLLOW_UP_DAYS = 1;

export type BookingFinancialRow = {
  bookedPrice: number;
  advancePaid: number | null;
  fullPaid: number | null;
  brideFullyPaidAt: string | null;
  commissionAmount: number | null;
  commissionPaid: number | null;
};

export function bookingFinanciallySettled(b: BookingFinancialRow): boolean {
  const brideOk =
    b.brideFullyPaidAt != null ||
    bookingPaymentStatus({
      bookedPrice: Number(b.bookedPrice),
      advancePaid: b.advancePaid,
      fullPaid: b.fullPaid,
    }) === "paid";

  const commDue = b.commissionAmount ?? 0;
  const commissionOk =
    commDue <= 0 ||
    commissionPaymentStatus({
      commissionAmount: b.commissionAmount,
      commissionPaid: b.commissionPaid,
    }) === "paid";

  return brideOk && commissionOk;
}

export function allBookingsFinanciallySettled(
  rows: BookingFinancialRow[]
): boolean {
  if (rows.length === 0) return true;
  return rows.every(bookingFinanciallySettled);
}

export function buildPostBookingTaskTitle(
  muaName: string,
  brideName: string,
  rows: BookingFinancialRow[]
): string {
  const parts: string[] = [];
  let brideDue = false;
  let commissionDue = false;
  for (const b of rows) {
    if (
      bookingPaymentStatus({
        bookedPrice: Number(b.bookedPrice),
        advancePaid: b.advancePaid,
        fullPaid: b.fullPaid,
      }) !== "paid" &&
      !b.brideFullyPaidAt
    ) {
      brideDue = true;
    }
    if (commissionOutstanding(b) > 0) commissionDue = true;
  }
  if (brideDue) parts.push("payment");
  if (commissionDue) parts.push("commission");
  const focus =
    parts.length > 0 ? ` (${parts.join(" & ")} pending)` : "";
  return `Post-booking follow-up — ${muaName} / ${brideName}${focus}`;
}

export function buildBookingCancelledTaskTitle(
  muaName: string,
  brideName: string,
  ceremonyLabel: string
): string {
  return `Booking cancelled — follow up — ${muaName} / ${brideName} (${ceremonyLabel})`;
}

async function countOpenEventsOnPush(
  tx: TransactionSql,
  pushId: string
): Promise<number> {
  const [row] = await tx<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM mua_pushes mp
    CROSS JOIN unnest(mp.event_ids) AS eid(id)
    JOIN lead_events le ON le.id = eid.id
    WHERE mp.id = ${pushId}::uuid
      AND le.status NOT IN ('booked', 'not_needed')
  `;
  return row?.n ?? 0;
}

async function isLeadFullyBooked(
  tx: TransactionSql,
  leadId: string
): Promise<boolean> {
  const [counts] = await tx<{ pending: number; booked: number }[]>`
    SELECT
      COUNT(*) FILTER (WHERE status NOT IN ('booked', 'not_needed'))::int AS pending,
      COUNT(*) FILTER (WHERE status = 'booked')::int AS booked
    FROM lead_events
    WHERE lead_id = ${leadId}::uuid
  `;
  return (counts?.pending ?? 0) === 0 && (counts?.booked ?? 0) > 0;
}

async function resolveBookingFollowUpTaskOwner(
  tx: TransactionSql,
  params: {
    isCommissionLead: boolean;
    assignedRmId: string | null;
    actorId: string;
  }
): Promise<string | null> {
  if (params.isCommissionLead) {
    const [actor] = await tx<{ id: string; role: string }[]>`
      SELECT id, role::text AS role FROM staff
      WHERE id = ${params.actorId}::uuid AND active = true
    `;
    if (actor?.role === "commission_rm") return actor.id;
    const [crm] = await tx<{ id: string }[]>`
      SELECT id FROM staff
      WHERE role = 'commission_rm'::user_role AND active = true
      ORDER BY name
      LIMIT 1
    `;
    return crm?.id ?? params.actorId;
  }
  return params.assignedRmId ?? params.actorId;
}

async function loadActiveBookings(
  tx: TransactionSql,
  leadId: string
): Promise<BookingFinancialRow[]> {
  return tx<BookingFinancialRow[]>`
    SELECT
      booked_price AS "bookedPrice",
      advance_paid AS "advancePaid",
      full_paid AS "fullPaid",
      bride_fully_paid_at AS "brideFullyPaidAt",
      commission_amount AS "commissionAmount",
      commission_paid AS "commissionPaid"
    FROM bookings
    WHERE lead_id = ${leadId}::uuid AND cancelled = false
  `;
}

/** Close leftover active pushes once every ceremony on the lead is booked. */
async function closeOutstandingPushesWhenLeadFullyBooked(
  tx: TransactionSql,
  leadId: string
): Promise<void> {
  const rows = await tx<{ id: string }[]>`
    SELECT id FROM mua_pushes
    WHERE lead_id = ${leadId}::uuid
      AND status IN ('active', 'awaiting_close')
  `;
  for (const row of rows) {
    await tx`
      UPDATE mua_pushes SET
        status = 'closed',
        outcome = 'not_selected'::push_outcome,
        closed_at = COALESCE(closed_at, NOW()),
        updated_at = NOW()
      WHERE id = ${row.id}::uuid
    `;
    await closePushAndClearTasks(tx, row.id);
  }
}

/** Cancel post-booking tasks when bride + commission payments are fully settled. */
export async function reconcilePostBookingTasksAfterPayment(
  tx: TransactionSql,
  leadId: string
): Promise<void> {
  const bookingRows = await loadActiveBookings(tx, leadId);
  if (allBookingsFinanciallySettled(bookingRows)) {
    await cancelPostBookingTasks(tx, leadId);
  }
}

export async function reschedulePostBookingFollowUp(
  tx: TransactionSql,
  params: {
    leadId: string;
    staffId: string;
    pushId: string | null;
    muaId: string | null;
    brideName: string;
    actorId: string;
    dueDate: string;
  }
): Promise<void> {
  const bookingRows = await loadActiveBookings(tx, params.leadId);
  if (allBookingsFinanciallySettled(bookingRows)) {
    await cancelPostBookingTasks(tx, params.leadId);
    return;
  }

  await cancelPostBookingTasks(tx, params.leadId);

  let muaName = "MUA";
  if (params.muaId) {
    const [mua] = await tx<{ name: string }[]>`
      SELECT name FROM muas WHERE id = ${params.muaId}::uuid
    `;
    muaName = mua?.name ?? muaName;
  } else if (params.pushId) {
    const [row] = await tx<{ name: string }[]>`
      SELECT m.name FROM mua_pushes mp
      JOIN muas m ON m.id = mp.mua_id
      WHERE mp.id = ${params.pushId}::uuid
    `;
    muaName = row?.name ?? muaName;
  }

  const title = buildPostBookingTaskTitle(muaName, params.brideName, bookingRows);
  const taskId = await generateTaskDisplayId(tx);
  await tx`
    INSERT INTO rm_tasks (
      display_id, staff_id, lead_id, push_id, task_type, title, due_date
    ) VALUES (
      ${taskId},
      ${params.staffId}::uuid,
      ${params.leadId}::uuid,
      ${params.pushId}::uuid,
      'follow_up',
      ${title},
      ${params.dueDate.trim()}::date
    )
  `;
  await appendComm(tx, {
    leadId: params.leadId,
    muaId: params.muaId,
    entryType: COMM.note,
    description: `Task rescheduled: ${title} (due ${params.dueDate.trim()})`,
    actorId: params.actorId,
  });
  await createNotification(tx, {
    userId: params.staffId,
    message: `Follow-up scheduled ${params.dueDate.trim()} — ${title}`,
    link: `/rm/tasks`,
  });
}

export interface SyncPostBookingTasksParams {
  leadId: string;
  pushId: string;
  muaId: string;
  actorId: string;
  /** Lead was in commission queue before status moved to booked. */
  isCommissionLead: boolean;
  assignedRmId: string | null;
  brideName: string;
}

/**
 * After a booking is confirmed:
 * - Winning push fully booked → cancel pending tasks for that MUA/push.
 * - Lead fully booked → cancel all pending lead tasks; optionally create post-booking follow-up.
 */
/** Cancel auto-created post-booking follow-ups when a booking is reversed. */
export async function cancelPostBookingTasks(
  tx: TransactionSql,
  leadId: string
): Promise<void> {
  await tx`
    UPDATE rm_tasks
    SET status = 'cancelled', updated_at = NOW()
    WHERE lead_id = ${leadId}::uuid
      AND status = 'pending'
      AND title LIKE 'Post-booking follow-up%'
  `;
}

export interface ScheduleBookingCancelledFollowUpParams {
  leadId: string;
  pushId: string | null;
  muaId: string;
  muaName: string;
  brideName: string;
  ceremonyLabel: string;
  actorId: string;
  isCommissionLead: boolean;
  assignedRmId: string | null;
}

/** Create RM follow-up after a booking is cancelled so pipeline work can resume. */
export async function scheduleBookingCancelledFollowUp(
  tx: TransactionSql,
  params: ScheduleBookingCancelledFollowUpParams
): Promise<void> {
  const staffId = await resolveBookingFollowUpTaskOwner(tx, {
    isCommissionLead: params.isCommissionLead,
    assignedRmId: params.assignedRmId,
    actorId: params.actorId,
  });
  if (!staffId) return;

  const title = buildBookingCancelledTaskTitle(
    params.muaName,
    params.brideName,
    params.ceremonyLabel
  );

  await tx`
    UPDATE rm_tasks
    SET status = 'cancelled', updated_at = NOW()
    WHERE lead_id = ${params.leadId}::uuid
      AND status = 'pending'
      AND title LIKE 'Booking cancelled — follow up%'
  `;

  const taskId = await generateTaskDisplayId(tx);
  await tx`
    INSERT INTO rm_tasks (
      display_id, staff_id, lead_id, push_id, task_type, title, due_date
    ) VALUES (
      ${taskId},
      ${staffId}::uuid,
      ${params.leadId}::uuid,
      ${params.pushId}::uuid,
      'follow_up',
      ${title},
      (CURRENT_DATE + ${BOOKING_CANCELLED_FOLLOW_UP_DAYS}::integer)
    )
  `;

  await appendComm(tx, {
    leadId: params.leadId,
    muaId: params.muaId,
    entryType: COMM.note,
    description: `Task auto-created: ${title}`,
    actorId: params.actorId,
  });
  await createNotification(tx, {
    userId: staffId,
    message: `New task: ${title}`,
    link: `/rm/tasks`,
  });
}

export async function syncPostBookingTasks(
  tx: TransactionSql,
  params: SyncPostBookingTasksParams
): Promise<void> {
  const openOnWinner = await countOpenEventsOnPush(tx, params.pushId);
  if (openOnWinner === 0) {
    await closePushAndClearTasks(tx, params.pushId);
  }

  const fullyBooked = await isLeadFullyBooked(tx, params.leadId);
  if (!fullyBooked) return;

  await closeOutstandingPushesWhenLeadFullyBooked(tx, params.leadId);

  await tx`
    UPDATE rm_tasks
    SET status = 'cancelled', updated_at = NOW()
    WHERE lead_id = ${params.leadId}::uuid AND status = 'pending'
  `;

  const bookingRows = await loadActiveBookings(tx, params.leadId);
  if (allBookingsFinanciallySettled(bookingRows)) return;

  const staffId = await resolveBookingFollowUpTaskOwner(tx, {
    isCommissionLead: params.isCommissionLead,
    assignedRmId: params.assignedRmId,
    actorId: params.actorId,
  });
  if (!staffId) return;

  const [mua] = await tx<{ name: string }[]>`
    SELECT name FROM muas WHERE id = ${params.muaId}::uuid
  `;
  const muaName = mua?.name ?? "MUA";
  const title = buildPostBookingTaskTitle(muaName, params.brideName, bookingRows);
  const taskId = await generateTaskDisplayId(tx);

  await tx`
    INSERT INTO rm_tasks (
      display_id, staff_id, lead_id, push_id, task_type, title, due_date
    ) VALUES (
      ${taskId},
      ${staffId}::uuid,
      ${params.leadId}::uuid,
      ${params.pushId}::uuid,
      'follow_up',
      ${title},
      (CURRENT_DATE + ${POST_BOOKING_FOLLOW_UP_DAYS}::integer)
    )
  `;

  await appendComm(tx, {
    leadId: params.leadId,
    muaId: params.muaId,
    entryType: COMM.note,
    description: `Task auto-created: ${title}`,
    actorId: params.actorId,
  });
  await createNotification(tx, {
    userId: staffId,
    message: `New task: ${title}`,
    link: `/rm/tasks`,
  });
}
