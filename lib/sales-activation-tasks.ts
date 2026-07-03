import type { TransactionSql } from "@/db/index";
import { generateTaskDisplayId } from "@/db/index";
import { toDbTaskType } from "@/lib/db-mappers";
import { pipelineTaskRef } from "@/lib/sales-pipeline-assign-tasks";

export function contractSignatureFollowUpTitle(muaName: string, pipelineId: string): string {
  return `Contract signature follow-up — ${muaName} ${pipelineTaskRef(pipelineId)}`;
}

/** Create pending sales_activation tasks for every active activation user. */
export async function ensureActivationTasksForPipeline(
  tx: TransactionSql,
  args: { pipelineId: string; title: string; dueDate?: string | null }
): Promise<number> {
  const staff = await tx<{ id: string }[]>`
    SELECT id FROM staff
    WHERE role = 'sales_activation' AND active = true
    ORDER BY created_at ASC
  `;
  if (!staff.length) return 0;

  const pipelineRef = `%${pipelineTaskRef(args.pipelineId)}%`;
  let created = 0;

  for (const user of staff) {
    const [existing] = await tx<{ id: string }[]>`
      SELECT id
      FROM rm_tasks
      WHERE status = 'pending'
        AND staff_id = ${user.id}::uuid
        AND task_type = ${toDbTaskType("salesActivation")}::task_type
        AND title LIKE ${pipelineRef}
      LIMIT 1
    `;
    if (existing) continue;

    const taskDisplayId = await generateTaskDisplayId(tx);
    await tx`
      INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
      VALUES (
        ${taskDisplayId},
        ${user.id}::uuid,
        NULL,
        NULL,
        ${toDbTaskType("salesActivation")}::task_type,
        ${args.title},
        ${args.dueDate ?? null}::date,
        'pending'
      )
    `;
    created++;
  }

  return created;
}

/** Mark pending activation CRM tasks done when plan is activated. */
export async function completePendingSalesActivationTasks(
  tx: TransactionSql,
  pipelineId: string,
): Promise<number> {
  const ref = `%${pipelineTaskRef(pipelineId)}%`;
  const updated = await tx<{ id: string }[]>`
    UPDATE rm_tasks
    SET status = 'done', updated_at = NOW()
    WHERE status = 'pending'
      AND task_type = ${toDbTaskType("salesActivation")}::task_type
      AND title LIKE ${ref}
    RETURNING id
  `;
  return updated.length;
}

/** Mark pending contract-signature follow-ups done when plan is activated. */
export async function completePendingContractSignatureFollowUpTasks(
  tx: TransactionSql,
  pipelineId: string,
): Promise<number> {
  const ref = `%${pipelineTaskRef(pipelineId)}%`;
  const updated = await tx<{ id: string }[]>`
    UPDATE rm_tasks
    SET status = 'done', updated_at = NOW()
    WHERE status = 'pending'
      AND task_type = ${toDbTaskType("salesFollowUp")}::task_type
      AND title LIKE ${"Contract signature follow-up — %"}
      AND title LIKE ${ref}
    RETURNING id
  `;
  return updated.length;
}

/** Cancel pending activation CRM tasks (e.g. when sent back to sales). */
export async function cancelPendingSalesActivationTasks(
  tx: TransactionSql,
  pipelineId: string,
): Promise<number> {
  const ref = `%${pipelineTaskRef(pipelineId)}%`;
  const updated = await tx<{ id: string }[]>`
    UPDATE rm_tasks
    SET status = 'cancelled', updated_at = NOW()
    WHERE status = 'pending'
      AND task_type = ${toDbTaskType("salesActivation")}::task_type
      AND title LIKE ${ref}
    RETURNING id
  `;
  return updated.length;
}
