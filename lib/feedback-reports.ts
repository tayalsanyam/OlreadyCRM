import { sql } from "@/db/index";
import {
  FEEDBACK_ELIGIBLE_BL_SQL,
  feedbackTerminalOutcomeSql,
} from "@/lib/feedback-eligibility";
import { fetchFeedbackStats } from "@/lib/feedback-queue";
import type {
  FeedbackOutcomeRow,
  FeedbackOutcomesSummary,
  FeedbackReportScope,
} from "@/lib/feedback-report-types";

export type {
  FeedbackOutcomeRow,
  FeedbackOutcomesSummary,
  FeedbackReportScope,
} from "@/lib/feedback-report-types";

/** Static tail of the outcomes CTE — embed via sql.unsafe(), not as a sql fragment. */
function feedbackReportFbCteSql(): string {
  const terminal = feedbackTerminalOutcomeSql("t");
  return `
    report_fb AS (
      SELECT b.*
      FROM base b
      WHERE b.connection_status != 'not_answered'

      UNION ALL

      SELECT latest_na.*
      FROM (
        SELECT DISTINCT ON (b.lead_id)
          b.*
        FROM base b
        WHERE b.connection_status = 'not_answered'
          AND NOT EXISTS (
            SELECT 1 FROM lead_feedback t
            WHERE t.lead_id = b.lead_id
              AND ${terminal}
          )
        ORDER BY b.lead_id, b.created_at DESC
      ) latest_na
    )
  `;
}

function monthStart(month: string | null): string | null {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  return `${month}-01`;
}

function monthEnd(month: string | null): string | null {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y!, m!, 0).getDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

export async function fetchFeedbackOutcomesReport(opts: {
  scope: FeedbackReportScope;
  staffId: string;
  month?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}): Promise<{
  summary: FeedbackOutcomesSummary;
  rows: FeedbackOutcomeRow[];
  queue: Awaited<ReturnType<typeof fetchFeedbackStats>>;
}> {
  const mineOnly = opts.scope === "mine";
  const from =
    opts.dateFrom?.trim() || monthStart(opts.month ?? null);
  const to = opts.dateTo?.trim() || monthEnd(opts.month ?? null);
  const reportFbCte = feedbackReportFbCteSql();

  const [summaryRow] = await sql<
    {
      connected: number;
      positive: number;
      negative: number;
      mixed: number;
      notAnswered: number;
      notInterested: number;
      avgOlready: number | null;
      avgMua: number | null;
      referrals: number;
      converted: number;
      outsideMuas: number;
      careTickets: number;
      engageYes: number;
      engageMaybe: number;
      engageNo: number;
    }[]
  >`
    WITH eligible AS (
      SELECT bl.id FROM bride_leads bl WHERE ${sql.unsafe(FEEDBACK_ELIGIBLE_BL_SQL)}
    ),
    base AS (
      SELECT
        lf.id,
        lf.lead_id,
        lf.connection_status,
        lf.service_sentiment,
        lf.olready_rating,
        lf.mua_rating,
        lf.mua_type,
        lf.non_olready_mua_name,
        lf.engage_again,
        lf.submitted_by,
        lf.created_at,
        bl.display_id,
        bl.bride_name,
        s.name AS submitted_by_name
      FROM lead_feedback lf
      JOIN eligible e ON e.id = lf.lead_id
      JOIN bride_leads bl ON bl.id = lf.lead_id
      LEFT JOIN staff s ON s.id = lf.submitted_by
      WHERE (${mineOnly}::boolean = false OR lf.submitted_by = ${opts.staffId}::uuid)
        AND (${from}::date IS NULL OR lf.created_at::date >= ${from}::date)
        AND (${to}::date IS NULL OR lf.created_at::date <= ${to}::date)
    ),
    ${sql.unsafe(reportFbCte)}
    SELECT
      COUNT(*) FILTER (
        WHERE connection_status = 'connected' AND service_sentiment IS NOT NULL
      )::int AS connected,
      COUNT(*) FILTER (WHERE service_sentiment = 'positive')::int AS positive,
      COUNT(*) FILTER (WHERE service_sentiment = 'negative')::int AS negative,
      COUNT(*) FILTER (WHERE service_sentiment = 'mixed')::int AS mixed,
      COUNT(*) FILTER (WHERE connection_status = 'not_answered')::int AS "notAnswered",
      COUNT(*) FILTER (WHERE connection_status = 'not_interested')::int AS "notInterested",
      ROUND(AVG(olready_rating) FILTER (WHERE olready_rating IS NOT NULL), 1)::float AS "avgOlready",
      ROUND(AVG(mua_rating) FILTER (WHERE mua_rating IS NOT NULL), 1)::float AS "avgMua",
      (
        SELECT COUNT(*)::int FROM feedback_referrals fr
        WHERE (${mineOnly}::boolean = false OR fr.captured_by = ${opts.staffId}::uuid)
          AND (${from}::date IS NULL OR fr.created_at::date >= ${from}::date)
          AND (${to}::date IS NULL OR fr.created_at::date <= ${to}::date)
      ) AS referrals,
      (
        SELECT COUNT(*)::int FROM feedback_referrals fr
        WHERE fr.status = 'converted'
          AND (${mineOnly}::boolean = false OR fr.captured_by = ${opts.staffId}::uuid)
          AND (${from}::date IS NULL OR fr.updated_at::date >= ${from}::date)
          AND (${to}::date IS NULL OR fr.updated_at::date <= ${to}::date)
      ) AS converted,
      (
        SELECT COUNT(*)::int FROM mua_prospects mp
        JOIN lead_feedback lf2 ON lf2.id = mp.feedback_id
        JOIN eligible e2 ON e2.id = mp.lead_id
        WHERE (${mineOnly}::boolean = false OR lf2.submitted_by = ${opts.staffId}::uuid)
          AND (${from}::date IS NULL OR mp.created_at::date >= ${from}::date)
          AND (${to}::date IS NULL OR mp.created_at::date <= ${to}::date)
      ) AS "outsideMuas",
      (
        SELECT COUNT(*)::int FROM support.tickets t
        WHERE t.source = 'feedback_intake'
          AND (${mineOnly}::boolean = false OR t.created_by = ${opts.staffId}::uuid)
          AND (${from}::date IS NULL OR t.created_at::date >= ${from}::date)
          AND (${to}::date IS NULL OR t.created_at::date <= ${to}::date)
      ) AS "careTickets",
      COUNT(*) FILTER (WHERE engage_again = 'yes')::int AS "engageYes",
      COUNT(*) FILTER (WHERE engage_again = 'maybe')::int AS "engageMaybe",
      COUNT(*) FILTER (WHERE engage_again = 'no')::int AS "engageNo"
    FROM report_fb
  `;

  const rows = await sql<FeedbackOutcomeRow[]>`
    WITH eligible AS (
      SELECT bl.id FROM bride_leads bl WHERE ${sql.unsafe(FEEDBACK_ELIGIBLE_BL_SQL)}
    ),
    base AS (
      SELECT
        lf.id,
        lf.lead_id,
        lf.connection_status,
        lf.service_sentiment,
        lf.olready_rating,
        lf.mua_rating,
        lf.mua_type,
        lf.non_olready_mua_name,
        lf.engage_again,
        lf.submitted_by,
        lf.created_at,
        bl.display_id,
        bl.bride_name,
        s.name AS submitted_by_name
      FROM lead_feedback lf
      JOIN eligible e ON e.id = lf.lead_id
      JOIN bride_leads bl ON bl.id = lf.lead_id
      LEFT JOIN staff s ON s.id = lf.submitted_by
      WHERE (${mineOnly}::boolean = false OR lf.submitted_by = ${opts.staffId}::uuid)
        AND (${from}::date IS NULL OR lf.created_at::date >= ${from}::date)
        AND (${to}::date IS NULL OR lf.created_at::date <= ${to}::date)
    ),
    ${sql.unsafe(reportFbCte)}
    SELECT
      id,
      lead_id AS "leadId",
      display_id AS "displayId",
      bride_name AS "brideName",
      connection_status AS "connectionStatus",
      service_sentiment AS "serviceSentiment",
      olready_rating AS "olreadyRating",
      mua_rating AS "muaRating",
      mua_type AS "muaType",
      non_olready_mua_name AS "nonOlreadyMuaName",
      engage_again AS "engageAgain",
      submitted_by_name AS "submittedByName",
      created_at AS "createdAt"
    FROM report_fb
    ORDER BY created_at DESC
    LIMIT 500
  `;

  const queue = await fetchFeedbackStats(opts.staffId);

  return {
    summary: {
      connectedFeedbacks: summaryRow?.connected ?? 0,
      positive: summaryRow?.positive ?? 0,
      negative: summaryRow?.negative ?? 0,
      mixed: summaryRow?.mixed ?? 0,
      notAnswered: summaryRow?.notAnswered ?? 0,
      notInterested: summaryRow?.notInterested ?? 0,
      avgOlreadyRating: summaryRow?.avgOlready ?? null,
      avgMuaRating: summaryRow?.avgMua ?? null,
      brideReferrals: summaryRow?.referrals ?? 0,
      referralsConverted: summaryRow?.converted ?? 0,
      outsideMuas: summaryRow?.outsideMuas ?? 0,
      careTicketsRaised: summaryRow?.careTickets ?? 0,
      engageAgainYes: summaryRow?.engageYes ?? 0,
      engageAgainMaybe: summaryRow?.engageMaybe ?? 0,
      engageAgainNo: summaryRow?.engageNo ?? 0,
    },
    rows,
    queue,
  };
}
