import type { TransactionSql } from "@/db/index";
import { generateTaskDisplayId } from "@/db/index";
import { cancelPendingFeedbackTasksForLead } from "@/lib/feedback-tasks";
import { normalizePhoneDigits } from "@/lib/validation";
import { scheduleUploaderFeedbackReferralTask } from "@/lib/uploader-referral-task";

function defaultReferralFollowUpDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
}

/** Task for feedback RM to call bride back and collect referral phone(s). */
export async function scheduleReferralPhoneFollowUp(
  tx: TransactionSql,
  opts: {
    leadId: string;
    staffId: string;
    feedbackId: string;
    note: string;
    dueDate?: string | null;
  }
): Promise<string> {
  const due = opts.dueDate?.trim() || defaultReferralFollowUpDate();
  const taskDisplayId = await generateTaskDisplayId(tx);
  const title = "Get referral contact — friends / family";

  const [task] = await tx<{ id: string }[]>`
    INSERT INTO rm_tasks (
      display_id, staff_id, lead_id, task_type, title, due_date, status
    ) VALUES (
      ${taskDisplayId},
      ${opts.staffId}::uuid,
      ${opts.leadId}::uuid,
      'feedback_referral_follow_up',
      ${title},
      ${due}::date,
      'pending'
    )
    RETURNING id
  `;

  await tx`
    INSERT INTO feedback_referral_intake (
      feedback_id, lead_id, staff_id, note, task_id, status
    ) VALUES (
      ${opts.feedbackId}::uuid,
      ${opts.leadId}::uuid,
      ${opts.staffId}::uuid,
      ${opts.note.trim()},
      ${task!.id}::uuid,
      'pending'
    )
  `;

  return task!.id;
}

export async function completeReferralIntakeWithPhone(
  tx: TransactionSql,
  taskId: string,
  opts: {
    staffId: string;
    referralName: string;
    referralPhone: string;
    feedbackId?: string | null;
    leadId: string;
  }
): Promise<void> {
  const phone = normalizePhoneDigits(opts.referralPhone);
  const name = opts.referralName.trim();
  if (!name || phone.length < 10) {
    throw new Error("Referral name and valid phone are required");
  }

  const [intake] = await tx<{
    id: string;
    feedbackId: string;
  }[]>`
    SELECT id, feedback_id AS "feedbackId"
    FROM feedback_referral_intake
    WHERE task_id = ${taskId}::uuid AND status = 'pending'
    LIMIT 1
  `;
  if (!intake) throw new Error("Referral follow-up not found");

  const [sourceLead] = await tx<{ displayId: string; brideName: string }[]>`
    SELECT display_id AS "displayId", bride_name AS "brideName"
    FROM bride_leads
    WHERE id = ${opts.leadId}::uuid
  `;

  const [referralRow] = await tx<{ id: string }[]>`
    INSERT INTO feedback_referrals (
      source_lead_id, feedback_id, referral_name, referral_phone,
      captured_by, capture_type, notes
    ) VALUES (
      ${opts.leadId}::uuid,
      ${intake.feedbackId}::uuid,
      ${name},
      ${phone},
      ${opts.staffId}::uuid,
      'structured',
      NULL
    )
    RETURNING id
  `;

  if (referralRow?.id && sourceLead) {
    await scheduleUploaderFeedbackReferralTask(tx, {
      referralId: referralRow.id,
      referralName: name,
      referralPhone: phone,
      sourceLeadId: opts.leadId,
      sourceDisplayId: sourceLead.displayId,
      sourceBrideName: sourceLead.brideName,
      assignedBy: opts.staffId,
    });
  }

  await tx`
    UPDATE feedback_referral_intake SET
      status = 'collected',
      collected_name = ${name},
      collected_phone = ${phone},
      updated_at = NOW()
    WHERE id = ${intake.id}::uuid
  `;
}

export async function dismissReferralIntake(
  tx: TransactionSql,
  taskId: string
): Promise<void> {
  await tx`
    UPDATE feedback_referral_intake SET
      status = 'dismissed',
      updated_at = NOW()
    WHERE task_id = ${taskId}::uuid AND status = 'pending'
  `;
}

export async function rescheduleFeedbackTask(
  tx: TransactionSql,
  opts: {
    staffId: string;
    leadId: string;
    taskType: "feedback_follow_up" | "feedback_referral_follow_up";
    title: string;
    dueDate: string;
  }
): Promise<string> {
  await cancelPendingFeedbackTasksForLead(tx, opts.leadId, opts.taskType);

  const taskDisplayId = await generateTaskDisplayId(tx);
  const [task] = await tx<{ id: string }[]>`
    INSERT INTO rm_tasks (
      display_id, staff_id, lead_id, task_type, title, due_date, status
    ) VALUES (
      ${taskDisplayId},
      ${opts.staffId}::uuid,
      ${opts.leadId}::uuid,
      ${opts.taskType}::task_type,
      ${opts.title},
      ${opts.dueDate}::date,
      'pending'
    )
    RETURNING id
  `;
  return task!.id;
}
