import type { TransactionSql } from "@/db/index";
import { appendComm } from "@/db/index";
import { COMM } from "@/lib/comm-types";
import { MAX_VERIFICATION_CONNECT_ATTEMPTS } from "@/lib/lead-uploader-config";

export { MAX_VERIFICATION_CONNECT_ATTEMPTS };

export async function getVerificationConnectAttempts(
  db: TransactionSql,
  leadId: string,
): Promise<number> {
  const [row] = await db<{ attempts: number }[]>`
    SELECT verification_connect_attempts AS attempts
    FROM bride_leads
    WHERE id = ${leadId}::uuid
  `;
  return row?.attempts ?? 0;
}

export function canClosePendingVerification(attempts: number): boolean {
  return attempts >= MAX_VERIFICATION_CONNECT_ATTEMPTS;
}

function canLogConnectAgain(lead: {
  verified: boolean;
  status: string;
  phase: string | null;
}): boolean {
  if (lead.phase === "pending_verification") return true;
  if (lead.phase === "uploader_review") return true;
  return !lead.verified && lead.status === "pending_verification";
}

export async function logVerificationConnectAttempt(
  tx: TransactionSql,
  params: {
    leadId: string;
    staffId: string;
    note?: string | null;
    actorId: string;
  },
): Promise<{ attempts: number; canClose: boolean }> {
  const [lead] = await tx<{
    attempts: number;
    lastAttemptAt: string | null;
    status: string;
    verified: boolean;
    phase: string | null;
  }[]>`
    SELECT
      verification_connect_attempts AS attempts,
      last_verification_connect_at::text AS "lastAttemptAt",
      status::text AS status,
      verified,
      lead_phase::text AS phase
    FROM bride_leads
    WHERE id = ${params.leadId}::uuid
  `;

  if (!lead) {
    throw new Error("Lead not found");
  }
  if (!canLogConnectAgain(lead)) {
    throw new Error("Connect again is only for pending verification or review leads");
  }

  const today = new Date().toISOString().slice(0, 10);
  if (lead.lastAttemptAt === today) {
    throw new Error(
      "You already logged a connect attempt today. Try again on a different day.",
    );
  }

  const attempts = (lead.attempts ?? 0) + 1;
  const note = params.note?.trim() || null;

  await tx`
    INSERT INTO lead_verification_connect_attempts (lead_id, staff_id, attempt_date, note)
    VALUES (
      ${params.leadId}::uuid,
      ${params.staffId}::uuid,
      CURRENT_DATE,
      ${note}
    )
  `;

  await tx`
    UPDATE bride_leads SET
      verification_connect_attempts = ${attempts},
      last_verification_connect_at = CURRENT_DATE,
      updated_at = NOW()
    WHERE id = ${params.leadId}::uuid
  `;

  await appendComm(tx, {
    leadId: params.leadId,
    entryType: COMM.note,
    description: `Verification connect attempt ${attempts}/${MAX_VERIFICATION_CONNECT_ATTEMPTS}${note ? `: ${note}` : " — no answer"}`,
    actorId: params.actorId,
  });

  return { attempts, canClose: canClosePendingVerification(attempts) };
}
