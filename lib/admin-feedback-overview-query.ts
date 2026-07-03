import { sql } from "@/db/index";
import {
  fetchFeedbackAdminFollowUpPreview,
  fetchFeedbackAdminQueuePreview,
  fetchFeedbackAdminQueueStats,
  type FeedbackFollowUpPreviewRow,
  type FeedbackQueuePreviewRow,
} from "@/lib/feedback-queue";
import { fetchFeedbackOutcomesReport } from "@/lib/feedback-reports";
import {
  FEEDBACK_ELIGIBLE_BL_SQL,
  feedbackTerminalOutcomeSql,
} from "@/lib/feedback-eligibility";
import { FEEDBACK_BOOKING_LEAD_PREDICATE } from "@/lib/bookings-filter-sql";
import {
  defaultOverviewDateRange,
  type OverviewDateRange,
} from "@/lib/admin-overview-date-range";
import type { FeedbackOutcomeRow } from "@/lib/feedback-report-types";

export type FeedbackOverviewFeedbackRow = FeedbackOutcomeRow & {
  olreadyMuaName: string | null;
  noteSnippet: string | null;
};

export type FeedbackMuaBookingRow = {
  feedbackId: string;
  leadId: string;
  displayId: string;
  brideName: string;
  muaId: string;
  muaName: string;
  muaDisplayId: string | null;
  ceremonyType: string | null;
  eventDate: string | null;
  capturedAt: string;
  submittedByName: string | null;
};

export type FeedbackStaffRow = {
  staffId: string;
  name: string;
  feedbacksMtd: number;
  referralsMtd: number;
  notAnsweredMtd: number;
  notInterestedMtd: number;
  muaProspectsMtd: number;
  openTasks: number;
  followUpsDue: number;
  overdueTasks: number;
  callsMtd: number;
  talkMinutesMtd: number;
};

export type FeedbackReferralRow = {
  id: string;
  kind: "bride" | "mua";
  referralName: string;
  referralPhone: string | null;
  sourceLeadId: string;
  sourceLeadDisplayId: string;
  sourceLeadName: string;
  capturedByName: string | null;
  status: string;
  createdAt: string;
};

export type AdminFeedbackOverview = {
  dateRange: OverviewDateRange;
  queue: Awaited<ReturnType<typeof fetchFeedbackAdminQueueStats>> & {
    openFollowUps: number;
    eligibleLeads: number;
  };
  period: {
    feedbacks: number;
    referrals: number;
    muaProspects: number;
    referralsConverted: number;
    feedbackMuaBookings: number;
  };
  outcomes: Awaited<ReturnType<typeof fetchFeedbackOutcomesReport>>["summary"];
  referrals: {
    pending: number;
    pickedUp: number;
    converted: number;
    dismissed: number;
  };
  queueToCall: FeedbackQueuePreviewRow[];
  queueNoContact: FeedbackQueuePreviewRow[];
  followUpsDue: FeedbackFollowUpPreviewRow[];
  feedbackMuaBookings: FeedbackMuaBookingRow[];
  recentFeedbacks: FeedbackOverviewFeedbackRow[];
  pendingReferrals: FeedbackReferralRow[];
  staff: FeedbackStaffRow[];
};

export async function fetchAdminFeedbackOverview(
  range: OverviewDateRange = defaultOverviewDateRange(),
): Promise<AdminFeedbackOverview> {
  const { dateFrom, dateTo } = range;

  const [queueBase, outcomesReport, referralCounts, queueExtras, periodCounts, queueToCall, queueNoContact, followUpsDue, feedbackMuaBookings, recentFeedbacks, pendingReferrals, staff] =
    await Promise.all([
      fetchFeedbackAdminQueueStats(),
      fetchFeedbackOutcomesReport({
        scope: "team",
        staffId: "00000000-0000-0000-0000-000000000001",
        dateFrom,
        dateTo,
      }),
      sql<{ pending: number; pickedUp: number; converted: number; dismissed: number }[]>`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (
            WHERE status = 'picked_up'
              AND created_at::date >= ${dateFrom}::date
              AND created_at::date <= ${dateTo}::date
          )::int AS "pickedUp",
          COUNT(*) FILTER (
            WHERE status = 'converted'
              AND updated_at::date >= ${dateFrom}::date
              AND updated_at::date <= ${dateTo}::date
          )::int AS converted,
          COUNT(*) FILTER (
            WHERE status = 'dismissed'
              AND updated_at::date >= ${dateFrom}::date
              AND updated_at::date <= ${dateTo}::date
          )::int AS dismissed
        FROM feedback_referrals
      `.then((rows) => rows[0] ?? { pending: 0, pickedUp: 0, converted: 0, dismissed: 0 }),
      sql<{ openFollowUps: number; eligibleLeads: number }[]>`
        SELECT
          (
            SELECT COUNT(*)::int
            FROM rm_tasks t
            JOIN staff s ON s.id = t.staff_id AND s.role = 'feedback_rm'
            WHERE t.status = 'pending'
              AND t.task_type IN ('feedback_follow_up', 'feedback_referral_follow_up')
          ) AS "openFollowUps",
          (
            SELECT COUNT(*)::int
            FROM bride_leads bl
            WHERE ${sql.unsafe(FEEDBACK_ELIGIBLE_BL_SQL)}
          ) AS "eligibleLeads"
      `.then((rows) => rows[0] ?? { openFollowUps: 0, eligibleLeads: 0 }),
      sql<{ feedbacks: number; referrals: number; muaProspects: number; referralsConverted: number; feedbackMuaBookings: number }[]>`
        SELECT
          (
            SELECT COUNT(*)::int FROM lead_feedback lf
            WHERE lf.connection_status = 'connected'
              AND lf.service_sentiment IS NOT NULL
              AND lf.created_at::date >= ${dateFrom}::date
              AND lf.created_at::date <= ${dateTo}::date
          ) AS feedbacks,
          (
            SELECT COUNT(*)::int FROM feedback_referrals fr
            WHERE fr.created_at::date >= ${dateFrom}::date
              AND fr.created_at::date <= ${dateTo}::date
          ) AS referrals,
          (
            SELECT COUNT(*)::int FROM mua_prospects mp
            WHERE mp.created_at::date >= ${dateFrom}::date
              AND mp.created_at::date <= ${dateTo}::date
          ) AS "muaProspects",
          (
            SELECT COUNT(*)::int FROM feedback_referrals fr
            WHERE fr.status = 'converted'
              AND fr.updated_at::date >= ${dateFrom}::date
              AND fr.updated_at::date <= ${dateTo}::date
          ) AS "referralsConverted",
          (
            SELECT COUNT(*)::int FROM lead_feedback lf
            WHERE ${sql.unsafe(FEEDBACK_BOOKING_LEAD_PREDICATE)}
              AND lf.created_at::date >= ${dateFrom}::date
              AND lf.created_at::date <= ${dateTo}::date
          ) AS "feedbackMuaBookings"
      `.then((rows) => rows[0] ?? { feedbacks: 0, referrals: 0, muaProspects: 0, referralsConverted: 0, feedbackMuaBookings: 0 }),
      fetchFeedbackAdminQueuePreview("to_call", 15),
      fetchFeedbackAdminQueuePreview("no_contact", 10),
      fetchFeedbackAdminFollowUpPreview(20),
      sql<FeedbackMuaBookingRow[]>`
        SELECT
          lf.id AS "feedbackId",
          bl.id AS "leadId",
          bl.display_id AS "displayId",
          bl.bride_name AS "brideName",
          m.id AS "muaId",
          m.name AS "muaName",
          m.display_id AS "muaDisplayId",
          COALESCE(
            le_fb.ceremony_type,
            (
              SELECT le.ceremony_type
              FROM lead_events le
              WHERE le.lead_id = lf.lead_id AND le.status != 'not_needed'
              ORDER BY le.event_date DESC NULLS LAST, le.ceremony_type
              LIMIT 1
            )
          ) AS "ceremonyType",
          COALESCE(
            le_fb.event_date::text,
            (
              SELECT le.event_date::text
              FROM lead_events le
              WHERE le.lead_id = lf.lead_id AND le.status != 'not_needed'
              ORDER BY le.event_date DESC NULLS LAST, le.ceremony_type
              LIMIT 1
            )
          ) AS "eventDate",
          lf.created_at AS "capturedAt",
          s.name AS "submittedByName"
        FROM lead_feedback lf
        JOIN bride_leads bl ON bl.id = lf.lead_id
        JOIN muas m ON m.id = lf.olready_mua_id
        LEFT JOIN lead_events le_fb ON le_fb.id = lf.event_id
        LEFT JOIN staff s ON s.id = lf.submitted_by
        WHERE ${sql.unsafe(FEEDBACK_BOOKING_LEAD_PREDICATE)}
          AND lf.created_at::date >= ${dateFrom}::date
          AND lf.created_at::date <= ${dateTo}::date
        ORDER BY lf.created_at DESC
        LIMIT 25
      `,
      sql<FeedbackOverviewFeedbackRow[]>`
        SELECT
          lf.id,
          lf.lead_id AS "leadId",
          bl.display_id AS "displayId",
          bl.bride_name AS "brideName",
          lf.connection_status AS "connectionStatus",
          lf.service_sentiment AS "serviceSentiment",
          lf.olready_rating AS "olreadyRating",
          lf.mua_rating AS "muaRating",
          lf.mua_type AS "muaType",
          lf.non_olready_mua_name AS "nonOlreadyMuaName",
          lf.engage_again AS "engageAgain",
          s.name AS "submittedByName",
          lf.created_at AS "createdAt",
          m.name AS "olreadyMuaName",
          NULLIF(
            TRIM(
              COALESCE(
                lf.olready_service_note,
                lf.mua_service_note,
                lf.recommendations_note,
                lf.improvements_note
              )
            ),
            ''
          ) AS "noteSnippet"
        FROM lead_feedback lf
        JOIN bride_leads bl ON bl.id = lf.lead_id
        LEFT JOIN staff s ON s.id = lf.submitted_by
        LEFT JOIN muas m ON m.id = lf.olready_mua_id
        WHERE lf.created_at::date >= ${dateFrom}::date
          AND lf.created_at::date <= ${dateTo}::date
        ORDER BY lf.created_at DESC
        LIMIT 25
      `,
      sql<FeedbackReferralRow[]>`
        SELECT *
        FROM (
          SELECT
            fr.id,
            'bride'::text AS kind,
            fr.referral_name AS "referralName",
            fr.referral_phone AS "referralPhone",
            bl.id AS "sourceLeadId",
            bl.display_id AS "sourceLeadDisplayId",
            bl.bride_name AS "sourceLeadName",
            s.name AS "capturedByName",
            fr.status,
            fr.created_at AS "createdAt"
          FROM feedback_referrals fr
          JOIN bride_leads bl ON bl.id = fr.source_lead_id
          LEFT JOIN staff s ON s.id = fr.captured_by
          WHERE fr.status = 'pending'

          UNION ALL

          SELECT
            mp.id,
            'mua'::text AS kind,
            mp.non_olready_mua_name AS "referralName",
            mp.phone AS "referralPhone",
            bl.id AS "sourceLeadId",
            bl.display_id AS "sourceLeadDisplayId",
            bl.bride_name AS "sourceLeadName",
            s.name AS "capturedByName",
            mp.status,
            mp.created_at AS "createdAt"
          FROM mua_prospects mp
          JOIN lead_feedback lf ON lf.id = mp.feedback_id
          JOIN bride_leads bl ON bl.id = mp.lead_id
          LEFT JOIN staff s ON s.id = lf.submitted_by
          WHERE mp.status IN ('pending', 'collected')
        ) pending_referrals
        ORDER BY "createdAt" ASC
        LIMIT 15
      `,
      sql<FeedbackStaffRow[]>`
        SELECT
          s.id AS "staffId",
          s.name,
          (
            SELECT COUNT(*)::int
            FROM lead_feedback lf
            WHERE lf.submitted_by = s.id
              AND lf.connection_status = 'connected'
              AND lf.service_sentiment IS NOT NULL
              AND lf.created_at::date >= ${dateFrom}::date
              AND lf.created_at::date <= ${dateTo}::date
          ) AS "feedbacksMtd",
          (
            SELECT COUNT(*)::int
            FROM feedback_referrals fr
            WHERE fr.captured_by = s.id
              AND fr.created_at::date >= ${dateFrom}::date
              AND fr.created_at::date <= ${dateTo}::date
          ) AS "referralsMtd",
          (
            SELECT COUNT(DISTINCT lf.lead_id)::int
            FROM lead_feedback lf
            WHERE lf.submitted_by = s.id
              AND lf.connection_status = 'not_answered'
              AND lf.created_at::date >= ${dateFrom}::date
              AND lf.created_at::date <= ${dateTo}::date
              AND NOT EXISTS (
                SELECT 1 FROM lead_feedback t
                WHERE t.lead_id = lf.lead_id
                  AND ${sql.unsafe(feedbackTerminalOutcomeSql("t"))}
              )
          ) AS "notAnsweredMtd",
          (
            SELECT COUNT(*)::int
            FROM lead_feedback lf
            WHERE lf.submitted_by = s.id
              AND lf.connection_status = 'not_interested'
              AND lf.created_at::date >= ${dateFrom}::date
              AND lf.created_at::date <= ${dateTo}::date
          ) AS "notInterestedMtd",
          (
            SELECT COUNT(*)::int
            FROM mua_prospects mp
            JOIN lead_feedback lf ON lf.id = mp.feedback_id
            WHERE lf.submitted_by = s.id
              AND mp.created_at::date >= ${dateFrom}::date
              AND mp.created_at::date <= ${dateTo}::date
          ) AS "muaProspectsMtd",
          (
            SELECT COUNT(*)::int
            FROM rm_tasks t
            WHERE t.staff_id = s.id
              AND t.status = 'pending'
              AND t.task_type IN ('feedback_follow_up', 'feedback_referral_follow_up')
          ) AS "openTasks",
          (
            SELECT COUNT(*)::int
            FROM rm_tasks t
            WHERE t.staff_id = s.id
              AND t.status = 'pending'
              AND t.task_type IN ('feedback_follow_up', 'feedback_referral_follow_up')
              AND t.due_date <= CURRENT_DATE
          ) AS "followUpsDue",
          (
            SELECT COUNT(*)::int
            FROM rm_tasks t
            WHERE t.staff_id = s.id
              AND t.status = 'pending'
              AND t.task_type IN ('feedback_follow_up', 'feedback_referral_follow_up')
              AND t.due_date < CURRENT_DATE
          ) AS "overdueTasks",
          (
            SELECT COUNT(*)::int
            FROM call_logs cl
            WHERE cl.staff_id = s.id
              AND cl.called_at::date >= ${dateFrom}::date
              AND cl.called_at::date <= ${dateTo}::date
          ) AS "callsMtd",
          (
            SELECT ROUND(COALESCE(SUM(cl.duration_sec), 0) / 60.0)::int
            FROM call_logs cl
            WHERE cl.staff_id = s.id
              AND cl.called_at::date >= ${dateFrom}::date
              AND cl.called_at::date <= ${dateTo}::date
          ) AS "talkMinutesMtd"
        FROM staff s
        WHERE s.role = 'feedback_rm'::user_role
          AND s.active = true
        ORDER BY s.name
      `,
    ]);

  return {
    dateRange: range,
    queue: {
      ...queueBase,
      openFollowUps: queueExtras.openFollowUps,
      eligibleLeads: queueExtras.eligibleLeads,
    },
    period: periodCounts,
    outcomes: outcomesReport.summary,
    referrals: referralCounts,
    queueToCall,
    queueNoContact,
    followUpsDue,
    feedbackMuaBookings,
    recentFeedbacks,
    pendingReferrals,
    staff,
  };
}
