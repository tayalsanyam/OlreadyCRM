import { sql } from "@/db/index";

/** Lead statuses that may enter the feedback queue once ceremonies are past. */
export const FEEDBACK_QUEUE_STATUSES = ["expired", "booked"] as const;

/**
 * SQL predicate on `bride_leads` alias `bl`: expired or booked, all ceremonies past.
 * Embed via sql.unsafe(FEEDBACK_ELIGIBLE_BL_SQL) — safe to reuse (plain text, not a fragment).
 */
export const FEEDBACK_ELIGIBLE_BL_SQL = `
  bl.status IN ('expired'::lead_status, 'booked'::lead_status)
  AND NOT EXISTS (
    SELECT 1 FROM lead_events le
    WHERE le.lead_id = bl.id
      AND le.status != 'not_needed'
      AND le.event_date >= CURRENT_DATE
  )
`;

/** Terminal feedback outcomes — call-back attempts after these should not be logged. */
export function feedbackTerminalOutcomeSql(alias = "lf"): string {
  return `(
    (${alias}.connection_status = 'connected' AND ${alias}.service_sentiment IS NOT NULL)
    OR ${alias}.connection_status IN ('not_interested', 'closed_no_contact')
  )`;
}

export async function isLeadFeedbackEligible(leadId: string): Promise<boolean> {
  const [row] = await sql<{ ok: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM bride_leads bl
      WHERE bl.id = ${leadId}::uuid
        AND ${sql.unsafe(FEEDBACK_ELIGIBLE_BL_SQL)}
    ) AS ok
  `;
  return row?.ok ?? false;
}
