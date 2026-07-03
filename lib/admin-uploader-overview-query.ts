import { sql } from "@/db/index";
import {
  SQL_CLOSED_DEACTIVATED,
  SQL_CLOSED_NOT_INTERESTED,
  SQL_PHASE_CLOSED,
  SQL_PHASE_UPLOADER_REVIEW,
  SQL_PHASE_VERIFIED_POOL,
  SQL_UPLOADER_REVIEW_NOT_ANSWERING,
  SQL_UPLOADER_REVIEW_NOT_INTERESTED,
} from "@/lib/lead-phase";
import {
  UPLOADER_NI_HANDOVER_VERIFY,
} from "@/lib/lead-exit";
import {
  SQL_UPLOADER_PENDING_QUEUE,
} from "@/lib/lead-exit";
import {
  defaultOverviewDateRange,
  type OverviewDateRange,
} from "@/lib/admin-overview-date-range";

export type UploaderPendingRow = {
  id: string;
  displayId: string;
  brideName: string;
  city: string;
  phone: string;
  source: string | null;
  daysWaiting: number;
  createdAt: string;
};

export type UploaderStaffRow = {
  staffId: string;
  name: string;
  addedMtd: number;
  verifiedMtd: number;
  rejectedMtd: number;
  notAnsweringMtd: number;
  niClosedMtd: number;
  deactivatedMtd: number;
  openTasks: number;
  overdueTasks: number;
  callsMtd: number;
  talkMinutesMtd: number;
};

export type AdminUploaderOverview = {
  dateRange: OverviewDateRange;
  tabs: {
    pending: number;
    verified: number;
    review: number;
    closed: number;
  };
  verifiedRouting: {
    rmQueue: number;
    assigned: number;
    commission: number;
    portal: number;
  };
  notInterestedBreakdown: {
    pendingReview: number;
    confirmedNi: number;
    rmError: number;
    reopen: number;
  };
  mtd: {
    added: number;
    verified: number;
    rejected: number;
    notAnswering: number;
    niClosed: number;
    deactivated: number;
  };
  pendingReferrals: number;
  reverifyTasks: number;
  pendingLeads: UploaderPendingRow[];
  staff: UploaderStaffRow[];
};

export async function fetchAdminUploaderOverview(
  range: OverviewDateRange = defaultOverviewDateRange(),
): Promise<AdminUploaderOverview> {
  const { dateFrom, dateTo } = range;

  const [counts] = await sql<
    {
      tabPending: number;
      tabVerified: number;
      tabReview: number;
      tabClosed: number;
      rmQueue: number;
      assigned: number;
      commission: number;
      portal: number;
      niPendingReview: number;
      niConfirmed: number;
      niRmError: number;
      niReopen: number;
      mtdAdded: number;
      mtdVerified: number;
      mtdRejected: number;
      mtdNotAnswering: number;
      mtdNiClosed: number;
      mtdDeactivated: number;
      pendingReferrals: number;
      reverifyTasks: number;
    }[]
  >`
    SELECT
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE ${sql.unsafe(SQL_UPLOADER_PENDING_QUEUE)}
      ) AS tab_pending,
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE bl.verified = true
          AND bl.status NOT IN ('pending_verification', 'archived')
      ) AS tab_verified,
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE ${sql.unsafe(SQL_PHASE_UPLOADER_REVIEW)}
      ) AS tab_review,
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE ${sql.unsafe(SQL_PHASE_CLOSED)}
      ) AS tab_closed,
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE ${sql.unsafe(SQL_PHASE_VERIFIED_POOL)}
          AND bl.assigned_rm_id IS NULL
      ) AS rm_queue,
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE bl.verified = true AND bl.status = 'assigned'
      ) AS assigned,
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE bl.verified = true AND bl.status = 'commission_rm'
      ) AS commission,
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE bl.verified = true
          AND COALESCE(bl.portal_only, false) = true
          AND bl.status = 'verified'
      ) AS portal,
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE ${sql.unsafe(SQL_PHASE_UPLOADER_REVIEW)}
      ) AS ni_pending_review,
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE ${sql.unsafe(SQL_CLOSED_NOT_INTERESTED)}
          AND bl.uploader_confirmation = 'confirmed_ni'
      ) AS ni_confirmed,
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE ${sql.unsafe(SQL_CLOSED_NOT_INTERESTED)}
          AND bl.uploader_confirmation = 'rm_error'
      ) AS ni_rm_error,
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE ${sql.unsafe(SQL_CLOSED_NOT_INTERESTED)}
          AND bl.uploader_confirmation = 'reopen'
      ) AS ni_reopen,
      (
        SELECT COUNT(DISTINCT c.lead_id)::int FROM comms c
        WHERE c.entry_type = 'lead_created'
          AND c.created_at::date >= ${dateFrom}::date
          AND c.created_at::date <= ${dateTo}::date
      ) AS mtd_added,
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE bl.verified = true
          AND bl.verified_at::date >= ${dateFrom}::date
          AND bl.verified_at::date <= ${dateTo}::date
          AND bl.handover_reason IS DISTINCT FROM ${UPLOADER_NI_HANDOVER_VERIFY}
      ) AS mtd_verified,
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE bl.handover_reason = ${UPLOADER_NI_HANDOVER_VERIFY}
          AND bl.verified_at::date >= ${dateFrom}::date
          AND bl.verified_at::date <= ${dateTo}::date
      ) AS mtd_rejected,
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE ${sql.unsafe(SQL_UPLOADER_REVIEW_NOT_ANSWERING)}
          AND bl.updated_at::date >= ${dateFrom}::date
          AND bl.updated_at::date <= ${dateTo}::date
      ) AS mtd_not_answering,
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE (
          ${sql.unsafe(SQL_UPLOADER_REVIEW_NOT_INTERESTED)}
          OR ${sql.unsafe(SQL_CLOSED_NOT_INTERESTED)}
        )
          AND bl.updated_at::date >= ${dateFrom}::date
          AND bl.updated_at::date <= ${dateTo}::date
      ) AS mtd_ni_closed,
      (
        SELECT COUNT(*)::int FROM bride_leads bl
        WHERE ${sql.unsafe(SQL_CLOSED_DEACTIVATED)}
          AND bl.updated_at::date >= ${dateFrom}::date
          AND bl.updated_at::date <= ${dateTo}::date
      ) AS mtd_deactivated,
      (
        SELECT COUNT(*)::int FROM feedback_referrals fr
        WHERE fr.status = 'pending'
      ) AS pending_referrals,
      (
        SELECT COUNT(*)::int FROM ops_tasks ot
        WHERE ot.status = 'pending'
          AND ot.title ILIKE 'Re-verify%'
      ) AS reverify_tasks
  `;

  const pendingLeads = await sql<UploaderPendingRow[]>`
    SELECT
      bl.id,
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      bl.city,
      bl.phone,
      bl.source,
      DATE_PART('day', NOW() - bl.created_at)::int AS "daysWaiting",
      bl.created_at AS "createdAt"
    FROM bride_leads bl
    WHERE ${sql.unsafe(SQL_UPLOADER_PENDING_QUEUE)}
    ORDER BY bl.created_at ASC
    LIMIT 25
  `;

  const staff = await sql<UploaderStaffRow[]>`
    SELECT
      s.id AS "staffId",
      s.name,
      (
        SELECT COUNT(DISTINCT c.lead_id)::int
        FROM comms c
        WHERE c.actor_id = s.id
          AND c.entry_type = 'lead_created'
          AND c.created_at::date >= ${dateFrom}::date
          AND c.created_at::date <= ${dateTo}::date
      ) AS "addedMtd",
      (
        SELECT COUNT(*)::int
        FROM bride_leads bl
        WHERE bl.verified_by = s.id
          AND bl.verified_at::date >= ${dateFrom}::date
          AND bl.verified_at::date <= ${dateTo}::date
          AND bl.handover_reason IS DISTINCT FROM ${UPLOADER_NI_HANDOVER_VERIFY}
      ) AS "verifiedMtd",
      (
        SELECT COUNT(*)::int
        FROM bride_leads bl
        WHERE bl.verified_by = s.id
          AND bl.handover_reason = ${UPLOADER_NI_HANDOVER_VERIFY}
          AND bl.verified_at::date >= ${dateFrom}::date
          AND bl.verified_at::date <= ${dateTo}::date
      ) AS "rejectedMtd",
      (
        SELECT COUNT(*)::int
        FROM comms c
        WHERE c.actor_id = s.id
          AND c.entry_type = 'hostile_flagged'
          AND c.created_at::date >= ${dateFrom}::date
          AND c.created_at::date <= ${dateTo}::date
      ) AS "notAnsweringMtd",
      (
        SELECT COUNT(*)::int
        FROM bride_leads bl
        WHERE bl.verified_by = s.id
          AND (
            ${sql.unsafe(SQL_UPLOADER_REVIEW_NOT_INTERESTED)}
            OR ${sql.unsafe(SQL_CLOSED_NOT_INTERESTED)}
          )
          AND bl.updated_at::date >= ${dateFrom}::date
          AND bl.updated_at::date <= ${dateTo}::date
      ) AS "niClosedMtd",
      (
        SELECT COUNT(*)::int
        FROM comms c
        WHERE c.actor_id = s.id
          AND c.description ILIKE 'Lead deactivated:%'
          AND c.created_at::date >= ${dateFrom}::date
          AND c.created_at::date <= ${dateTo}::date
      ) AS "deactivatedMtd",
      (
        SELECT COUNT(*)::int
        FROM ops_tasks ot
        WHERE ot.assigned_to = s.id
          AND ot.status = 'pending'
      ) AS "openTasks",
      (
        SELECT COUNT(*)::int
        FROM ops_tasks ot
        WHERE ot.assigned_to = s.id
          AND ot.status = 'pending'
          AND ot.due_at < NOW()
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
    WHERE s.role = 'lead_uploader'::user_role
      AND s.active = true
    ORDER BY s.name
  `;

  return {
    dateRange: range,
    tabs: {
      pending: counts?.tabPending ?? 0,
      verified: counts?.tabVerified ?? 0,
      review: counts?.tabReview ?? 0,
      closed: counts?.tabClosed ?? 0,
    },
    verifiedRouting: {
      rmQueue: counts?.rmQueue ?? 0,
      assigned: counts?.assigned ?? 0,
      commission: counts?.commission ?? 0,
      portal: counts?.portal ?? 0,
    },
    notInterestedBreakdown: {
      pendingReview: counts?.niPendingReview ?? 0,
      confirmedNi: counts?.niConfirmed ?? 0,
      rmError: counts?.niRmError ?? 0,
      reopen: counts?.niReopen ?? 0,
    },
    mtd: {
      added: counts?.mtdAdded ?? 0,
      verified: counts?.mtdVerified ?? 0,
      rejected: counts?.mtdRejected ?? 0,
      notAnswering: counts?.mtdNotAnswering ?? 0,
      niClosed: counts?.mtdNiClosed ?? 0,
      deactivated: counts?.mtdDeactivated ?? 0,
    },
    pendingReferrals: counts?.pendingReferrals ?? 0,
    reverifyTasks: counts?.reverifyTasks ?? 0,
    pendingLeads,
    staff,
  };
}
