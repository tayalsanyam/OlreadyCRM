import type { TransactionSql } from "@/db/index";
import { createOpsTask } from "@/lib/ops-task";

const REFERRAL_MARKER_PREFIX = "[feedback-referral:";

export function feedbackReferralTaskMarker(referralId: string): string {
  return `${REFERRAL_MARKER_PREFIX}${referralId}]`;
}

async function resolveLeadUploaderId(tx: TransactionSql): Promise<string | null> {
  const [row] = await tx<{ id: string }[]>`
    SELECT id FROM staff
    WHERE role = 'lead_uploader'::user_role AND active = true
    ORDER BY created_at ASC
    LIMIT 1
  `;
  return row?.id ?? null;
}

export async function scheduleUploaderFeedbackReferralTask(
  tx: TransactionSql,
  opts: {
    referralId: string;
    referralName: string;
    referralPhone: string;
    sourceLeadId: string;
    sourceDisplayId: string;
    sourceBrideName: string;
    assignedBy: string;
  }
): Promise<string | null> {
  const marker = feedbackReferralTaskMarker(opts.referralId);
  const [existing] = await tx<{ id: string }[]>`
    SELECT id FROM ops_tasks
    WHERE status = 'pending'
      AND description LIKE ${`%${marker}%`}
    LIMIT 1
  `;
  if (existing) return existing.id;

  const uploaderId = await resolveLeadUploaderId(tx);
  if (!uploaderId) return null;

  const due = new Date();
  due.setDate(due.getDate() + 1);

  const { id } = await createOpsTask(tx, {
    title: `Feedback referral — ${opts.referralName.trim()}`,
    description: [
      `Phone: ${opts.referralPhone.trim()}`,
      `Referred by ${opts.sourceBrideName.trim()} (${opts.sourceDisplayId}).`,
      `Create the lead from Upload → Feedback Referrals.`,
      marker,
    ].join("\n"),
    assignedTo: uploaderId,
    assignedBy: opts.assignedBy,
    leadId: opts.sourceLeadId,
    dueAt: due.toISOString(),
  });

  return id;
}

export async function completeUploaderFeedbackReferralTask(
  tx: TransactionSql,
  referralId: string,
  completedBy: string
): Promise<void> {
  const marker = `%${feedbackReferralTaskMarker(referralId)}%`;
  await tx`
    UPDATE ops_tasks
    SET
      status = 'done'::rm.task_status,
      completion_notes = COALESCE(
        completion_notes,
        'Referral lead created from feedback upload queue'
      ),
      completed_at = NOW(),
      completed_by = ${completedBy}::uuid,
      updated_at = NOW()
    WHERE status = 'pending'
      AND description LIKE ${marker}
  `;
}
