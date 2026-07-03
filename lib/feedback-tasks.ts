import type { TransactionSql } from "@/db/index";

/** Cancel pending feedback CRM tasks for a lead (replaced on re-call / terminal outcome). */
export async function cancelPendingFeedbackTasksForLead(
  tx: TransactionSql,
  leadId: string,
  taskType?: "feedback_follow_up" | "feedback_referral_follow_up",
): Promise<number> {
  const updated = taskType
    ? await tx<{ id: string }[]>`
        UPDATE rm_tasks
        SET status = 'cancelled', updated_at = NOW()
        WHERE lead_id = ${leadId}::uuid
          AND status = 'pending'
          AND task_type = ${taskType}::task_type
        RETURNING id
      `
    : await tx<{ id: string }[]>`
        UPDATE rm_tasks
        SET status = 'cancelled', updated_at = NOW()
        WHERE lead_id = ${leadId}::uuid
          AND status = 'pending'
          AND task_type IN ('feedback_follow_up', 'feedback_referral_follow_up')
        RETURNING id
      `;
  return updated.length;
}
