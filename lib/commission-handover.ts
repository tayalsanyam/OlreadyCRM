import type { TransactionSql } from "@/db/index";
import { appendComm } from "@/db/index";
import { COMM } from "@/lib/comm-types";
import { createNotification } from "@/lib/notifications";
import {
  cancelPriorOwnerLeadTasks,
  startIntakeForNewOwner,
  stampLeadOwnerHandover,
} from "@/lib/lead-owner-handover";
import {
  cancelPendingLeadIntakeTasks,
  scheduleBrideConfirmationTask,
} from "@/lib/lead-intake-tasks";

export { canCommissionRmManagePush } from "@/lib/commission-handover-access";

export const COMMISSION_HANDOVER_TASK_NOTE = "Profile shifted to Commission RM";

export type CommissionIntakeMode = "regional_shift" | "direct_assign";

export type ScheduleCommissionHandoverParams = {
  leadId: string;
  displayId: string;
  handoverReason?: string | null;
  commissionRmId: string;
  actorId?: string | null;
  previousStaffId?: string | null;
  intakeMode: CommissionIntakeMode;
};

async function startCommissionIntake(
  tx: TransactionSql,
  params: {
    leadId: string;
    staffId: string;
    brideName: string;
    displayId: string;
    actorId?: string | null;
    intakeMode: CommissionIntakeMode;
  }
): Promise<void> {
  await cancelPendingLeadIntakeTasks(tx, { leadId: params.leadId });

  if (params.intakeMode === "direct_assign") {
    const [lead] = await tx<{ confirmationStatus: string }[]>`
      SELECT confirmation_status AS "confirmationStatus"
      FROM bride_leads
      WHERE id = ${params.leadId}::uuid
    `;
    if (lead?.confirmationStatus !== "confirmed") {
      await scheduleBrideConfirmationTask(tx, params);
    } else {
      await startIntakeForNewOwner(tx, params);
    }
    return;
  }

  await startIntakeForNewOwner(tx, params);
}

/**
 * Start intake when a lead enters the commission queue.
 * Prior owner tasks are cancelled; push tasks are created on stage change only.
 */
export async function scheduleCommissionHandoverTasks(
  tx: TransactionSql,
  params: ScheduleCommissionHandoverParams
): Promise<void> {
  const [lead] = await tx<{ brideName: string }[]>`
    SELECT bride_name AS "brideName"
    FROM bride_leads
    WHERE id = ${params.leadId}::uuid
  `;
  if (!lead) return;

  await stampLeadOwnerHandover(tx, params.leadId);

  if (params.previousStaffId && params.previousStaffId !== params.commissionRmId) {
    await cancelPriorOwnerLeadTasks(tx, {
      leadId: params.leadId,
      previousStaffId: params.previousStaffId,
      actorId: params.actorId ?? null,
      note: `Pending RM tasks auto-closed — ${COMMISSION_HANDOVER_TASK_NOTE}`,
    });
  }

  await startCommissionIntake(tx, {
    leadId: params.leadId,
    staffId: params.commissionRmId,
    brideName: lead.brideName,
    displayId: params.displayId,
    actorId: params.actorId ?? null,
    intakeMode: params.intakeMode,
  });

  const intakeLabel =
    params.intakeMode === "direct_assign"
      ? "Commission intake started (bride confirmation)"
      : "Commission intake started (share 4 profiles)";

  await appendComm(tx, {
    leadId: params.leadId,
    entryType: COMM.note,
    description: intakeLabel,
    actorId: params.actorId ?? null,
  });

  await createNotification(tx, {
    userId: params.commissionRmId,
    message: `Lead ${params.displayId} — commission intake tasks ready`,
    link: `/rm/tasks?tab=intake`,
  });
}
