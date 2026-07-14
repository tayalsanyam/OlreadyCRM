import type { TransactionSql } from "@/db/index";
import { appendComm } from "@/db/index";
import { COMM } from "@/lib/comm-types";
import {
  cancelPendingLeadIntakeTasks,
  scheduleBrideConfirmationTask,
  scheduleShareProfilesTask,
} from "@/lib/lead-intake-tasks";
import { cancelPendingStaffTasksForLead } from "@/lib/task-duplicates";

export const OWNER_HANDOVER_TASK_NOTE = "Lead reassigned — prior owner tasks closed";

/** Stamp the moment the current RM became owner (intake epoch). */
export async function stampLeadOwnerHandover(
  tx: TransactionSql,
  leadId: string
): Promise<string> {
  const [row] = await tx<{ ownerAssignedAt: string }[]>`
    UPDATE bride_leads SET
      owner_assigned_at = NOW(),
      updated_at = NOW()
    WHERE id = ${leadId}::uuid
    RETURNING owner_assigned_at AS "ownerAssignedAt"
  `;
  if (!row?.ownerAssignedAt) {
    throw new Error("Lead not found");
  }
  return row.ownerAssignedAt;
}

/** Cancel pending tasks for the outgoing owner on this lead (no task carry). */
export async function cancelPriorOwnerLeadTasks(
  tx: TransactionSql,
  params: {
    leadId: string;
    previousStaffId?: string | null;
    actorId?: string | null;
    note?: string;
  }
): Promise<number> {
  if (!params.previousStaffId) return 0;

  const count = await cancelPendingStaffTasksForLead(tx, {
    leadId: params.leadId,
    staffId: params.previousStaffId,
  });

  if (count > 0) {
    await appendComm(tx, {
      leadId: params.leadId,
      entryType: COMM.note,
      description:
        params.note ??
        `${OWNER_HANDOVER_TASK_NOTE} (${count} task${count === 1 ? "" : "s"})`,
      actorId: params.actorId ?? null,
    });
  }

  return count;
}

/**
 * Intake for a new owner: bride confirmation only when not yet confirmed;
 * otherwise restart share-4 (post-handover pushes only).
 */
export async function startIntakeForNewOwner(
  tx: TransactionSql,
  params: {
    leadId: string;
    staffId: string;
    brideName: string;
    displayId: string;
    actorId?: string | null;
  }
): Promise<void> {
  await cancelPendingLeadIntakeTasks(tx, { leadId: params.leadId });

  const [lead] = await tx<{ confirmationStatus: string }[]>`
    SELECT confirmation_status AS "confirmationStatus"
    FROM bride_leads
    WHERE id = ${params.leadId}::uuid
  `;

  if (lead?.confirmationStatus !== "confirmed") {
    await scheduleBrideConfirmationTask(tx, params);
    return;
  }

  await scheduleShareProfilesTask(tx, { ...params, force: true });
}

/** Owner change: stamp epoch, cancel outgoing tasks, restart intake for incoming RM. */
export async function onLeadOwnerHandover(
  tx: TransactionSql,
  params: {
    leadId: string;
    newStaffId: string;
    previousStaffId?: string | null;
    brideName: string;
    displayId: string;
    actorId?: string | null;
  }
): Promise<string> {
  const ownerAssignedAt = await stampLeadOwnerHandover(tx, params.leadId);
  await cancelPriorOwnerLeadTasks(tx, {
    leadId: params.leadId,
    previousStaffId: params.previousStaffId,
    actorId: params.actorId,
  });
  await startIntakeForNewOwner(tx, {
    leadId: params.leadId,
    staffId: params.newStaffId,
    brideName: params.brideName,
    displayId: params.displayId,
    actorId: params.actorId,
  });
  return ownerAssignedAt;
}
