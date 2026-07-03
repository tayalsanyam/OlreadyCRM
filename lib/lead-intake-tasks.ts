import type { TransactionSql } from "@/db/index";
import {
  appendComm,
  generateTaskDisplayId,
} from "@/db/index";
import { COMM } from "@/lib/comm-types";
import { LEAD_EXIT_LABELS, toDbExitMarkedByRole } from "@/lib/lead-exit";
import { refreshLeadPhase } from "@/lib/lead-phase";
import { createNotification } from "@/lib/notifications";
import { scheduleUploaderReviewTask } from "@/lib/uploader-review-task";
import { scheduleInitialContactTask } from "@/lib/stage-tasks";
import { findPendingMuaTaskConflict } from "@/lib/task-duplicates";
import {
  INTAKE_IDLE_DAYS,
  INTAKE_MIN_PROFILES,
  LEAD_INTAKE_TASK_TYPES,
  MAX_CONFIRMATION_NO_ANSWER_ATTEMPTS,
} from "@/lib/lead-intake-config";

export {
  INTAKE_IDLE_DAYS,
  INTAKE_MIN_PROFILES,
  LEAD_INTAKE_TASK_TYPES,
  MAX_CONFIRMATION_NO_ANSWER_ATTEMPTS,
} from "@/lib/lead-intake-config";
export type { LeadConfirmationStatus } from "@/lib/lead-intake-config";

export async function countActiveDistinctMuasPushed(
  tx: TransactionSql,
  leadId: string
): Promise<number> {
  const [row] = await tx<{ count: number }[]>`
    SELECT COUNT(DISTINCT mua_id)::int AS count
    FROM mua_pushes
    WHERE lead_id = ${leadId}::uuid
      AND status NOT IN ('closed', 'booked')
  `;
  return row?.count ?? 0;
}

/** Intake profile count — only pushes since current owner took the lead. */
export async function countActiveDistinctMuasPushedForIntake(
  tx: TransactionSql,
  leadId: string
): Promise<number> {
  const [row] = await tx<{ count: number }[]>`
    SELECT COUNT(DISTINCT mp.mua_id)::int AS count
    FROM mua_pushes mp
    JOIN bride_leads bl ON bl.id = mp.lead_id
    WHERE mp.lead_id = ${leadId}::uuid
      AND mp.status NOT IN ('closed', 'booked')
      AND (
        bl.owner_assigned_at IS NULL
        OR mp.created_at >= bl.owner_assigned_at
      )
  `;
  return row?.count ?? 0;
}

export async function shouldGateInitialContact(
  tx: TransactionSql,
  leadId: string
): Promise<boolean> {
  const [lead] = await tx<{ confirmationStatus: string }[]>`
    SELECT confirmation_status AS "confirmationStatus"
    FROM bride_leads
    WHERE id = ${leadId}::uuid
  `;
  if (lead?.confirmationStatus !== "confirmed") return true;
  const count = await countActiveDistinctMuasPushedForIntake(tx, leadId);
  return count < INTAKE_MIN_PROFILES;
}

/**
 * After intake gate lifts, backfill initial-contact tasks for pushes that were
 * created while gated (e.g. MUAs 1–3 when only the 4th push triggered scheduling).
 */
export async function reconcileInitialContactTasksForLead(
  tx: TransactionSql,
  params: {
    leadId: string;
    staffId: string;
    actorId: string;
  }
): Promise<number> {
  if (await shouldGateInitialContact(tx, params.leadId)) return 0;

  const [lead] = await tx<{ brideName: string }[]>`
    SELECT bride_name AS "brideName"
    FROM bride_leads
    WHERE id = ${params.leadId}::uuid
  `;
  if (!lead) return 0;

  const pushes = await tx<
    { pushId: string; muaId: string; muaName: string }[]
  >`
    SELECT
      mp.id AS "pushId",
      mp.mua_id AS "muaId",
      m.name AS "muaName"
    FROM mua_pushes mp
    JOIN muas m ON m.id = mp.mua_id
    JOIN bride_leads bl ON bl.id = mp.lead_id
    WHERE mp.lead_id = ${params.leadId}::uuid
      AND mp.status NOT IN ('closed', 'booked')
      AND mp.stage = 'initial_contact'
      AND (
        bl.owner_assigned_at IS NULL
        OR mp.created_at >= bl.owner_assigned_at
      )
      AND NOT EXISTS (
        SELECT 1
        FROM rm_tasks t
        WHERE t.push_id = mp.id
          AND t.status = 'pending'
      )
    ORDER BY mp.created_at ASC
  `;

  let created = 0;
  for (const push of pushes) {
    const conflict = await findPendingMuaTaskConflict(tx, {
      leadId: params.leadId,
      pushId: push.pushId,
    });
    if (conflict) continue;

    const ok = await scheduleInitialContactTask(tx, {
      pushId: push.pushId,
      leadId: params.leadId,
      muaId: push.muaId,
      muaName: push.muaName,
      brideName: lead.brideName,
      staffId: params.staffId,
      actorId: params.actorId,
    });
    if (ok) created += 1;
  }
  return created;
}

export async function cancelPendingLeadIntakeTasks(
  tx: TransactionSql,
  params: { leadId: string; excludeTaskId?: string }
): Promise<void> {
  await tx`
    UPDATE rm_tasks
    SET status = 'cancelled', updated_at = NOW()
    WHERE lead_id = ${params.leadId}::uuid
      AND status = 'pending'
      AND task_type::text = ANY(${LEAD_INTAKE_TASK_TYPES})
      ${params.excludeTaskId ? tx`AND id != ${params.excludeTaskId}::uuid` : tx``}
  `;
}

async function hasPendingIntakeTask(
  tx: TransactionSql,
  leadId: string,
  taskType: (typeof LEAD_INTAKE_TASK_TYPES)[number],
  excludeTaskId?: string
): Promise<boolean> {
  const [row] = await tx<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM rm_tasks
      WHERE lead_id = ${leadId}::uuid
        AND status = 'pending'
        AND task_type = ${taskType}::task_type
        ${excludeTaskId ? tx`AND id != ${excludeTaskId}::uuid` : tx``}
    ) AS exists
  `;
  return row?.exists ?? false;
}

export async function scheduleBrideConfirmationTask(
  tx: TransactionSql,
  params: {
    leadId: string;
    staffId: string;
    brideName: string;
    displayId: string;
    actorId?: string | null;
    dueDays?: number;
    dueDate?: string | null;
    excludeTaskId?: string;
  }
): Promise<string | null> {
  if (
    await hasPendingIntakeTask(
      tx,
      params.leadId,
      "bride_confirmation",
      params.excludeTaskId
    )
  ) {
    return null;
  }

  const title = `Call bride — confirm requirements — ${params.brideName} (${params.displayId})`;
  const taskId = await generateTaskDisplayId(tx);
  const dueDate =
    params.dueDate?.trim() ||
    null;

  if (dueDate) {
    await tx`
      INSERT INTO rm_tasks (
        display_id, staff_id, lead_id, task_type, title, due_date, status
      ) VALUES (
        ${taskId},
        ${params.staffId}::uuid,
        ${params.leadId}::uuid,
        'bride_confirmation',
        ${title},
        ${dueDate}::date,
        'pending'
      )
    `;
  } else {
    const dueDays = params.dueDays ?? 1;
    await tx`
      INSERT INTO rm_tasks (
        display_id, staff_id, lead_id, task_type, title, due_date, status
      ) VALUES (
        ${taskId},
        ${params.staffId}::uuid,
        ${params.leadId}::uuid,
        'bride_confirmation',
        ${title},
        (CURRENT_DATE + ${dueDays}::integer),
        'pending'
      )
    `;
  }

  if (params.actorId) {
    await appendComm(tx, {
      leadId: params.leadId,
      entryType: COMM.note,
      description: `Task auto-created: ${title}`,
      actorId: params.actorId,
    });
  }

  await createNotification(tx, {
    userId: params.staffId,
    message: `New task: ${title}`,
    link: `/rm/tasks`,
  });

  return taskId;
}

export async function scheduleShareProfilesTask(
  tx: TransactionSql,
  params: {
    leadId: string;
    staffId: string;
    brideName: string;
    displayId: string;
    actorId?: string | null;
    dueDays?: number;
    /** Always schedule (e.g. commission handover restarts share-4). */
    force?: boolean;
  }
): Promise<string | null> {
  const count = await countActiveDistinctMuasPushedForIntake(tx, params.leadId);
  if (!params.force && count >= INTAKE_MIN_PROFILES) return null;
  if (await hasPendingIntakeTask(tx, params.leadId, "share_profiles")) {
    return null;
  }

  const title = `Share min ${INTAKE_MIN_PROFILES} profiles — ${params.brideName} (${params.displayId})`;
  const taskId = await generateTaskDisplayId(tx);
  const dueDays = params.dueDays ?? 2;

  await tx`
    INSERT INTO rm_tasks (
      display_id, staff_id, lead_id, task_type, title, due_date, status
    ) VALUES (
      ${taskId},
      ${params.staffId}::uuid,
      ${params.leadId}::uuid,
      'share_profiles',
      ${title},
      (CURRENT_DATE + ${dueDays}::integer),
      'pending'
    )
  `;

  if (params.actorId) {
    await appendComm(tx, {
      leadId: params.leadId,
      entryType: COMM.note,
      description: `Task auto-created: ${title} (${count}/${INTAKE_MIN_PROFILES} shared)`,
      actorId: params.actorId,
    });
  }

  await createNotification(tx, {
    userId: params.staffId,
    message: `New task: ${title}`,
    link: `/rm/tasks`,
  });

  return taskId;
}

export async function scheduleLeadProgressFollowUpTask(
  tx: TransactionSql,
  params: {
    leadId: string;
    staffId: string;
    brideName: string;
    displayId: string;
    actorId?: string | null;
  }
): Promise<string | null> {
  if (await hasPendingIntakeTask(tx, params.leadId, "lead_progress_follow_up")) {
    return null;
  }

  const title = `Follow up — update progress — ${params.brideName} (${params.displayId})`;
  const taskId = await generateTaskDisplayId(tx);

  await tx`
    INSERT INTO rm_tasks (
      display_id, staff_id, lead_id, task_type, title, due_date, status
    ) VALUES (
      ${taskId},
      ${params.staffId}::uuid,
      ${params.leadId}::uuid,
      'lead_progress_follow_up',
      ${title},
      CURRENT_DATE,
      'pending'
    )
  `;

  await createNotification(tx, {
    userId: params.staffId,
    message: `New task: ${title}`,
    link: `/rm/tasks`,
  });

  return taskId;
}

/** Start or resume intake tasks when a lead is assigned to an RM. */
export async function maybeStartLeadIntakeOnAssignment(
  tx: TransactionSql,
  params: {
    leadId: string;
    staffId: string;
    brideName: string;
    displayId: string;
    actorId?: string | null;
    resetConfirmation?: boolean;
  }
): Promise<void> {
  await cancelPendingLeadIntakeTasks(tx, { leadId: params.leadId });

  if (params.resetConfirmation) {
    await tx`
      UPDATE bride_leads SET
        confirmation_status = 'pending',
        confirmation_attempts = 0,
        last_confirmation_attempt_at = NULL,
        requirements_confirmed_at = NULL,
        updated_at = NOW()
      WHERE id = ${params.leadId}::uuid
    `;
    await scheduleBrideConfirmationTask(tx, params);
    return;
  }

  const [lead] = await tx<{ confirmationStatus: string }[]>`
    SELECT confirmation_status AS "confirmationStatus"
    FROM bride_leads
    WHERE id = ${params.leadId}::uuid
  `;

  if (lead?.confirmationStatus === "confirmed") {
    const count = await countActiveDistinctMuasPushedForIntake(tx, params.leadId);
    if (count < INTAKE_MIN_PROFILES) {
      await scheduleShareProfilesTask(tx, params);
    }
    return;
  }

  await scheduleBrideConfirmationTask(tx, params);
}

export async function completeShareProfilesIfReady(
  tx: TransactionSql,
  params: {
    leadId: string;
    staffId: string;
    actorId: string;
    brideName: string;
    displayId: string;
  }
): Promise<boolean> {
  const count = await countActiveDistinctMuasPushedForIntake(tx, params.leadId);
  if (count < INTAKE_MIN_PROFILES) return false;

  const [updated] = await tx<{ id: string }[]>`
    UPDATE rm_tasks
    SET status = 'done', updated_at = NOW()
    WHERE lead_id = ${params.leadId}::uuid
      AND staff_id = ${params.staffId}::uuid
      AND status = 'pending'
      AND task_type = 'share_profiles'
    RETURNING id
  `;

  if (updated) {
    await appendComm(tx, {
      leadId: params.leadId,
      entryType: COMM.note,
      description: `Share profiles task auto-completed (${count} active MUAs shared)`,
      actorId: params.actorId,
    });
  }

  await reconcileInitialContactTasksForLead(tx, {
    leadId: params.leadId,
    staffId: params.staffId,
    actorId: params.actorId,
  });

  return Boolean(updated);
}

export async function logConfirmationNoAnswer(
  tx: TransactionSql,
  params: {
    leadId: string;
    staffId: string;
    note: string;
    actorId: string;
  }
): Promise<{ attempts: number; autoHostile: boolean }> {
  const [lead] = await tx<{
    attempts: number;
    lastAttemptAt: string | null;
  }[]>`
    SELECT
      confirmation_attempts AS attempts,
      last_confirmation_attempt_at::text AS "lastAttemptAt"
    FROM bride_leads
    WHERE id = ${params.leadId}::uuid
  `;

  const today = new Date().toISOString().slice(0, 10);
  if (lead?.lastAttemptAt === today) {
    throw new Error(
      "You already logged a no-answer attempt today. Try again on a different day."
    );
  }

  const attempts = (lead?.attempts ?? 0) + 1;

  await tx`
    INSERT INTO lead_confirmation_attempts (lead_id, staff_id, attempt_date, note)
    VALUES (
      ${params.leadId}::uuid,
      ${params.staffId}::uuid,
      CURRENT_DATE,
      ${params.note}
    )
  `;

  await tx`
    UPDATE bride_leads SET
      confirmation_attempts = ${attempts},
      last_confirmation_attempt_at = CURRENT_DATE,
      updated_at = NOW()
    WHERE id = ${params.leadId}::uuid
  `;

  await appendComm(tx, {
    leadId: params.leadId,
    entryType: COMM.note,
    description: `Bride confirmation — no answer (attempt ${attempts}/${MAX_CONFIRMATION_NO_ANSWER_ATTEMPTS}): ${params.note}`,
    actorId: params.actorId,
  });

  const autoHostile = attempts >= MAX_CONFIRMATION_NO_ANSWER_ATTEMPTS;
  return { attempts, autoHostile };
}

export async function applyLeadHostileExit(
  tx: TransactionSql,
  params: {
    leadId: string;
    note: string;
    actorId: string;
    actorName: string;
    actorRole: string;
  }
): Promise<void> {
  await cancelPendingLeadIntakeTasks(tx, { leadId: params.leadId });

  const exitRole = toDbExitMarkedByRole(params.actorRole);

  const [archived] = await tx<{ displayId: string; brideName: string }[]>`
    UPDATE bride_leads SET
      status = 'archived',
      hostile_note = ${params.note},
      exit_marked_by_role = ${exitRole},
      uploader_confirmation = NULL,
      uploader_confirmed_at = NULL,
      uploader_confirmed_by = NULL,
      updated_at = NOW()
    WHERE id = ${params.leadId}::uuid
    RETURNING display_id AS "displayId", bride_name AS "brideName"
  `;

  await appendComm(tx, {
    leadId: params.leadId,
    entryType: COMM.hostileFlagged,
    description: `${LEAD_EXIT_LABELS.notAnswering} — flagged by ${params.actorName}: ${params.note}`,
    actorId: params.actorId,
  });

  if (archived) {
    await scheduleUploaderReviewTask(tx, {
      leadId: params.leadId,
      displayId: archived.displayId,
      brideName: archived.brideName,
      reason: "not_answering",
      assignedBy: params.actorId,
    });
  }

  const admins = await tx<{ id: string }[]>`
    SELECT id FROM staff
    WHERE role IN ('admin'::user_role, 'owner'::user_role) AND active = true
  `;
  for (const admin of admins) {
    const taskId = await generateTaskDisplayId(tx);
    await createNotification(tx, {
      userId: admin.id,
      message: `${LEAD_EXIT_LABELS.notAnswering} — uploader review required`,
      link: `/rm/leads/${params.leadId}`,
    });
    await tx`
      INSERT INTO rm_tasks (display_id, staff_id, lead_id, task_type, title, due_date)
      VALUES (
        ${taskId},
        ${admin.id}::uuid,
        ${params.leadId}::uuid,
        'admin_review',
        ${`${LEAD_EXIT_LABELS.notAnswering} review — ${params.leadId}`},
        CURRENT_DATE + 1
      )
    `;
  }

  await refreshLeadPhase(tx, params.leadId);
}

export async function hasPendingMuaPushTask(
  tx: TransactionSql,
  leadId: string
): Promise<boolean> {
  const [row] = await tx<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM rm_tasks
      WHERE lead_id = ${leadId}::uuid
        AND status = 'pending'
        AND push_id IS NOT NULL
        AND task_type = 'follow_up'
    ) AS exists
  `;
  return row?.exists ?? false;
}

/** Create idle follow-up tasks for assigned leads with no recent activity. */
export async function reconcileLeadProgressFollowUps(
  tx: TransactionSql,
  staffId: string
): Promise<number> {
  const due = await tx<
    {
      id: string;
      brideName: string;
      displayId: string;
      assignedRmId: string;
    }[]
  >`
    SELECT
      bl.id,
      bl.bride_name AS "brideName",
      bl.display_id AS "displayId",
      bl.assigned_rm_id AS "assignedRmId"
    FROM bride_leads bl
    INNER JOIN leads_full lf ON lf.id = bl.id
    WHERE bl.assigned_rm_id = ${staffId}::uuid
      AND bl.status IN ('assigned', 'commission_rm')
      AND bl.confirmation_status = 'confirmed'
      AND (
        SELECT COUNT(DISTINCT mp.mua_id)::int
        FROM mua_pushes mp
        WHERE mp.lead_id = bl.id
          AND mp.status NOT IN ('closed', 'booked')
          AND (
            bl.owner_assigned_at IS NULL
            OR mp.created_at >= bl.owner_assigned_at
          )
      ) >= ${INTAKE_MIN_PROFILES}
      AND lf.last_activity_at IS NOT NULL
      AND lf.last_activity_at < (NOW() - (${INTAKE_IDLE_DAYS}::int * INTERVAL '1 day'))
      AND NOT EXISTS (
        SELECT 1 FROM rm_tasks t
        WHERE t.lead_id = bl.id
          AND t.status = 'pending'
          AND t.push_id IS NOT NULL
          AND t.task_type = 'follow_up'
      )
      AND NOT EXISTS (
        SELECT 1 FROM rm_tasks t
        WHERE t.lead_id = bl.id
          AND t.status = 'pending'
          AND t.task_type = 'lead_progress_follow_up'
      )
  `;

  let created = 0;
  for (const lead of due) {
    const id = await scheduleLeadProgressFollowUpTask(tx, {
      leadId: lead.id,
      staffId: lead.assignedRmId,
      brideName: lead.brideName,
      displayId: lead.displayId,
    });
    if (id) created++;
  }
  return created;
}

/** Ensure in-flight assigned leads have intake tasks (idempotent). */
export async function ensureLeadIntakeTasksForStaff(
  tx: TransactionSql,
  staffId: string
): Promise<void> {
  await tx`
    UPDATE rm_tasks t
    SET status = 'cancelled', updated_at = NOW()
    FROM bride_leads bl
    WHERE t.lead_id = bl.id
      AND t.staff_id = ${staffId}::uuid
      AND t.status = 'pending'
      AND (
        bl.status IN ('expired', 'archived', 'missed', 'booked')
        OR bl.assigned_rm_id IS DISTINCT FROM ${staffId}::uuid
      )
  `;

  const leads = await tx<
    {
      id: string;
      brideName: string;
      displayId: string;
      confirmationStatus: string;
    }[]
  >`
    SELECT
      id,
      bride_name AS "brideName",
      display_id AS "displayId",
      confirmation_status AS "confirmationStatus"
    FROM bride_leads
    WHERE assigned_rm_id = ${staffId}::uuid
      AND status IN ('assigned', 'commission_rm')
  `;

  for (const lead of leads) {
    const hasBride = await hasPendingIntakeTask(tx, lead.id, "bride_confirmation");
    const hasShare = await hasPendingIntakeTask(tx, lead.id, "share_profiles");
    if (hasBride || hasShare) continue;

    if (lead.confirmationStatus === "confirmed") {
      const count = await countActiveDistinctMuasPushedForIntake(tx, lead.id);
      if (count < INTAKE_MIN_PROFILES) {
        await scheduleShareProfilesTask(tx, {
          leadId: lead.id,
          staffId,
          brideName: lead.brideName,
          displayId: lead.displayId,
        });
      } else {
        await reconcileInitialContactTasksForLead(tx, {
          leadId: lead.id,
          staffId,
          actorId: staffId,
        });
      }
    } else {
      await scheduleBrideConfirmationTask(tx, {
        leadId: lead.id,
        staffId,
        brideName: lead.brideName,
        displayId: lead.displayId,
      });
    }
  }

  await reconcileLeadProgressFollowUps(tx, staffId);
}
