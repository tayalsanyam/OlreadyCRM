import type { TransactionSql } from "@/db/index";
import {
  appendComm,
  generateTaskDisplayId,
} from "@/db/index";
import { COMM } from "@/lib/comm-types";
import { createNotification } from "@/lib/notifications";
import {
  cancelPendingMuaTasks,
  findPendingMuaTaskConflict,
} from "@/lib/task-duplicates";

export const STAGE_TASK_RULES: Record<
  string,
  { title: (mua: string, bride: string) => string; days: number } | null
> = {
  initialContact: null,
  offerSent: {
    title: (mua, bride) => `Follow up on offer — ${mua} for ${bride}`,
    days: 2,
  },
  followUpDone: {
    title: (mua, bride) => `Check bride response — ${mua} offer on ${bride}`,
    days: 1,
  },
  negotiating: {
    title: (mua, bride) => `Close negotiation — ${mua} / ${bride}`,
    days: 1,
  },
  brideSelected: {
    title: (mua, bride) => `Confirm booking — ${bride} has selected ${mua}`,
    days: 0,
  },
};

export interface ScheduleFollowUpParams {
  pushId: string;
  leadId: string;
  muaId: string;
  muaName: string;
  brideName: string;
  staffId: string;
  actorId: string;
  /** App-stage key e.g. offerSent */
  stage: string;
  /** User-chosen date (YYYY-MM-DD); overrides rule-based due date */
  followUpDate?: string | null;
  /** Custom title when user schedules from stage modal */
  titleOverride?: string;
}

/**
 * Cancel other pending MUA tasks on this lead, then create a single follow-up task.
 * Returns false if a pending task could not be cleared (should not happen after cancel).
 */
export async function scheduleStageFollowUp(
  tx: TransactionSql,
  params: ScheduleFollowUpParams
): Promise<boolean> {
  const rule = STAGE_TASK_RULES[params.stage];
  const dueDate = params.followUpDate?.trim() || null;
  if (!dueDate && !rule) return false;

  await cancelPendingMuaTasks(tx, { pushId: params.pushId });
  const conflict = await findPendingMuaTaskConflict(tx, {
    leadId: params.leadId,
    pushId: params.pushId,
  });
  if (conflict) return false;

  const title =
    params.titleOverride?.trim() ||
    (rule
      ? rule.title(params.muaName, params.brideName)
      : `Follow up — ${params.muaName} / ${params.brideName}`);

  const taskId = await generateTaskDisplayId(tx);
  if (dueDate) {
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
        ${dueDate}::date
      )
    `;
  } else if (rule) {
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
        (CURRENT_DATE + ${rule.days}::integer)
      )
    `;
  } else {
    return false;
  }

  await appendComm(tx, {
    leadId: params.leadId,
    muaId: params.muaId,
    entryType: COMM.note,
    description: `Task auto-created: ${title}`,
    actorId: params.actorId,
  });
  await createNotification(tx, {
    userId: params.staffId,
    message: `New task: ${title}`,
    link: `/rm/tasks`,
  });
  return true;
}

/** Cancel every pending task on this push (and sibling pushes for same MUA on the lead). */
export async function closePushAndClearTasks(
  tx: TransactionSql,
  pushId: string
): Promise<void> {
  await cancelPendingMuaTasks(tx, { pushId });
  await tx`
    UPDATE rm_tasks
    SET status = 'cancelled', updated_at = NOW()
    WHERE push_id = ${pushId}::uuid AND status = 'pending'
  `;
}

/** First touch after pushing a MUA to a lead. */
export async function scheduleInitialContactTask(
  tx: TransactionSql,
  params: Omit<
    ScheduleFollowUpParams,
    "stage" | "followUpDate" | "titleOverride"
  >
): Promise<boolean> {
  await cancelPendingMuaTasks(tx, { pushId: params.pushId });
  const conflict = await findPendingMuaTaskConflict(tx, {
    leadId: params.leadId,
    pushId: params.pushId,
  });
  if (conflict) return false;

  const title = `Initial contact — ${params.muaName} / ${params.brideName}`;
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
      (CURRENT_DATE + 1)
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
    userId: params.staffId,
    message: `New task: ${title}`,
    link: `/rm/tasks`,
  });
  return true;
}
