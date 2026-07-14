import type { TransactionSql } from "@/db/index";
import { generateTaskDisplayId } from "@/db/index";
import { toDbTaskType } from "@/lib/db-mappers";
import { ACTIVATION_SEND_BACK_TASK_MARKER } from "@/lib/sales-activation-send-back-shared";
import { cancelPendingSalesActivationTasks } from "@/lib/sales-activation-tasks";
import { pipelineTaskRef } from "@/lib/sales-pipeline-assign-tasks";

export {
  ACTIVATION_SEND_BACK_TASK_MARKER,
  activationSendBackPipelineId,
  isActivationSendBackTaskTitle,
} from "@/lib/sales-activation-send-back-shared";

export async function clearActivationSendBackFlag(
  tx: TransactionSql,
  pipelineId: string,
): Promise<boolean> {
  const rows = await tx<{ id: string }[]>`
    UPDATE sales.activation_log
    SET sent_back_at = NULL, sent_back_note = NULL
    WHERE pipeline_id = ${pipelineId}::uuid
      AND sent_back_at IS NOT NULL
    RETURNING pipeline_id AS id
  `;
  return rows.length > 0;
}

/** Create a sales follow-up when activation sends the deal back for training fixes. */
export async function createSalesActivationSendBackTask(
  tx: TransactionSql,
  opts: {
    pipelineId: string;
    muaName: string;
    assigneeId: string;
    note: string;
  },
): Promise<boolean> {
  const pipelineRef = pipelineTaskRef(opts.pipelineId);
  const ref = `%${pipelineRef}%`;
  const sendBackRef = `%${ACTIVATION_SEND_BACK_TASK_MARKER}%`;

  await tx`
    UPDATE rm_tasks
    SET status = 'cancelled', updated_at = NOW()
    WHERE status = 'pending'
      AND task_type = ${toDbTaskType("salesFollowUp")}::task_type
      AND title LIKE ${ref}
      AND title LIKE ${sendBackRef}
  `;

  const taskDisplayId = await generateTaskDisplayId(tx);
  await tx`
    INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
    VALUES (
      ${taskDisplayId},
      ${opts.assigneeId}::uuid,
      NULL,
      NULL,
      ${toDbTaskType("salesFollowUp")}::task_type,
      ${`Activation send-back — ${opts.muaName} ${pipelineRef}`},
      CURRENT_DATE,
      'pending'
    )
  `;
  return true;
}

/** Mark activation send-back sales tasks done once training is fixed. */
export async function completeSalesActivationSendBackTasks(
  tx: TransactionSql,
  pipelineId: string,
): Promise<number> {
  const ref = `%${pipelineTaskRef(pipelineId)}%`;
  const sendBackRef = `%${ACTIVATION_SEND_BACK_TASK_MARKER}%`;
  const updated = await tx<{ id: string }[]>`
    UPDATE rm_tasks
    SET status = 'done', updated_at = NOW()
    WHERE status = 'pending'
      AND task_type = ${toDbTaskType("salesFollowUp")}::task_type
      AND title LIKE ${ref}
      AND title LIKE ${sendBackRef}
    RETURNING id
  `;
  return updated.length;
}

/** Cancel activation send-back chase tasks when sales fixes training. */
export async function cancelActivationSendBackFollowUpTasks(
  tx: TransactionSql,
  pipelineId: string,
): Promise<number> {
  const ref = `%${pipelineTaskRef(pipelineId)}%`;
  const followUpRef = `%Send-back follow-up%`;
  const updated = await tx<{ id: string }[]>`
    UPDATE rm_tasks
    SET status = 'cancelled', updated_at = NOW()
    WHERE status = 'pending'
      AND task_type = ${toDbTaskType("salesActivation")}::task_type
      AND title LIKE ${ref}
      AND title LIKE ${followUpRef}
    RETURNING id
  `;
  return updated.length;
}

export async function applyActivationSendBack(
  tx: TransactionSql,
  opts: {
    pipelineId: string;
    muaName: string;
    assignedTo: string | null;
    salesClosedBy: string | null;
    note: string;
    actorId: string;
  },
): Promise<void> {
  const note = opts.note.trim();
  await tx`
    UPDATE sales.activation_log
    SET sent_back_at = NOW(), sent_back_note = ${note}
    WHERE pipeline_id = ${opts.pipelineId}::uuid
  `;
  await tx`
    UPDATE sales.training
    SET complete = false, updated_at = NOW()
    WHERE pipeline_id = ${opts.pipelineId}::uuid
  `;

  await cancelPendingSalesActivationTasks(tx, opts.pipelineId);

  const assigneeId = opts.assignedTo ?? opts.salesClosedBy;
  if (assigneeId) {
    await createSalesActivationSendBackTask(tx, {
      pipelineId: opts.pipelineId,
      muaName: opts.muaName,
      assigneeId,
      note,
    });
  }

  await tx`
    INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
    VALUES (
      ${opts.pipelineId}::uuid,
      'activationUpdated',
      ${`[Activation] Sent back to sales: ${note}`},
      ${opts.actorId}::uuid,
      ${tx.json({ step: "sendBack", note })}
    )
  `;
}
