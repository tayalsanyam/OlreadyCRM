import type { TransactionSql } from "@/db/index";
import { createOpsTask } from "@/lib/ops-task";
import { LEAD_EXIT_LABELS } from "@/lib/lead-exit";

export type UploaderReviewReason = "not_answering" | "archived_confirm";

async function resolveLeadUploaderId(tx: TransactionSql): Promise<string | null> {
  const [row] = await tx<{ id: string }[]>`
    SELECT id FROM staff
    WHERE role = 'lead_uploader'::user_role AND active = true
    ORDER BY created_at ASC
    LIMIT 1
  `;
  return row?.id ?? null;
}

export async function scheduleUploaderReviewTask(
  tx: TransactionSql,
  opts: {
    leadId: string;
    displayId: string;
    brideName: string;
    reason: UploaderReviewReason;
    assignedBy: string;
  },
): Promise<void> {
  const [existing] = await tx<{ id: string }[]>`
    SELECT id FROM ops_tasks
    WHERE lead_id = ${opts.leadId}::uuid
      AND status = 'pending'
      AND title LIKE 'Re-verify%'
    LIMIT 1
  `;
  if (existing) return;

  const uploaderId = await resolveLeadUploaderId(tx);
  if (!uploaderId) return;

  const reasonLabel =
    opts.reason === "not_answering"
      ? LEAD_EXIT_LABELS.notAnswering
      : LEAD_EXIT_LABELS.uploaderReview;

  const due = new Date();
  due.setDate(due.getDate() + 1);

  await createOpsTask(tx, {
    title: `Re-verify — ${opts.brideName.trim()} (${opts.displayId})`,
    description: `${reasonLabel}. Review on Upload leads or complete this task when done.`,
    assignedTo: uploaderId,
    assignedBy: opts.assignedBy,
    leadId: opts.leadId,
    dueAt: due.toISOString(),
  });
}

export async function completeUploaderReviewTasksForLead(
  tx: TransactionSql,
  leadId: string,
  completedBy: string,
): Promise<void> {
  await tx`
    UPDATE ops_tasks
    SET
      status = 'done'::rm.task_status,
      completion_notes = COALESCE(completion_notes, 'Lead review completed via upload workflow'),
      completed_at = NOW(),
      completed_by = ${completedBy}::uuid,
      updated_at = NOW()
    WHERE lead_id = ${leadId}::uuid
      AND status = 'pending'
      AND title LIKE 'Re-verify%'
  `;
}
