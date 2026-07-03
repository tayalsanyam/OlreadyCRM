import type { TransactionSql } from "@/db/index";
import { appendComm, generateTaskDisplayId } from "@/db/index";
import { COMM } from "@/lib/comm-types";
import {
  commissionOverdueDate,
  commissionPaymentStatus,
  commissionSlaDueDate,
} from "@/lib/commission-booking";
import { toDateOnly } from "@/lib/date-only";
import { createNotification } from "@/lib/notifications";
import { leadTracksCommissionSync } from "@/lib/lead-tracks-commission";

export type CommissionTaskKind = "sla" | "overdue" | "follow_up";

const KIND_LABEL: Record<CommissionTaskKind, string> = {
  sla: "7-day SLA",
  overdue: "OVERDUE",
  follow_up: "follow-up",
};

export function commissionCollectionBookingTag(bookingId: string): string {
  return `[bk:${bookingId}]`;
}

export function commissionCollectionTaskTitle(
  kind: CommissionTaskKind,
  bookingId: string,
  muaName: string,
  brideName: string,
  ceremonyLabel: string
): string {
  return `Collect commission — ${KIND_LABEL[kind]} — ${commissionCollectionBookingTag(bookingId)} — ${muaName} / ${brideName} (${ceremonyLabel})`;
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

async function resolveCommissionTaskOwner(
  tx: TransactionSql,
  params: {
    isCommissionLead: boolean;
    assignedRmId: string | null;
    actorId: string;
    pushedBy: string | null;
  }
): Promise<string | null> {
  if (params.pushedBy) {
    const [pusher] = await tx<{ id: string; role: string }[]>`
      SELECT id, role::text AS role FROM staff
      WHERE id = ${params.pushedBy}::uuid AND active = true
    `;
    if (pusher?.role === "commission_rm") return pusher.id;
  }
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

async function hasPendingCommissionTask(
  tx: TransactionSql,
  bookingId: string,
  kind: CommissionTaskKind
): Promise<boolean> {
  const tag = commissionCollectionBookingTag(bookingId);
  const label = KIND_LABEL[kind];
  const [row] = await tx<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM rm_tasks
    WHERE status = 'pending'
      AND title LIKE ${"%" + tag + "%"}
      AND title LIKE ${"Collect commission — " + label + "%"}
  `;
  return (row?.n ?? 0) > 0;
}

export async function cancelCommissionCollectionTasks(
  tx: TransactionSql,
  bookingId: string
): Promise<void> {
  const tag = commissionCollectionBookingTag(bookingId);
  await tx`
    UPDATE rm_tasks
    SET status = 'cancelled', updated_at = NOW()
    WHERE status = 'pending'
      AND title LIKE ${"%" + tag + "%"}
      AND title LIKE 'Collect commission%'
  `;
}

async function createCommissionCollectionTask(
  tx: TransactionSql,
  params: {
    bookingId: string;
    leadId: string;
    pushId: string | null;
    staffId: string;
    kind: CommissionTaskKind;
    dueDate: string;
    muaName: string;
    brideName: string;
    ceremonyLabel: string;
    actorId: string;
    notify?: boolean;
  }
): Promise<boolean> {
  if (await hasPendingCommissionTask(tx, params.bookingId, params.kind)) {
    return false;
  }

  const title = commissionCollectionTaskTitle(
    params.kind,
    params.bookingId,
    params.muaName,
    params.brideName,
    params.ceremonyLabel
  );
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
      ${params.dueDate}::date
    )
  `;
  await appendComm(tx, {
    leadId: params.leadId,
    entryType: COMM.note,
    description: `Task scheduled: ${title} (due ${params.dueDate})`,
    actorId: params.actorId,
  });
  const shouldNotify = params.notify ?? params.dueDate <= todayDateOnly();
  if (shouldNotify) {
    await createNotification(tx, {
      userId: params.staffId,
      message: `New task: ${title}`,
      link: `/rm/tasks`,
    });
  }
  return true;
}

type ScheduleParams = {
  bookingId: string;
  leadId: string;
  pushId: string | null;
  bookingDate: string;
  commissionAmount: number | null;
  commissionPaid: number | null;
  muaName: string;
  brideName: string;
  ceremonyLabel: string;
  isCommissionLead: boolean;
  assignedRmId: string | null;
  pushedBy: string | null;
  actorId: string;
};

/** Schedule 7-day SLA and 30-day overdue tasks with future due dates — no cron needed. */
async function scheduleCommissionCollectionTasks(
  tx: TransactionSql,
  params: ScheduleParams
): Promise<void> {
  const due = params.commissionAmount ?? 0;
  if (due <= 0) return;
  if (commissionPaymentStatus(params) === "paid") return;

  const bookDate = toDateOnly(params.bookingDate);
  if (!bookDate) return;

  const slaDate = commissionSlaDueDate(bookDate);
  const overdueDate = commissionOverdueDate(bookDate);
  if (!slaDate || !overdueDate) return;

  await tx`
    UPDATE bookings SET
      commission_next_follow_up_at = COALESCE(commission_next_follow_up_at, ${slaDate}::date)
    WHERE id = ${params.bookingId}::uuid
  `;

  const staffId = await resolveCommissionTaskOwner(tx, {
    isCommissionLead: params.isCommissionLead,
    assignedRmId: params.assignedRmId,
    actorId: params.actorId,
    pushedBy: params.pushedBy,
  });
  if (!staffId) return;

  const base = {
    bookingId: params.bookingId,
    leadId: params.leadId,
    pushId: params.pushId,
    staffId,
    muaName: params.muaName,
    brideName: params.brideName,
    ceremonyLabel: params.ceremonyLabel,
    actorId: params.actorId,
  };

  await createCommissionCollectionTask(tx, {
    ...base,
    kind: "sla",
    dueDate: slaDate,
    notify: false,
  });
  await createCommissionCollectionTask(tx, {
    ...base,
    kind: "overdue",
    dueDate: overdueDate,
    notify: false,
  });
}

export async function scheduleCommissionCollectionOnBooking(
  tx: TransactionSql,
  params: ScheduleParams
): Promise<void> {
  await scheduleCommissionCollectionTasks(tx, params);
}

/** Backfill tasks for legacy bookings when commission RM opens bookings/tasks. */
export async function ensureCommissionCollectionTasks(
  tx: TransactionSql,
  options: { role: string; userId: string }
): Promise<void> {
  if (
    options.role !== "commissionRm" &&
    options.role !== "admin" &&
    options.role !== "owner"
  ) {
    return;
  }

  let roleFilter = tx``;
  if (options.role === "commissionRm") {
    roleFilter = tx`
      AND (
        bl.shifted_at IS NOT NULL
        OR bl.status = 'commission_rm'
        OR mp.pushed_by = ${options.userId}::uuid
      )
    `;
  }

  const rows = await tx<
    {
      id: string;
      leadId: string;
      pushId: string | null;
      bookingDate: string;
      commissionAmount: number | null;
      commissionPaid: number | null;
      brideName: string;
      muaName: string;
      ceremonyType: string;
      shiftedAt: string | null;
      leadStatus: string;
      assignedRmId: string | null;
      pushedBy: string | null;
    }[]
  >`
    SELECT
      b.id,
      b.lead_id AS "leadId",
      b.push_id AS "pushId",
      b.booking_date::text AS "bookingDate",
      b.commission_amount AS "commissionAmount",
      b.commission_paid AS "commissionPaid",
      bl.bride_name AS "brideName",
      m.name AS "muaName",
      le.ceremony_type AS "ceremonyType",
      bl.shifted_at AS "shiftedAt",
      bl.status::text AS "leadStatus",
      bl.assigned_rm_id AS "assignedRmId",
      mp.pushed_by AS "pushedBy"
    FROM bookings b
    JOIN bride_leads bl ON bl.id = b.lead_id
    JOIN lead_events le ON le.id = b.event_id
    JOIN muas m ON m.id = b.mua_id
    LEFT JOIN mua_pushes mp ON mp.id = b.push_id
    WHERE COALESCE(b.cancelled, false) = false
      AND b.commission_amount IS NOT NULL
      AND b.commission_amount > 0
      AND COALESCE(b.commission_paid, 0) < b.commission_amount
      AND (bl.shifted_at IS NOT NULL OR bl.status = 'commission_rm')
    ${roleFilter}
  `;

  for (const row of rows) {
    if (!leadTracksCommissionSync({ shiftedAt: row.shiftedAt, status: row.leadStatus })) {
      continue;
    }
    await scheduleCommissionCollectionTasks(tx, {
      bookingId: row.id,
      leadId: row.leadId,
      pushId: row.pushId,
      bookingDate: row.bookingDate,
      commissionAmount: row.commissionAmount,
      commissionPaid: row.commissionPaid,
      muaName: row.muaName,
      brideName: row.brideName,
      ceremonyLabel: row.ceremonyType,
      isCommissionLead: true,
      assignedRmId: row.assignedRmId,
      pushedBy: row.pushedBy,
      actorId: options.userId,
    });
  }
}

export async function syncCommissionCollectionAfterPayment(
  tx: TransactionSql,
  params: {
    bookingId: string;
    leadId: string;
    pushId: string | null;
    bookingDate: string;
    commissionAmount: number | null;
    commissionPaid: number | null;
    commissionNextFollowUpAt: string | null;
    muaName: string;
    brideName: string;
    ceremonyLabel: string;
    isCommissionLead: boolean;
    assignedRmId: string | null;
    pushedBy: string | null;
    actorId: string;
    scheduleFollowUpTask?: boolean;
  }
): Promise<void> {
  if (commissionPaymentStatus(params) === "paid") {
    await cancelCommissionCollectionTasks(tx, params.bookingId);
    await tx`
      UPDATE bookings SET commission_next_follow_up_at = NULL
      WHERE id = ${params.bookingId}::uuid
    `;
    return;
  }

  if (!params.scheduleFollowUpTask) return;

  const followUp = params.commissionNextFollowUpAt
    ? toDateOnly(params.commissionNextFollowUpAt)
    : null;
  if (!followUp) {
    await tx`
      UPDATE bookings SET commission_next_follow_up_at = NULL
      WHERE id = ${params.bookingId}::uuid
    `;
    const tag = commissionCollectionBookingTag(params.bookingId);
    await tx`
      UPDATE rm_tasks
      SET status = 'cancelled', updated_at = NOW()
      WHERE status = 'pending'
        AND title LIKE ${"%" + tag + "%"}
        AND title LIKE 'Collect commission — follow-up%'
    `;
    return;
  }

  await tx`
    UPDATE bookings SET commission_next_follow_up_at = ${followUp}::date
    WHERE id = ${params.bookingId}::uuid
  `;

  const staffId = await resolveCommissionTaskOwner(tx, {
    isCommissionLead: params.isCommissionLead,
    assignedRmId: params.assignedRmId,
    actorId: params.actorId,
    pushedBy: params.pushedBy,
  });
  if (!staffId) return;

  const tag = commissionCollectionBookingTag(params.bookingId);
  await tx`
    UPDATE rm_tasks
    SET status = 'cancelled', updated_at = NOW()
    WHERE status = 'pending'
      AND title LIKE ${"%" + tag + "%"}
      AND title LIKE 'Collect commission — follow-up%'
  `;

  await createCommissionCollectionTask(tx, {
    bookingId: params.bookingId,
    leadId: params.leadId,
    pushId: params.pushId,
    staffId,
    kind: "follow_up",
    dueDate: followUp,
    muaName: params.muaName,
    brideName: params.brideName,
    ceremonyLabel: params.ceremonyLabel,
    actorId: params.actorId,
    notify: followUp <= todayDateOnly(),
  });
}
