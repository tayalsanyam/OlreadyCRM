import type { TransactionSql } from "@/db/index";
import { completeUploaderFeedbackReferralTask } from "@/lib/uploader-referral-task";

export type FeedbackReferralVerifyOutcome =
  | "verified"
  | "not_interested"
  | "not_answering";

/** After uploader verifies a lead linked from feedback referrals, close out the referral row. */
export async function syncFeedbackReferralFromLeadVerification(
  tx: TransactionSql,
  leadId: string,
  outcome: FeedbackReferralVerifyOutcome,
  completedBy: string
): Promise<void> {
  const status = outcome === "verified" ? "converted" : "dismissed";
  const [updated] = await tx<{ id: string }[]>`
    UPDATE feedback_referrals fr
    SET
      status = ${status},
      converted_lead_id = COALESCE(fr.converted_lead_id, ${leadId}::uuid),
      updated_at = NOW()
    WHERE fr.status IN ('pending', 'picked_up')
      AND (
        fr.converted_lead_id = ${leadId}::uuid
        OR (
          fr.converted_lead_id IS NULL
          AND fr.referral_phone = (
            SELECT phone FROM bride_leads WHERE id = ${leadId}::uuid
          )
        )
      )
    RETURNING fr.id
  `;
  if (updated?.id) {
    await completeUploaderFeedbackReferralTask(tx, updated.id, completedBy);
  }
}
