import type { TransactionSql } from "@/db/index";
import { sql } from "@/db/index";
import {
  SQL_IS_NOT_ANSWERING,
  SQL_IS_UPLOADER_DEACTIVATED,
  SQL_NI_CLOSURE_EVIDENCE,
} from "@/lib/lead-exit";

export type {
  AdminOffWorkingView,
  AdminReviewSubFilter,
  LeadPhase,
} from "@/lib/lead-phase-shared";
export {
  LEAD_PHASE_LABELS,
  LEAD_PHASES,
  parseAdminOffWorkingView,
  parseAdminReviewSubFilter,
  parseLeadPhase,
} from "@/lib/lead-phase-shared";

/** SQL CASE expression (expects bride_leads alias `bl`). */
export const SQL_COMPUTE_LEAD_PHASE = `
  CASE
    WHEN bl.status = 'expired' THEN 'expired'
    WHEN bl.status = 'pending_verification' THEN 'pending_verification'
    WHEN bl.status = 'booked' THEN 'booked'
    WHEN bl.status = 'assigned' THEN 'assigned'
    WHEN bl.status = 'commission_rm' THEN 'commission'
    WHEN bl.status = 'verified' THEN 'verified_pool'
    WHEN bl.status = 'missed' THEN 'closed'
    WHEN bl.status = 'archived'
      AND bl.uploader_confirmation IS NULL
      AND (
        ${SQL_IS_NOT_ANSWERING}
        OR (
          NOT (
            bl.verified = true
            AND NOT ${SQL_NI_CLOSURE_EVIDENCE}
            AND ${SQL_IS_UPLOADER_DEACTIVATED}
          )
          AND ${SQL_NI_CLOSURE_EVIDENCE}
        )
      )
      THEN 'uploader_review'
    WHEN bl.status = 'archived' THEN 'closed'
    ELSE 'closed'
  END
`;

export const SQL_PHASE_UPLOADER_REVIEW = `bl.lead_phase = 'uploader_review'`;
export const SQL_PHASE_CLOSED = `bl.lead_phase = 'closed'`;
export const SQL_PHASE_VERIFIED_POOL = `bl.lead_phase = 'verified_pool'`;
export const SQL_PHASE_EXPIRED = `bl.lead_phase = 'expired'`;

export const SQL_UPLOADER_REVIEW_NOT_ANSWERING = `
  ${SQL_PHASE_UPLOADER_REVIEW}
  AND ${SQL_IS_NOT_ANSWERING}
`;

export const SQL_UPLOADER_REVIEW_NOT_INTERESTED = `
  ${SQL_PHASE_UPLOADER_REVIEW}
  AND NOT ${SQL_IS_NOT_ANSWERING}
  AND ${SQL_NI_CLOSURE_EVIDENCE}
`;

export const SQL_CLOSED_NOT_INTERESTED = `
  ${SQL_PHASE_CLOSED}
  AND ${SQL_NI_CLOSURE_EVIDENCE}
  AND NOT ${SQL_IS_NOT_ANSWERING}
`;

export const SQL_CLOSED_DEACTIVATED = `
  ${SQL_PHASE_CLOSED}
  AND bl.verified = true
  AND NOT ${SQL_NI_CLOSURE_EVIDENCE}
  AND ${SQL_IS_UPLOADER_DEACTIVATED}
`;

export function adminOffWorkingFilterSql(
  view: import("@/lib/lead-phase-shared").AdminOffWorkingView,
  sub: import("@/lib/lead-phase-shared").AdminReviewSubFilter
): string {
  if (view === "closed") return SQL_PHASE_CLOSED;
  if (sub === "not_answering") return SQL_UPLOADER_REVIEW_NOT_ANSWERING;
  if (sub === "not_interested") return SQL_UPLOADER_REVIEW_NOT_INTERESTED;
  return SQL_PHASE_UPLOADER_REVIEW;
}

export async function refreshLeadPhase(
  tx: TransactionSql,
  leadId: string
): Promise<void> {
  await tx`
    UPDATE bride_leads bl SET
      lead_phase = ${sql.unsafe(SQL_COMPUTE_LEAD_PHASE)},
      updated_at = NOW()
    WHERE bl.id = ${leadId}::uuid
  `;
}

export async function refreshLeadPhases(
  tx: TransactionSql,
  leadIds: string[]
): Promise<void> {
  if (leadIds.length === 0) return;
  await tx`
    UPDATE bride_leads bl SET
      lead_phase = ${sql.unsafe(SQL_COMPUTE_LEAD_PHASE)},
      updated_at = NOW()
    WHERE bl.id = ANY(${leadIds}::uuid[])
  `;
}

/** Recompute lead_phase for every row (idempotent reconcile). */
export async function refreshAllLeadPhases(
  tx: TransactionSql = sql as TransactionSql
): Promise<number> {
  const [row] = await tx<{ count: number }[]>`
    WITH updated AS (
      UPDATE bride_leads bl SET
        lead_phase = ${sql.unsafe(SQL_COMPUTE_LEAD_PHASE)},
        updated_at = NOW()
      RETURNING bl.id
    )
    SELECT COUNT(*)::int AS count FROM updated
  `;
  return row?.count ?? 0;
}
