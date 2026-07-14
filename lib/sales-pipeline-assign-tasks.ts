import { generateTaskDisplayId, type TransactionSql } from "@/db/index";
import { toDbTaskType } from "@/lib/db-mappers";

export function pipelineTaskRef(pipelineId: string): string {
  return `[PIPE:${pipelineId}]`;
}

function assignFollowUpTaskTitle(opts: {
  pipelineId: string;
  wasUnassigned: boolean;
  muaType?: string;
  muaName?: string;
}): string {
  const pipelineRef = pipelineTaskRef(opts.pipelineId);
  if (opts.wasUnassigned && opts.muaType === "candidate" && opts.muaName) {
    return `First touchpoint — ${opts.muaName} ${pipelineRef}`;
  }
  if (opts.wasUnassigned) {
    return `Assigned by admin — first follow-up ${pipelineRef}`;
  }
  return `Reassigned by admin — follow up ${pipelineRef}`;
}

export async function completeSalesAssignRmTasks(
  tx: TransactionSql,
  pipelineId: string
): Promise<void> {
  const ref = `%${pipelineTaskRef(pipelineId)}%`;
  await tx`
    UPDATE rm_tasks
    SET status = 'done', updated_at = NOW()
    WHERE task_type = 'sales_assign_rm'
      AND status = 'pending'
      AND title LIKE ${ref}
  `;
}

/** Pending sales CRM task types tied to a pipeline via [PIPE:uuid] in title. */
export const SALES_PIPELINE_PENDING_TASK_TYPES = [
  "sales_follow_up",
  "sales_senior_call",
  "sales_onboarding",
  "sales_activation",
  "sales_assign_rm",
] as const;

/** One pending sales task per pipeline — cancel existing before creating a new one. */
export async function cancelPendingSalesPipelineTasks(
  tx: TransactionSql,
  pipelineId: string,
): Promise<void> {
  const ref = `%${pipelineTaskRef(pipelineId)}%`;
  await tx`
    UPDATE rm_tasks
    SET status = 'cancelled', updated_at = NOW()
    WHERE status = 'pending'
      AND title LIKE ${ref}
      AND task_type IN (
        'sales_follow_up',
        'sales_senior_call',
        'sales_onboarding',
        'sales_activation',
        'sales_assign_rm'
      )
  `;
}

export async function createAssignFollowUpTask(
  tx: TransactionSql,
  opts: {
    pipelineId: string;
    salesRmId: string;
    wasUnassigned: boolean;
    muaType?: string;
    muaName?: string;
  }
): Promise<void> {
  await cancelPendingSalesPipelineTasks(tx, opts.pipelineId);

  const taskDisplayId = await generateTaskDisplayId(tx);
  const title = assignFollowUpTaskTitle(opts);
  await tx`
    INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
    VALUES (
      ${taskDisplayId},
      ${opts.salesRmId}::uuid,
      NULL,
      NULL,
      ${toDbTaskType("salesFollowUp")}::task_type,
      ${title},
      CURRENT_DATE,
      'pending'
    )
  `;
}
