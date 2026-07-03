import { sql } from "@/db/index";
import { normalizeLeadFull } from "@/lib/db-mappers";
import { FEEDBACK_ELIGIBLE_BL_SQL } from "@/lib/feedback-eligibility";
import { FEEDBACK_EVENT_CITY_SQL } from "@/lib/feedback-event-city-sql";
import type { FeedbackQueueTab } from "@/lib/feedback-constants";
import type { LeadFull } from "@/lib/types";

export type FeedbackQueueRow = LeadFull & {
  feedbackStatus: string | null;
  lastFeedbackAt: string | null;
  attemptCount: number;
  unreachableAttemptCount: number;
  eventCity: string | null;
};

const UNREACHABLE_ATTEMPTS_SQL = `
  (SELECT COUNT(*)::int FROM lead_feedback fb
   WHERE fb.lead_id = lf.id AND fb.connection_status = 'not_answered')
`;

const NO_CONTACT_TAB_FILTER_SQL = `
  EXISTS (
    SELECT 1 FROM lead_feedback lf
    WHERE lf.lead_id = bl.id AND lf.connection_status = 'closed_no_contact'
  )
  AND NOT EXISTS (
    SELECT 1 FROM lead_feedback lf
    WHERE lf.lead_id = bl.id AND lf.connection_status = 'connected'
  )
`;

const TAB_FILTER_SQL: Record<Exclude<FeedbackQueueTab, "follow_ups">, string> = {
  to_call: `
    NOT EXISTS (
      SELECT 1 FROM lead_feedback lf
      WHERE lf.lead_id = bl.id
        AND lf.connection_status IN ('connected', 'not_interested', 'closed_no_contact')
    )
    AND NOT EXISTS (
      SELECT 1 FROM rm_tasks t
      WHERE t.lead_id = bl.id
        AND t.task_type IN ('feedback_follow_up', 'feedback_referral_follow_up')
        AND t.status = 'pending'
    )
  `,
  no_contact: NO_CONTACT_TAB_FILTER_SQL,
  done: `
    EXISTS (
      SELECT 1 FROM lead_feedback lf
      WHERE lf.lead_id = bl.id
        AND lf.connection_status = 'connected'
        AND lf.service_sentiment IS NOT NULL
    )
  `,
  closed: `
    EXISTS (
      SELECT 1 FROM lead_feedback lf
      WHERE lf.lead_id = bl.id
        AND lf.connection_status = 'not_interested'
    )
  `,
};

function mapLeadRow(row: LeadFull & Record<string, unknown>): FeedbackQueueRow {
  const lead = normalizeLeadFull(row);
  return {
    ...lead,
    feedbackStatus: row.feedbackStatus ? String(row.feedbackStatus) : null,
    lastFeedbackAt: row.lastFeedbackAt ? String(row.lastFeedbackAt) : null,
    attemptCount: Number(row.attemptCount ?? 0),
    unreachableAttemptCount: Number(row.unreachableAttemptCount ?? 0),
    eventCity: row.eventCity ? String(row.eventCity) : null,
  };
}

/** Expired leads for feedback workspace tabs. */
export async function fetchFeedbackQueue(
  tab: FeedbackQueueTab,
  staffId: string
): Promise<FeedbackQueueRow[]> {
  if (tab === "follow_ups") {
    const taskRows = await sql<(LeadFull & Record<string, unknown>)[]>`
      SELECT DISTINCT ON (lf.id)
        lf.*,
        latest.connection_status AS "feedbackStatus",
        latest.created_at AS "lastFeedbackAt",
        (SELECT COUNT(*)::int FROM lead_feedback fb WHERE fb.lead_id = lf.id) AS "attemptCount",
        ${sql.unsafe(UNREACHABLE_ATTEMPTS_SQL)} AS "unreachableAttemptCount",
        ${sql.unsafe(FEEDBACK_EVENT_CITY_SQL)} AS "eventCity"
      FROM rm_tasks t
      JOIN leads_full lf ON lf.id = t.lead_id
      LEFT JOIN LATERAL (
        SELECT connection_status, created_at
        FROM lead_feedback
        WHERE lead_id = lf.id
        ORDER BY created_at DESC
        LIMIT 1
      ) latest ON true
      WHERE t.staff_id = ${staffId}::uuid
        AND t.status = 'pending'
        AND t.task_type IN ('feedback_follow_up', 'feedback_referral_follow_up')
      ORDER BY lf.id, t.due_date ASC
    `;
    return taskRows.map(mapLeadRow);
  }

  const rows = await sql<(LeadFull & Record<string, unknown>)[]>`
    SELECT
      lf.*,
      latest.connection_status AS "feedbackStatus",
      latest.created_at AS "lastFeedbackAt",
      (SELECT COUNT(*)::int FROM lead_feedback fb WHERE fb.lead_id = lf.id) AS "attemptCount",
      ${sql.unsafe(UNREACHABLE_ATTEMPTS_SQL)} AS "unreachableAttemptCount",
      ${sql.unsafe(FEEDBACK_EVENT_CITY_SQL)} AS "eventCity"
    FROM leads_full lf
    JOIN bride_leads bl ON bl.id = lf.id
    LEFT JOIN LATERAL (
      SELECT connection_status, created_at, service_sentiment
      FROM lead_feedback
      WHERE lead_id = lf.id
      ORDER BY created_at DESC
      LIMIT 1
    ) latest ON true
    WHERE ${sql.unsafe(FEEDBACK_ELIGIBLE_BL_SQL)}
      AND ${sql.unsafe(TAB_FILTER_SQL[tab])}
    ORDER BY bl.expired_at DESC NULLS LAST, bl.display_id DESC
  `;

  return rows.map(mapLeadRow);
}

export async function fetchFeedbackStats(staffId: string): Promise<{
  toCall: number;
  noContact: number;
  followUpsDue: number;
  feedbacksThisMonth: number;
  referralsThisMonth: number;
  muaProspectsThisMonth: number;
  referralsConvertedThisMonth: number;
}> {
  const [counts] = await sql<
    {
      toCall: number;
      noContact: number;
      followUpsDue: number;
      feedbacksMonth: number;
      referralsMonth: number;
      muaProspectsMonth: number;
      convertedMonth: number;
    }[]
  >`
    SELECT
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE ${sql.unsafe(FEEDBACK_ELIGIBLE_BL_SQL)}
          AND NOT EXISTS (
            SELECT 1 FROM lead_feedback lf
            WHERE lf.lead_id = bl.id
              AND lf.connection_status IN ('connected', 'not_interested', 'closed_no_contact')
          )
          AND NOT EXISTS (
            SELECT 1 FROM rm_tasks t
            WHERE t.lead_id = bl.id
              AND t.task_type IN ('feedback_follow_up', 'feedback_referral_follow_up')
              AND t.status = 'pending'
          )
      ) AS "toCall",
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE ${sql.unsafe(FEEDBACK_ELIGIBLE_BL_SQL)}
          AND ${sql.unsafe(NO_CONTACT_TAB_FILTER_SQL)}
      ) AS "noContact",
      (
        SELECT COUNT(*)::int FROM rm_tasks t
        WHERE t.staff_id = ${staffId}::uuid
          AND t.status = 'pending'
          AND t.task_type IN ('feedback_follow_up', 'feedback_referral_follow_up')
          AND t.due_date <= CURRENT_DATE
      ) AS "followUpsDue",
      (
        SELECT COUNT(*)::int FROM lead_feedback lf
        WHERE lf.submitted_by = ${staffId}::uuid
          AND lf.connection_status = 'connected'
          AND lf.service_sentiment IS NOT NULL
          AND lf.created_at >= date_trunc('month', CURRENT_DATE)
      ) AS "feedbacksMonth",
      (
        SELECT COUNT(*)::int FROM feedback_referrals fr
        WHERE fr.captured_by = ${staffId}::uuid
          AND fr.created_at >= date_trunc('month', CURRENT_DATE)
      ) AS "referralsMonth",
      (
        SELECT COUNT(*)::int FROM mua_prospects mp
        JOIN lead_feedback lf ON lf.id = mp.feedback_id
        WHERE lf.submitted_by = ${staffId}::uuid
          AND mp.created_at >= date_trunc('month', CURRENT_DATE)
      ) AS "muaProspectsMonth",
      (
        SELECT COUNT(*)::int FROM feedback_referrals fr
        WHERE fr.captured_by = ${staffId}::uuid
          AND fr.status = 'converted'
          AND fr.updated_at >= date_trunc('month', CURRENT_DATE)
      ) AS "convertedMonth"
  `;

  return {
    toCall: counts?.toCall ?? 0,
    noContact: counts?.noContact ?? 0,
    followUpsDue: counts?.followUpsDue ?? 0,
    feedbacksThisMonth: counts?.feedbacksMonth ?? 0,
    referralsThisMonth: counts?.referralsMonth ?? 0,
    muaProspectsThisMonth: counts?.muaProspectsMonth ?? 0,
    referralsConvertedThisMonth: counts?.convertedMonth ?? 0,
  };
}

/** Team-wide queue + monthly totals for admin feedback reports. */
export async function fetchFeedbackAdminQueueStats(): Promise<{
  toCall: number;
  noContact: number;
  followUpsDue: number;
  feedbacksThisMonth: number;
  referralsThisMonth: number;
  muaProspectsThisMonth: number;
  referralsConvertedThisMonth: number;
}> {
  const [counts] = await sql<
    {
      toCall: number;
      noContact: number;
      followUpsDue: number;
      feedbacksMonth: number;
      referralsMonth: number;
      muaProspectsMonth: number;
      convertedMonth: number;
    }[]
  >`
    SELECT
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE ${sql.unsafe(FEEDBACK_ELIGIBLE_BL_SQL)}
          AND NOT EXISTS (
            SELECT 1 FROM lead_feedback lf
            WHERE lf.lead_id = bl.id
              AND lf.connection_status IN ('connected', 'not_interested', 'closed_no_contact')
          )
          AND NOT EXISTS (
            SELECT 1 FROM rm_tasks t
            WHERE t.lead_id = bl.id
              AND t.task_type IN ('feedback_follow_up', 'feedback_referral_follow_up')
              AND t.status = 'pending'
          )
      ) AS "toCall",
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE ${sql.unsafe(FEEDBACK_ELIGIBLE_BL_SQL)}
          AND ${sql.unsafe(NO_CONTACT_TAB_FILTER_SQL)}
      ) AS "noContact",
      (
        SELECT COUNT(*)::int FROM rm_tasks t
        JOIN staff s ON s.id = t.staff_id AND s.role = 'feedback_rm'
        WHERE t.status = 'pending'
          AND t.task_type IN ('feedback_follow_up', 'feedback_referral_follow_up')
          AND t.due_date <= CURRENT_DATE
      ) AS "followUpsDue",
      (
        SELECT COUNT(*)::int FROM lead_feedback lf
        WHERE lf.connection_status = 'connected'
          AND lf.service_sentiment IS NOT NULL
          AND lf.created_at >= date_trunc('month', CURRENT_DATE)
      ) AS "feedbacksMonth",
      (
        SELECT COUNT(*)::int FROM feedback_referrals fr
        WHERE fr.created_at >= date_trunc('month', CURRENT_DATE)
      ) AS "referralsMonth",
      (
        SELECT COUNT(*)::int FROM mua_prospects mp
        WHERE mp.created_at >= date_trunc('month', CURRENT_DATE)
      ) AS "muaProspectsMonth",
      (
        SELECT COUNT(*)::int FROM feedback_referrals fr
        WHERE fr.status = 'converted'
          AND fr.updated_at >= date_trunc('month', CURRENT_DATE)
      ) AS "convertedMonth"
  `;

  return {
    toCall: counts?.toCall ?? 0,
    noContact: counts?.noContact ?? 0,
    followUpsDue: counts?.followUpsDue ?? 0,
    feedbacksThisMonth: counts?.feedbacksMonth ?? 0,
    referralsThisMonth: counts?.referralsMonth ?? 0,
    muaProspectsThisMonth: counts?.muaProspectsMonth ?? 0,
    referralsConvertedThisMonth: counts?.convertedMonth ?? 0,
  };
}

export async function listFeedbackStaff(): Promise<{ id: string; name: string }[]> {
  return sql<{ id: string; name: string }[]>`
    SELECT id, name FROM staff
    WHERE role = 'feedback_rm' AND active = true
    ORDER BY name
  `;
}

export type FeedbackQueuePreviewRow = {
  leadId: string;
  displayId: string;
  brideName: string;
  city: string | null;
  eventCity: string | null;
  feedbackStatus: string | null;
  lastFeedbackAt: string | null;
  attemptCount: number;
  unreachableAttemptCount: number;
};

/** Admin overview: sample leads from a feedback workspace tab. */
export async function fetchFeedbackAdminQueuePreview(
  tab: Exclude<FeedbackQueueTab, "follow_ups" | "done" | "closed">,
  limit = 15,
): Promise<FeedbackQueuePreviewRow[]> {
  const rows = await sql<FeedbackQueuePreviewRow[]>`
    SELECT
      bl.id AS "leadId",
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      bl.city,
      ${sql.unsafe(FEEDBACK_EVENT_CITY_SQL)} AS "eventCity",
      latest.connection_status AS "feedbackStatus",
      latest.created_at::text AS "lastFeedbackAt",
      (SELECT COUNT(*)::int FROM lead_feedback fb WHERE fb.lead_id = bl.id) AS "attemptCount",
      (
        SELECT COUNT(*)::int FROM lead_feedback fb
        WHERE fb.lead_id = bl.id AND fb.connection_status = 'not_answered'
      ) AS "unreachableAttemptCount"
    FROM bride_leads bl
    JOIN leads_full lf ON lf.id = bl.id
    LEFT JOIN LATERAL (
      SELECT connection_status, created_at
      FROM lead_feedback
      WHERE lead_id = bl.id
      ORDER BY created_at DESC
      LIMIT 1
    ) latest ON true
    WHERE ${sql.unsafe(FEEDBACK_ELIGIBLE_BL_SQL)}
      AND ${sql.unsafe(TAB_FILTER_SQL[tab])}
    ORDER BY bl.expired_at DESC NULLS LAST, bl.display_id DESC
    LIMIT ${limit}
  `;
  return rows;
}

export type FeedbackFollowUpPreviewRow = {
  taskId: string;
  leadId: string;
  displayId: string;
  brideName: string;
  staffName: string;
  dueDate: string;
  overdue: boolean;
  taskTitle: string;
};

/** Admin overview: follow-up tasks due today or overdue. */
export async function fetchFeedbackAdminFollowUpPreview(
  limit = 20,
): Promise<FeedbackFollowUpPreviewRow[]> {
  return sql<FeedbackFollowUpPreviewRow[]>`
    SELECT
      t.id AS "taskId",
      bl.id AS "leadId",
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      s.name AS "staffName",
      t.due_date::text AS "dueDate",
      (t.due_date < CURRENT_DATE) AS overdue,
      t.title AS "taskTitle"
    FROM rm_tasks t
    JOIN bride_leads bl ON bl.id = t.lead_id
    JOIN staff s ON s.id = t.staff_id AND s.role = 'feedback_rm'
    WHERE t.status = 'pending'
      AND t.task_type IN ('feedback_follow_up', 'feedback_referral_follow_up')
      AND t.due_date <= CURRENT_DATE
    ORDER BY t.due_date ASC, bl.display_id ASC
    LIMIT ${limit}
  `;
}
