import type postgres from "postgres";
import { getCallyzerCreditStaffIds, callLogsStaffFilter } from "@/lib/callyzer-identity";
import { activeBookingSql } from "@/lib/active-bookings";
import { currentMonthKey, monthBounds, queryTargetVsActual } from "@/lib/targets";
import { PIPELINE_CLOSED_AT_SQL } from "@/lib/sales-reports-queries";
import { UPLOADER_NI_HANDOVER_VERIFY } from "@/lib/lead-exit";
import { FEEDBACK_ELIGIBLE_BL_SQL } from "@/lib/feedback-eligibility";
import { TICKET_CATEGORY_LABELS } from "@/lib/ticket-categories";
import {
  type CareDayEndPayload,
  type CareTicketRow,
  type CareCallyzerMuaContactRow,
  type CareChatSupportRow,
  type ActivationDayEndPayload,
  type ActivationPlanActivatedRow,
  type ActivationQueueRow,
  type FeedbackDayEndPayload,
  type FeedbackDayEndDetailRow,
  type FeedbackDayEndRatingRow,
  type FeedbackDayEndReferralLeadRow,
  type FeedbackDayEndReferralMuaRow,
  type CommissionDayEndPayload,
  type DayEndTemplateKey,
  type LeadUploaderDayEndPayload,
  type LeadUploaderLeadRow,
  type LeadUploaderReferralRow,
  type UploaderCallyzerTouch,
  monthKeyFromYmd,
  type RmDayEndPayload,
  type RmActivityPushRow,
  type RmActivityBookingRow,
  type RmStalePlanMuaRow,
  type LeadBrideRow,
  type LeadMuaChip,
  type MuaRow,
  type SalesDayEndPayload,
  type SalesOpsDayEndPayload,
  tomorrowIstYmd,
  type TargetVsAchieved,
} from "@/lib/day-end";

function targetGap(target: number, achieved: number): TargetVsAchieved {
  return { target, achieved, gap: Math.round((target - achieved) * 100) / 100 };
}

const IST = "Asia/Kolkata";

/** reportDate is en-CA YMD in IST (from todayIstYmd). */
function callLogOnIstDate(tx: postgres.Sql, reportDate: string) {
  return tx`(cl.called_at AT TIME ZONE ${IST})::date = ${reportDate}::date`;
}

/**
 * All Callyzer-synced calls for this staff line on the IST report day.
 * Uses rm.call_logs only — sales.call_logs mirrors a subset and must not be added
 * (would double-count pipeline-linked Callyzer calls).
 */
async function countCallsOnDate(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
): Promise<number> {
  const creditStaffIds = await getCallyzerCreditStaffIds(tx, staffId);
  const rmScoped = callLogsStaffFilter(tx, creditStaffIds);
  const [row] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM call_logs cl
    WHERE ${rmScoped}
      AND ${callLogOnIstDate(tx, reportDate)}
  `;
  return row?.count ?? 0;
}

async function countManualSalesCommsOnDate(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
): Promise<number> {
  const [row] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM sales.comms_log cl
    WHERE cl.actor_id = ${staffId}::uuid
      AND (cl.created_at AT TIME ZONE ${IST})::date = ${reportDate}::date
      AND cl.entry_type IN ('callLogged', 'whatsappLogged')
  `;
  return row?.count ?? 0;
}

async function sumTalkTimeOnDate(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
): Promise<number> {
  const creditStaffIds = await getCallyzerCreditStaffIds(tx, staffId);
  const rmScoped = callLogsStaffFilter(tx, creditStaffIds);
  const [row] = await tx<{ sec: number }[]>`
    SELECT COALESCE(SUM(cl.duration_sec), 0)::int AS sec
    FROM call_logs cl
    WHERE ${rmScoped}
      AND ${callLogOnIstDate(tx, reportDate)}
  `;
  return row?.sec ?? 0;
}

function rmLeadQueueFilter(
  tx: postgres.Sql,
  staffId: string,
  role: "regional_rm" | "commission_rm",
) {
  if (role === "commission_rm") {
    return tx`(
      (
        bl.status = 'commission_rm'::lead_status
        AND (bl.assigned_rm_id = ${staffId}::uuid OR bl.assigned_rm_id IS NULL)
      )
      OR EXISTS (
        SELECT 1 FROM mua_pushes mp
        WHERE mp.lead_id = bl.id AND mp.pushed_by = ${staffId}::uuid
      )
    )`;
  }
  return tx`
    bl.assigned_rm_id = ${staffId}::uuid
    AND bl.status NOT IN ('archived'::lead_status, 'commission_rm'::lead_status)
  `;
}

type LeadRowQuery = {
  leadId: string;
  brideName: string;
  lastContact: string | null;
  muas: LeadMuaChip[] | null;
};

function mapLeadRows(rows: LeadRowQuery[]): LeadBrideRow[] {
  return rows.map((r) => ({
    leadId: r.leadId,
    brideName: r.brideName,
    lastContact: r.lastContact,
    comments: "",
    muas: parseLeadMuas(r.muas),
  }));
}

function mapConferenceLeadRows(rows: LeadRowQuery[]): LeadBrideRow[] {
  return rows.map((r) => ({
    leadId: r.leadId,
    brideName: r.brideName,
    lastContact: r.lastContact,
    comments: "",
    muas: parseLeadMuas(r.muas).map((m) => ({
      ...m,
      suggested: true,
      selected: false,
    })),
  }));
}

function parseLeadMuas(raw: LeadMuaChip[] | string | null): LeadMuaChip[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as LeadMuaChip[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function fetchPipelinesTomorrow(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
  role: "regional_rm" | "commission_rm",
): Promise<LeadBrideRow[]> {
  const tomorrow = tomorrowIstYmd(new Date(`${reportDate}T12:00:00`));
  const queue = rmLeadQueueFilter(tx, staffId, role);

  const rows = await tx<LeadRowQuery[]>`
    SELECT
      bl.id AS "leadId",
      bl.bride_name AS "brideName",
      (
        SELECT MAX(c.created_at)::text
        FROM comms c
        WHERE c.lead_id = bl.id
      ) AS "lastContact",
      (
        SELECT COALESCE(json_agg(json_build_object('muaId', m.id, 'muaName', m.name) ORDER BY m.name), '[]'::json)
        FROM (
          SELECT DISTINCT le.mua_id AS mua_id
          FROM lead_events le
          WHERE le.lead_id = bl.id AND le.mua_id IS NOT NULL
          UNION
          SELECT DISTINCT mp.mua_id
          FROM mua_pushes mp
          WHERE mp.lead_id = bl.id
        ) mids
        JOIN muas m ON m.id = mids.mua_id
      ) AS muas
    FROM bride_leads bl
    JOIN lead_events le ON le.lead_id = bl.id
    WHERE ${queue}
      AND bl.status NOT IN ('archived'::lead_status, 'booked'::lead_status)
      AND le.event_date = ${tomorrow}::date
      AND le.status = 'open'::event_status
    ORDER BY bl.bride_name
    LIMIT 40
  `;

  return mapLeadRows(rows);
}

async function fetchConferenceLeads(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
  role: "regional_rm" | "commission_rm",
): Promise<LeadBrideRow[]> {
  const creditStaffIds = await getCallyzerCreditStaffIds(tx, staffId);
  const rmScoped = callLogsStaffFilter(tx, creditStaffIds);
  const queue = rmLeadQueueFilter(tx, staffId, role);

  const rows = await tx<LeadRowQuery[]>`
    SELECT
      bl.id AS "leadId",
      bl.bride_name AS "brideName",
      (
        SELECT MAX(at)::text
        FROM (
          SELECT cl.called_at AS at
          FROM call_logs cl
          WHERE cl.lead_id = bl.id
            AND ${rmScoped}
            AND ${callLogOnIstDate(tx, reportDate)}
          UNION ALL
          SELECT c.created_at AS at
          FROM comms c
          WHERE c.lead_id = bl.id
            AND c.actor_id = ANY(${creditStaffIds}::uuid[])
            AND c.created_at::date = ${reportDate}::date
            AND c.entry_type::text IN (
              'call_logged',
              'callyzer_synced',
              'whatsapp_logged'
            )
        ) contacts
      ) AS "lastContact",
      (
        SELECT COALESCE(json_agg(json_build_object('muaId', m.id, 'muaName', m.name) ORDER BY m.name), '[]'::json)
        FROM (
          SELECT DISTINCT le.mua_id AS mua_id
          FROM lead_events le
          WHERE le.lead_id = bl.id AND le.mua_id IS NOT NULL
          UNION
          SELECT DISTINCT mp.mua_id
          FROM mua_pushes mp
          WHERE mp.lead_id = bl.id
          UNION
          SELECT DISTINCT cl.mua_id
          FROM call_logs cl
          WHERE cl.lead_id = bl.id
            AND cl.mua_id IS NOT NULL
            AND ${callLogOnIstDate(tx, reportDate)}
        ) mids
        JOIN muas m ON m.id = mids.mua_id
      ) AS muas
    FROM bride_leads bl
    WHERE ${queue}
      AND (
        EXISTS (
          SELECT 1 FROM call_logs cl
          WHERE cl.lead_id = bl.id
            AND ${rmScoped}
            AND ${callLogOnIstDate(tx, reportDate)}
        )
        OR EXISTS (
          SELECT 1 FROM comms c
          WHERE c.lead_id = bl.id
            AND c.actor_id = ANY(${creditStaffIds}::uuid[])
            AND c.created_at::date = ${reportDate}::date
            AND c.entry_type::text IN (
              'call_logged',
              'callyzer_synced',
              'whatsapp_logged'
            )
        )
      )
    ORDER BY bl.bride_name
    LIMIT 40
  `;

  return mapConferenceLeadRows(rows);
}

async function fetchAllPushesToday(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
): Promise<RmActivityPushRow[]> {
  const rows = await tx<
    {
      pushId: string;
      leadId: string;
      brideName: string;
      muaId: string;
      muaName: string;
      ceremonyType: string | null;
    }[]
  >`
    SELECT
      mp.id AS "pushId",
      bl.id AS "leadId",
      bl.bride_name AS "brideName",
      m.id AS "muaId",
      m.name AS "muaName",
      (
        SELECT string_agg(DISTINCT le.ceremony_type, ', ' ORDER BY le.ceremony_type)
        FROM lead_events le
        WHERE le.lead_id = bl.id
          AND le.id = ANY(mp.event_ids)
      ) AS "ceremonyType"
    FROM mua_pushes mp
    JOIN bride_leads bl ON bl.id = mp.lead_id
    JOIN muas m ON m.id = mp.mua_id
    WHERE mp.pushed_by = ${staffId}::uuid
      AND mp.created_at::date = ${reportDate}::date
    ORDER BY mp.created_at, bl.bride_name
  `;
  return rows.map((r) => ({
    pushId: r.pushId,
    leadId: r.leadId,
    brideName: r.brideName,
    muaId: r.muaId,
    muaName: r.muaName,
    ceremonyType: r.ceremonyType ?? undefined,
    comments: "",
  }));
}

async function fetchAllBookingsToday(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
): Promise<RmActivityBookingRow[]> {
  const rows = await tx<
    {
      bookingId: string;
      leadId: string;
      brideName: string;
      muaId: string;
      muaName: string;
      ceremonyType: string;
      bookedPrice: number;
    }[]
  >`
    SELECT
      b.id AS "bookingId",
      bl.id AS "leadId",
      bl.bride_name AS "brideName",
      m.id AS "muaId",
      m.name AS "muaName",
      le.ceremony_type AS "ceremonyType",
      b.booked_price AS "bookedPrice"
    FROM bookings b
    JOIN bride_leads bl ON bl.id = b.lead_id
    JOIN muas m ON m.id = b.mua_id
    JOIN lead_events le ON le.id = b.event_id
    WHERE bl.assigned_rm_id = ${staffId}::uuid
      AND b.booking_date = ${reportDate}::date
      AND NOT COALESCE(b.cancelled, false)
    ORDER BY bl.bride_name, le.ceremony_type
  `;
  return rows.map((r) => ({
    bookingId: r.bookingId,
    leadId: r.leadId,
    brideName: r.brideName,
    muaId: r.muaId,
    muaName: r.muaName,
    ceremonyType: r.ceremonyType,
    bookedPrice: Number(r.bookedPrice),
    comments: "",
  }));
}

async function fetchMuasWorkedToday(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
): Promise<MuaRow[]> {
  const creditStaffIds = await getCallyzerCreditStaffIds(tx, staffId);
  const rmScoped = callLogsStaffFilter(tx, creditStaffIds);

  const rows = await tx<
    {
      muaId: string;
      muaName: string;
      lastContact: string | null;
      detail: string | null;
    }[]
  >`
    WITH activity AS (
      SELECT mp.mua_id, mp.created_at AS at, 'Push' AS kind
      FROM mua_pushes mp
      WHERE mp.pushed_by = ${staffId}::uuid
        AND mp.created_at::date = ${reportDate}::date
      UNION ALL
      SELECT b.mua_id, b.created_at AS at, 'Booking' AS kind
      FROM bookings b
      JOIN bride_leads bl ON bl.id = b.lead_id
      WHERE bl.assigned_rm_id = ${staffId}::uuid
        AND b.booking_date = ${reportDate}::date
        AND NOT COALESCE(b.cancelled, false)
      UNION ALL
      SELECT cl.mua_id, cl.called_at AS at, 'Call' AS kind
      FROM call_logs cl
      WHERE cl.mua_id IS NOT NULL
        AND ${rmScoped}
        AND ${callLogOnIstDate(tx, reportDate)}
    )
    SELECT
      m.id AS "muaId",
      m.name AS "muaName",
      MAX(a.at)::text AS "lastContact",
      string_agg(DISTINCT a.kind, ', ' ORDER BY a.kind) AS detail
    FROM activity a
    JOIN muas m ON m.id = a.mua_id
    GROUP BY m.id, m.name
    ORDER BY m.name
  `;
  return rows.map((r) => ({
    muaId: r.muaId,
    muaName: r.muaName,
    stage: r.detail ?? "",
    lastContact: r.lastContact,
  }));
}

async function fetchStalePlanMuasNotPushed(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
): Promise<RmStalePlanMuaRow[]> {
  const rows = await tx<
    {
      muaId: string;
      muaName: string;
      planTier: string;
      lastPushedAt: string | null;
    }[]
  >`
    SELECT
      m.id AS "muaId",
      m.name AS "muaName",
      m.plan_tier::text AS "planTier",
      (
        SELECT MAX(mp.created_at)::text
        FROM mua_pushes mp
        WHERE mp.mua_id = m.id
          AND mp.pushed_by = ${staffId}::uuid
      ) AS "lastPushedAt"
    FROM muas m
    WHERE m.plan_rm_id = ${staffId}::uuid
      AND m.plan_tier IN (
        'highest_privy'::plan_tier,
        'phoenix'::plan_tier,
        'phoenix_2'::plan_tier
      )
      AND m.status = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM mua_pushes mp
        WHERE mp.mua_id = m.id
          AND mp.pushed_by = ${staffId}::uuid
          AND mp.created_at::date > (${reportDate}::date - INTERVAL '7 days')
      )
    ORDER BY m.name
  `;

  const reportMs = new Date(`${reportDate}T12:00:00`).getTime();
  return rows.map((r) => {
    const lastMs = r.lastPushedAt
      ? new Date(r.lastPushedAt).getTime()
      : null;
    const daysSincePush =
      lastMs == null
        ? null
        : Math.max(0, Math.floor((reportMs - lastMs) / (24 * 60 * 60 * 1000)));
    return {
      muaId: r.muaId,
      muaName: r.muaName,
      planTier: r.planTier,
      lastPushedAt: r.lastPushedAt,
      daysSincePush,
      detail:
        lastMs == null
          ? "Never pushed by you"
          : `Last push ${daysSincePush ?? 0}d ago`,
      comments: "",
    };
  });
}

export async function autofillSalesDayEnd(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
): Promise<SalesDayEndPayload> {
  const month = monthKeyFromYmd(reportDate);
  const { start, end } = monthBounds(month);

  const [targetRow] = await tx<
    { targetRevenue: string | null; targetPotentialSold: number | null; targetExistingSold: number | null }[]
  >`
    SELECT
      target_revenue::text,
      target_potential_sold,
      target_existing_sold
    FROM sales.targets
    WHERE user_id = ${staffId}::uuid AND month = ${month}
  `;

  const [revenueMtd] = await tx<{ amount: string }[]>`
    SELECT COALESCE(SUM(pr.amount), 0)::text AS amount
    FROM sales.payment_records pr
    JOIN sales.pipeline p ON p.id = pr.pipeline_id
    WHERE p.sales_closed_by = ${staffId}::uuid
      AND pr.payment_date >= ${start}::date
      AND pr.payment_date <= ${end}::date
  `;

  const [revenueToday] = await tx<{ amount: string }[]>`
    SELECT COALESCE(SUM(pr.amount), 0)::text AS amount
    FROM sales.payment_records pr
    JOIN sales.pipeline p ON p.id = pr.pipeline_id
    WHERE p.sales_closed_by = ${staffId}::uuid
      AND pr.payment_date = ${reportDate}::date
  `;

  const [soldMtd] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM sales.pipeline p
    WHERE p.sales_closed_by = ${staffId}::uuid
      AND p.stage IN ('Onboarding', 'Deal Closed')
      AND (${tx.unsafe(PIPELINE_CLOSED_AT_SQL)})::date >= ${start}::date
      AND (${tx.unsafe(PIPELINE_CLOSED_AT_SQL)})::date <= ${end}::date
  `;

  const [lastClosed] = await tx<{ closedAt: string | null }[]>`
    SELECT MAX((${tx.unsafe(PIPELINE_CLOSED_AT_SQL)})::date)::text AS "closedAt"
    FROM sales.pipeline p
    WHERE p.sales_closed_by = ${staffId}::uuid
      AND p.stage IN ('Onboarding', 'Deal Closed')
  `;

  const confirmedMuas = await tx`
    SELECT
      m.id AS "muaId",
      m.name AS "muaName",
      p.stage::text AS stage,
      (
        SELECT MAX(GREATEST(cl.created_at, COALESCE(cl2.called_at, cl.created_at)))
        FROM sales.comms_log cl
        LEFT JOIN sales.call_logs cl2 ON cl2.pipeline_id = p.id
        WHERE cl.pipeline_id = p.id
      )::text AS "lastContact"
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    WHERE p.assigned_to = ${staffId}::uuid
      AND p.status = 'active'
      AND p.stage = 'Confirm'
    ORDER BY m.name
    LIMIT 50
  `;

  const demosScheduledToday = await tx`
    SELECT
      m.id AS "muaId",
      m.name AS "muaName",
      p.stage::text AS stage,
      COALESCE(demo.next_touch_point::text, p.updated_at::text) AS "lastContact"
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    LEFT JOIN LATERAL (
      SELECT sl.next_touch_point
      FROM sales.stage_log sl
      WHERE sl.pipeline_id = p.id
        AND sl.next_touch_point IS NOT NULL
        AND (
          sl.to_stage = 'Demo Scheduled'
          OR (
            p.stage = 'Demo Scheduled'
            AND sl.to_stage IN ('Demo Scheduled', 'Demo Done', 'Details Shared', 'Call Back', 'Follow Up')
          )
        )
      ORDER BY
        CASE WHEN sl.to_stage = 'Demo Scheduled' THEN 0 ELSE 1 END,
        sl.created_at DESC
      LIMIT 1
    ) demo ON TRUE
    WHERE p.assigned_to = ${staffId}::uuid
      AND p.status = 'active'
      AND (
        p.stage = 'Demo Scheduled'
        OR (demo.next_touch_point IS NOT NULL AND demo.next_touch_point = ${reportDate}::date)
      )
    ORDER BY demo.next_touch_point NULLS LAST, m.name
    LIMIT 50
  `;

  const detailsSharedToday = await tx`
    SELECT DISTINCT ON (p.id)
      m.id AS "muaId",
      m.name AS "muaName",
      p.stage::text AS stage,
      sl.created_at::text AS "lastContact"
    FROM sales.stage_log sl
    JOIN sales.pipeline p ON p.id = sl.pipeline_id
    JOIN muas m ON m.id = p.mua_id
    WHERE sl.changed_by = ${staffId}::uuid
      AND sl.to_stage = 'Details Shared'
      AND (sl.created_at AT TIME ZONE ${IST})::date = ${reportDate}::date
    ORDER BY p.id, sl.created_at DESC
    LIMIT 50
  `;

  const dealsClosedToday = await tx<
    {
      muaId: string;
      muaName: string;
      stage: string;
      lastContact: string | null;
      revenueToday: string | null;
    }[]
  >`
    SELECT
      m.id AS "muaId",
      m.name AS "muaName",
      p.stage::text AS stage,
      (${tx.unsafe(PIPELINE_CLOSED_AT_SQL)})::text AS "lastContact",
      pay.total::text AS "revenueToday"
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(pr.amount), 0)::numeric(14,2) AS total
      FROM sales.payment_records pr
      WHERE pr.pipeline_id = p.id
        AND pr.payment_date = ${reportDate}::date
    ) pay ON TRUE
    WHERE p.sales_closed_by = ${staffId}::uuid
      AND p.stage IN ('Onboarding', 'Deal Closed')
      AND (${tx.unsafe(PIPELINE_CLOSED_AT_SQL)})::date = ${reportDate}::date
    ORDER BY m.name
    LIMIT 50
  `;

  const [summary] = await tx<
    {
      demosFollowUps: number;
      pipelineMoves: number;
    }[]
  >`
    SELECT
      (
        SELECT COUNT(*)::int FROM sales.comms_log cl
        JOIN sales.pipeline p ON p.id = cl.pipeline_id
        WHERE cl.actor_id = ${staffId}::uuid
          AND (cl.created_at AT TIME ZONE ${IST})::date = ${reportDate}::date
          AND (
            cl.entry_type IN ('callLogged', 'whatsappLogged')
            OR p.stage IN ('Follow Up', 'Call Back', 'Demo Scheduled', 'Demo Done')
          )
      )::int AS "demosFollowUps",
      (
        SELECT COUNT(*)::int FROM sales.stage_log sl
        WHERE sl.changed_by = ${staffId}::uuid
          AND (sl.created_at AT TIME ZONE ${IST})::date = ${reportDate}::date
      )::int AS "pipelineMoves"
  `;

  const callyzerCalls = await countCallsOnDate(tx, staffId, reportDate);
  const manualCalls = await countManualSalesCommsOnDate(tx, staffId, reportDate);

  const revenueTarget = Number(targetRow?.targetRevenue ?? 0);
  const revenueAchieved = Number(revenueMtd?.amount ?? 0);
  const soldTarget =
    Number(targetRow?.targetPotentialSold ?? 0) + Number(targetRow?.targetExistingSold ?? 0);
  const soldAchieved = soldMtd?.count ?? 0;

  return {
    targetsVsAchieved: targetGap(revenueTarget, revenueAchieved),
    soldTargetsVsAchieved: targetGap(soldTarget, soldAchieved),
    lastDealClosedDate: lastClosed?.closedAt ?? null,
    todaysRevenue: Number(revenueToday?.amount ?? 0),
    confirmedMuas: confirmedMuas.map((r) => ({
      muaId: r.muaId,
      muaName: r.muaName,
      stage: r.stage,
      lastContact: r.lastContact,
    })),
    demosScheduledToday: demosScheduledToday.map((r) => ({
      muaId: r.muaId,
      muaName: r.muaName,
      stage: r.stage,
      lastContact: r.lastContact,
    })),
    detailsSharedToday: detailsSharedToday.map((r) => ({
      muaId: r.muaId,
      muaName: r.muaName,
      stage: r.stage,
      lastContact: r.lastContact,
    })),
    dealsClosedToday: dealsClosedToday.map((r) => {
      const revenue = Number(r.revenueToday ?? 0);
      return {
        muaId: r.muaId,
        muaName: r.muaName,
        stage: r.stage,
        lastContact: r.lastContact,
        detail: revenue > 0 ? `₹${revenue.toLocaleString("en-IN")} collected today` : undefined,
      };
    }),
    issuesDiscussion: [],
    autoSummary: {
      callsMade: callyzerCalls + manualCalls,
      demosFollowUps: summary?.demosFollowUps ?? 0,
      pipelineMoves: summary?.pipelineMoves ?? 0,
    },
  };
}

export async function autofillSalesOpsDayEnd(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
): Promise<SalesOpsDayEndPayload> {
  const [tasksClosed] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM rm_tasks t
    WHERE t.staff_id = ${staffId}::uuid
      AND t.status = 'done'
      AND t.updated_at::date = ${reportDate}::date
  `;

  const [queueActions] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM comms c
    WHERE c.actor_id = ${staffId}::uuid
      AND c.created_at::date = ${reportDate}::date
  `;

  const callsMade = await countCallsOnDate(tx, staffId, reportDate);

  return {
    callsMade,
    tasksClosed: tasksClosed?.count ?? 0,
    queueActions: queueActions?.count ?? 0,
    notes: "",
  };
}

type UploaderLeadQueryRow = {
  leadId: string;
  displayId: string;
  brideName: string;
  detail: string;
};

async function fetchUploaderCallyzerTouch(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
  leadId: string,
): Promise<UploaderCallyzerTouch | null> {
  const creditStaffIds = await getCallyzerCreditStaffIds(tx, staffId);
  const rmScoped = callLogsStaffFilter(tx, creditStaffIds);
  const [row] = await tx<
    { durationSec: number; calledAt: string | null; direction: string | null }[]
  >`
    SELECT
      cl.duration_sec AS "durationSec",
      cl.called_at::text AS "calledAt",
      cl.direction::text AS direction
    FROM call_logs cl
    LEFT JOIN bride_leads bl ON bl.id = ${leadId}::uuid
    WHERE ${rmScoped}
      AND ${callLogOnIstDate(tx, reportDate)}
      AND (
        cl.lead_id = ${leadId}::uuid
        OR (
          bl.phone IS NOT NULL
          AND length(regexp_replace(COALESCE(cl.client_phone, ''), '\\D', '', 'g')) >= 10
          AND regexp_replace(COALESCE(cl.client_phone, ''), '\\D', '', 'g')
            LIKE '%' || right(regexp_replace(bl.phone, '\\D', '', 'g'), 10)
        )
      )
    ORDER BY cl.called_at DESC
    LIMIT 1
  `;
  if (!row) return null;
  const direction =
    row.direction === "inbound" || row.direction === "outbound" ? row.direction : null;
  return {
    durationSec: row.durationSec ?? 0,
    calledAt: row.calledAt,
    direction,
  };
}

async function mapUploaderLeadRows(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
  rows: UploaderLeadQueryRow[],
): Promise<LeadUploaderLeadRow[]> {
  const out: LeadUploaderLeadRow[] = [];
  for (const r of rows) {
    const callyzer = await fetchUploaderCallyzerTouch(tx, staffId, reportDate, r.leadId);
    out.push({
      leadId: r.leadId,
      displayId: r.displayId,
      brideName: r.brideName,
      detail: r.detail,
      callyzer,
      workedWithoutCallyzer: !callyzer,
      remarks: "",
    });
  }
  return out;
}

async function attachFeedbackDetailCallyzer(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
  rows: FeedbackDayEndDetailRow[],
): Promise<FeedbackDayEndDetailRow[]> {
  const out: FeedbackDayEndDetailRow[] = [];
  for (const row of rows) {
    const callyzer = await fetchUploaderCallyzerTouch(tx, staffId, reportDate, row.leadId);
    out.push({ ...row, callyzer, workedWithoutCallyzer: !callyzer });
  }
  return out;
}

async function attachFeedbackRatingCallyzer(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
  rows: FeedbackDayEndRatingRow[],
): Promise<FeedbackDayEndRatingRow[]> {
  const out: FeedbackDayEndRatingRow[] = [];
  for (const row of rows) {
    const callyzer = await fetchUploaderCallyzerTouch(tx, staffId, reportDate, row.leadId);
    out.push({ ...row, callyzer, workedWithoutCallyzer: !callyzer });
  }
  return out;
}

export async function autofillLeadUploaderDayEnd(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
): Promise<LeadUploaderDayEndPayload> {
  const callsMade = await countCallsOnDate(tx, staffId, reportDate);
  const talkTimeSec = await sumTalkTimeOnDate(tx, staffId, reportDate);

  const [uploaded] = await tx<{ count: number }[]>`
    SELECT COUNT(DISTINCT c.lead_id)::int AS count
    FROM comms c
    WHERE c.actor_id = ${staffId}::uuid
      AND c.entry_type = 'lead_created'
      AND c.created_at::date = ${reportDate}::date
  `;

  const [rmTasksDone] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM rm_tasks t
    WHERE t.staff_id = ${staffId}::uuid
      AND t.status = 'done'
      AND t.updated_at::date = ${reportDate}::date
  `;

  const [opsTasksDone] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM ops_tasks ot
    WHERE ot.assigned_to = ${staffId}::uuid
      AND ot.status = 'done'
      AND ot.completed_at::date = ${reportDate}::date
  `;

  const verifiedRows = await tx<UploaderLeadQueryRow[]>`
    SELECT DISTINCT ON (bl.id)
      bl.id AS "leadId",
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      c.description AS detail
    FROM comms c
    JOIN bride_leads bl ON bl.id = c.lead_id
    WHERE c.actor_id = ${staffId}::uuid
      AND c.entry_type = 'lead_verified'
      AND c.created_at::date = ${reportDate}::date
      AND COALESCE(c.metadata->>'reVerifiedFromHostile', 'false') <> 'true'
      AND c.description NOT ILIKE 'Re-verified%'
    ORDER BY bl.id, c.created_at DESC
  `;

  const reVerifiedRows = await tx<UploaderLeadQueryRow[]>`
    SELECT DISTINCT ON (bl.id)
      bl.id AS "leadId",
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      c.description AS detail
    FROM comms c
    JOIN bride_leads bl ON bl.id = c.lead_id
    WHERE c.actor_id = ${staffId}::uuid
      AND c.entry_type = 'lead_verified'
      AND c.created_at::date = ${reportDate}::date
      AND (
        COALESCE(c.metadata->>'reVerifiedFromHostile', 'false') = 'true'
        OR c.description ILIKE 'Re-verified%'
      )
    ORDER BY bl.id, c.created_at DESC
  `;

  const notAnsweringRows = await tx<UploaderLeadQueryRow[]>`
    SELECT DISTINCT ON (bl.id)
      bl.id AS "leadId",
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      c.description AS detail
    FROM comms c
    JOIN bride_leads bl ON bl.id = c.lead_id
    WHERE c.actor_id = ${staffId}::uuid
      AND c.entry_type = 'hostile_flagged'
      AND c.created_at::date = ${reportDate}::date
    ORDER BY bl.id, c.created_at DESC
  `;

  const closedNiRows = await tx<UploaderLeadQueryRow[]>`
    SELECT DISTINCT ON (bl.id)
      bl.id AS "leadId",
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      COALESCE(c.description, bl.handover_reason, 'Closed not interested') AS detail
    FROM bride_leads bl
    LEFT JOIN comms c ON c.lead_id = bl.id
      AND c.actor_id = ${staffId}::uuid
      AND c.created_at::date = ${reportDate}::date
    WHERE (
      (
        bl.verified_by = ${staffId}::uuid
        AND bl.handover_reason = ${UPLOADER_NI_HANDOVER_VERIFY}
        AND bl.verified_at::date = ${reportDate}::date
      )
      OR (
        c.id IS NOT NULL
        AND c.entry_type IN ('lead_verified', 'note')
        AND (
          c.description ILIKE '%Move to not interested%'
          OR c.description ILIKE '%Not interested & archive%'
          OR c.metadata->>'verifyOutcome' = 'not_interested_archive'
        )
      )
      OR (
        bl.verified_by = ${staffId}::uuid
        AND bl.status = 'archived'
        AND bl.handover_reason ILIKE '%not interested%'
        AND NOT (bl.hostile_note IS NOT NULL AND TRIM(bl.hostile_note) <> '')
        AND bl.updated_at::date = ${reportDate}::date
      )
    )
    ORDER BY bl.id, c.created_at DESC NULLS LAST
  `;

  const referralRows = await tx<LeadUploaderReferralRow[]>`
    SELECT
      id,
      "referralName",
      "referralPhone",
      "sourceBrideName",
      notes,
      status
    FROM (
      SELECT DISTINCT ON (fr.id)
        fr.id,
        fr.referral_name AS "referralName",
        fr.referral_phone AS "referralPhone",
        bl.bride_name AS "sourceBrideName",
        fr.notes,
        fr.status,
        fr.updated_at
      FROM feedback_referrals fr
      JOIN bride_leads bl ON bl.id = fr.source_lead_id
      WHERE fr.status IN ('picked_up', 'converted', 'dismissed')
        AND (
          (
            fr.converted_lead_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM comms c
              WHERE c.lead_id = fr.converted_lead_id
                AND c.actor_id = ${staffId}::uuid
                AND c.created_at::date = ${reportDate}::date
                AND (
                  c.entry_type IN ('lead_created', 'lead_verified', 'hostile_flagged')
                  OR (
                    c.entry_type = 'note'
                    AND (
                      c.description ILIKE '%not interested%'
                      OR c.description ILIKE '%archive%'
                      OR c.metadata->>'verifyOutcome' = 'not_interested_archive'
                    )
                  )
                )
            )
          )
          OR EXISTS (
            SELECT 1
            FROM ops_tasks ot
            WHERE ot.completed_by = ${staffId}::uuid
              AND ot.completed_at::date = ${reportDate}::date
              AND ot.status = 'done'
              AND ot.description LIKE ('%[feedback-referral:' || fr.id::text || ']%')
          )
        )
      ORDER BY fr.id, fr.updated_at DESC
    ) worked
    ORDER BY worked.updated_at DESC
  `;

  return {
    callsMade,
    talkTimeSec,
    leadsUploaded: uploaded?.count ?? 0,
    tasksCompleted: (rmTasksDone?.count ?? 0) + (opsTasksDone?.count ?? 0),
    leadsVerifiedToday: await mapUploaderLeadRows(tx, staffId, reportDate, verifiedRows),
    leadsReVerifiedToday: await mapUploaderLeadRows(tx, staffId, reportDate, reVerifiedRows),
    notAnsweringToday: await mapUploaderLeadRows(tx, staffId, reportDate, notAnsweringRows),
    closedNotInterestedToday: await mapUploaderLeadRows(tx, staffId, reportDate, closedNiRows),
    feedbackReferralsAdded: referralRows,
  };
}

function deriveActivationPendingActions(row: {
  profileLinkVerified: boolean;
  invoiceGenerated: boolean;
  invoiceNumber: string | null;
  contractGenerated: boolean;
  hasContract: boolean;
}): { pendingActions: string[]; stageLabel: string } {
  const pendingActions: string[] = [];
  if (!row.profileLinkVerified) {
    pendingActions.push("Verify profile link");
  } else if (!row.invoiceGenerated) {
    pendingActions.push("Invoice");
  } else if (!row.invoiceNumber?.trim()) {
    pendingActions.push("Invoice number");
  } else if (!row.contractGenerated) {
    pendingActions.push("Contract");
  } else if (!row.hasContract) {
    pendingActions.push("Upload contract");
  } else {
    pendingActions.push("Ready to activate");
  }

  const stageLabel = pendingActions[0] ?? "In activation";
  return { pendingActions, stageLabel };
}

export async function autofillActivationDayEnd(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
): Promise<ActivationDayEndPayload> {
  const callsMade = await countCallsOnDate(tx, staffId, reportDate);
  const talkTimeSec = await sumTalkTimeOnDate(tx, staffId, reportDate);

  const activatedRows = await tx<
    {
      pipelineId: string;
      muaName: string;
      muaCity: string;
      plan: string | null;
      leadCap: number | null;
      leadBudget: string | null;
      quotedAmount: string | null;
      durationEnd: string | null;
      regions: string[] | null;
      cities: string[] | null;
      invoiceNumber: string | null;
      activatedAt: string;
    }[]
  >`
    SELECT
      p.id AS "pipelineId",
      m.name AS "muaName",
      m.city AS "muaCity",
      o.plan,
      o.lead_cap AS "leadCap",
      o.lead_budget AS "leadBudget",
      o.quoted_amount::text AS "quotedAmount",
      o.duration_end::text AS "durationEnd",
      o.regions,
      o.cities,
      al.invoice_number AS "invoiceNumber",
      al.activated_at::text AS "activatedAt"
    FROM sales.activation_log al
    JOIN sales.pipeline p ON p.id = al.pipeline_id
    JOIN muas m ON m.id = p.mua_id
    JOIN sales.onboarding o ON o.pipeline_id = p.id
    WHERE al.activated_by = ${staffId}::uuid
      AND al.activated_at::date = ${reportDate}::date
    ORDER BY al.activated_at ASC
  `;

  const queueRows = await tx<
    {
      pipelineId: string;
      muaName: string;
      muaCity: string;
      muaType: string;
      assignedSalesName: string | null;
      daysInStage: number;
      profileLinkVerified: boolean;
      invoiceGenerated: boolean;
      invoiceNumber: string | null;
      contractGenerated: boolean;
      hasContract: boolean;
    }[]
  >`
    SELECT
      p.id AS "pipelineId",
      m.name AS "muaName",
      m.city AS "muaCity",
      p.mua_type AS "muaType",
      assignee.name AS "assignedSalesName",
      DATE_PART('day', NOW() - tr.updated_at)::int AS "daysInStage",
      COALESCE(al.profile_link_verified, false) AS "profileLinkVerified",
      COALESCE(al.invoice_generated, false) AS "invoiceGenerated",
      al.invoice_number AS "invoiceNumber",
      COALESCE(al.contract_generated, false) AS "contractGenerated",
      COALESCE(BTRIM(al.contract_url) <> '', false) AS "hasContract"
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    JOIN sales.training tr ON tr.pipeline_id = p.id AND tr.complete = true
    LEFT JOIN sales.activation_log al ON al.pipeline_id = p.id
    LEFT JOIN staff assignee ON assignee.id = p.assigned_to
    WHERE al.activated_at IS NULL
      AND al.sent_back_at IS NULL
    ORDER BY tr.updated_at ASC
    LIMIT 50
  `;

  return {
    callsMade,
    talkTimeSec,
    plansActivatedToday: activatedRows.map((r) => ({
      pipelineId: r.pipelineId,
      muaName: r.muaName,
      muaCity: r.muaCity,
      plan: r.plan ?? "—",
      leadCap: r.leadCap,
      leadBudget: r.leadBudget,
      quotedAmount: r.quotedAmount != null ? Number(r.quotedAmount) : null,
      durationEnd: r.durationEnd,
      regions: r.regions ?? [],
      cities: r.cities ?? [],
      invoiceNumber: r.invoiceNumber,
      activatedAt: r.activatedAt,
      remarks: "",
    })),
    activationQueue: queueRows.map((r) => {
      const { pendingActions, stageLabel } = deriveActivationPendingActions(r);
      return {
        pipelineId: r.pipelineId,
        muaName: r.muaName,
        muaCity: r.muaCity,
        muaType: r.muaType,
        assignedSalesName: r.assignedSalesName,
        daysInStage: r.daysInStage,
        stageLabel,
        pendingActions,
        remarks: "",
      };
    }),
  };
}

type FeedbackRowQuery = {
  id: string;
  leadId: string;
  displayId: string;
  brideName: string;
  connectionStatus: string;
  serviceSentiment: string | null;
  olreadyRating: number | null;
  muaRating: number | null;
  followUpAt: string | null;
  followUpNote: string | null;
  followUpRequested: boolean;
  improvementsNote: string | null;
  olreadyServiceNote: string | null;
  muaServiceNote: string | null;
  recommendationsNote: string | null;
  referralsNote: string | null;
  olreadyMuaName: string | null;
  nonOlreadyMuaName: string | null;
};

function buildFeedbackDetail(row: FeedbackRowQuery): string {
  const parts: string[] = [];
  if (row.connectionStatus) {
    parts.push(row.connectionStatus.replace(/_/g, " "));
  }
  if (row.serviceSentiment) parts.push(`Sentiment: ${row.serviceSentiment}`);
  if (row.olreadyRating != null) parts.push(`Olready ${row.olreadyRating}/5`);
  if (row.muaRating != null) parts.push(`MUA ${row.muaRating}/5`);
  if (row.followUpAt) parts.push(`Follow-up ${row.followUpAt}`);
  const note =
    row.followUpNote?.trim() ||
    row.improvementsNote?.trim() ||
    row.olreadyServiceNote?.trim() ||
    row.muaServiceNote?.trim() ||
    row.recommendationsNote?.trim() ||
    row.referralsNote?.trim();
  if (note) parts.push(note);
  return parts.join(" · ") || "—";
}

function mapFeedbackDetailRow(row: FeedbackRowQuery): FeedbackDayEndDetailRow {
  return {
    leadId: row.leadId,
    displayId: row.displayId,
    brideName: row.brideName,
    detail: buildFeedbackDetail(row),
    remarks: "",
  };
}

function resolveMuaName(row: FeedbackRowQuery): string | null {
  return row.olreadyMuaName ?? row.nonOlreadyMuaName ?? null;
}

export async function autofillFeedbackDayEnd(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
): Promise<FeedbackDayEndPayload> {
  const callsMade = await countCallsOnDate(tx, staffId, reportDate);
  const talkTimeSec = await sumTalkTimeOnDate(tx, staffId, reportDate);

  const [queueCount] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM bride_leads bl
    WHERE ${tx.unsafe(FEEDBACK_ELIGIBLE_BL_SQL)}
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
  `;

  const [contacted] = await tx<{ count: number }[]>`
    SELECT COUNT(DISTINCT lf.lead_id)::int AS count
    FROM lead_feedback lf
    JOIN bride_leads bl ON bl.id = lf.lead_id
    WHERE lf.submitted_by = ${staffId}::uuid
      AND lf.created_at::date = ${reportDate}::date
      AND ${tx.unsafe(FEEDBACK_ELIGIBLE_BL_SQL)}
  `;

  const feedbackToday = await tx<FeedbackRowQuery[]>`
    SELECT
      lf.id,
      lf.lead_id AS "leadId",
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      lf.connection_status AS "connectionStatus",
      lf.service_sentiment AS "serviceSentiment",
      lf.olready_rating AS "olreadyRating",
      lf.mua_rating AS "muaRating",
      lf.follow_up_at::text AS "followUpAt",
      lf.follow_up_note AS "followUpNote",
      lf.follow_up_requested AS "followUpRequested",
      lf.improvements_note AS "improvementsNote",
      lf.olready_service_note AS "olreadyServiceNote",
      lf.mua_service_note AS "muaServiceNote",
      lf.recommendations_note AS "recommendationsNote",
      lf.referrals_note AS "referralsNote",
      m.name AS "olreadyMuaName",
      lf.non_olready_mua_name AS "nonOlreadyMuaName"
    FROM lead_feedback lf
    JOIN bride_leads bl ON bl.id = lf.lead_id
    LEFT JOIN muas m ON m.id = lf.olready_mua_id
    WHERE lf.submitted_by = ${staffId}::uuid
      AND lf.created_at::date = ${reportDate}::date
      AND ${tx.unsafe(FEEDBACK_ELIGIBLE_BL_SQL)}
    ORDER BY lf.created_at ASC
  `;

  const followUpFromToday: FeedbackDayEndDetailRow[] = [];
  const feedbackGivenToday: FeedbackDayEndDetailRow[] = [];
  const refusedToday: FeedbackDayEndDetailRow[] = [];
  const negativeOlreadyToday: FeedbackDayEndRatingRow[] = [];
  const positiveOlreadyToday: FeedbackDayEndRatingRow[] = [];
  const negativeMuaToday: FeedbackDayEndRatingRow[] = [];
  const positiveMuaToday: FeedbackDayEndRatingRow[] = [];

  for (const row of feedbackToday) {
    const detailRow = mapFeedbackDetailRow(row);
    const isRefused = row.connectionStatus === "not_interested";
    const isConnectedFeedback =
      row.connectionStatus === "connected" &&
      (row.serviceSentiment != null ||
        row.olreadyRating != null ||
        row.muaRating != null);
    const isFollowUp =
      !isRefused &&
      !isConnectedFeedback &&
      (row.connectionStatus === "not_answered" ||
        row.followUpRequested ||
        row.followUpAt != null);

    if (isRefused) {
      refusedToday.push(detailRow);
    } else if (isConnectedFeedback) {
      feedbackGivenToday.push(detailRow);
    } else if (isFollowUp) {
      followUpFromToday.push(detailRow);
    }

    if (row.olreadyRating != null && row.olreadyRating <= 2) {
      negativeOlreadyToday.push({
        feedbackId: row.id,
        leadId: row.leadId,
        displayId: row.displayId,
        brideName: row.brideName,
        rating: row.olreadyRating,
        muaName: null,
        detail: buildFeedbackDetail(row),
        remarks: "",
      });
    }
    if (row.olreadyRating != null && row.olreadyRating >= 4) {
      positiveOlreadyToday.push({
        feedbackId: row.id,
        leadId: row.leadId,
        displayId: row.displayId,
        brideName: row.brideName,
        rating: row.olreadyRating,
        muaName: null,
        detail: buildFeedbackDetail(row),
        remarks: "",
      });
    }
    if (row.muaRating != null && row.muaRating <= 2) {
      negativeMuaToday.push({
        feedbackId: row.id,
        leadId: row.leadId,
        displayId: row.displayId,
        brideName: row.brideName,
        rating: row.muaRating,
        muaName: resolveMuaName(row),
        detail: buildFeedbackDetail(row),
        remarks: "",
      });
    }
    if (row.muaRating != null && row.muaRating >= 4) {
      positiveMuaToday.push({
        feedbackId: row.id,
        leadId: row.leadId,
        displayId: row.displayId,
        brideName: row.brideName,
        rating: row.muaRating,
        muaName: resolveMuaName(row),
        detail: buildFeedbackDetail(row),
        remarks: "",
      });
    }
  }

  const referralsLeadToday = await tx<FeedbackDayEndReferralLeadRow[]>`
    SELECT
      fr.id,
      bl.id AS "leadId",
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      fr.referral_name AS "referralName",
      fr.referral_phone AS "referralPhone",
      COALESCE(fr.notes, CASE WHEN fr.capture_type = 'note' THEN fr.referral_name ELSE NULL END, '') AS detail
    FROM feedback_referrals fr
    JOIN bride_leads bl ON bl.id = fr.source_lead_id
    WHERE fr.captured_by = ${staffId}::uuid
      AND fr.created_at::date = ${reportDate}::date
    ORDER BY fr.created_at ASC
  `;

  const referralsMuaToday = await tx<FeedbackDayEndReferralMuaRow[]>`
    SELECT
      mp.id,
      bl.id AS "leadId",
      bl.bride_name AS "brideName",
      mp.non_olready_mua_name AS "muaName",
      mp.phone,
      mp.city,
      COALESCE(lf.mua_service_note, lf.improvements_note, mp.non_olready_mua_name) AS detail
    FROM mua_prospects mp
    JOIN lead_feedback lf ON lf.id = mp.feedback_id
    JOIN bride_leads bl ON bl.id = mp.lead_id
    WHERE lf.submitted_by = ${staffId}::uuid
      AND mp.created_at::date = ${reportDate}::date
    ORDER BY mp.created_at ASC
  `;

  return {
    callsMade,
    talkTimeSec,
    postEventLeadsInQueue: queueCount?.count ?? 0,
    contactedToday: contacted?.count ?? 0,
    followUpFromToday: await attachFeedbackDetailCallyzer(tx, staffId, reportDate, followUpFromToday),
    feedbackGivenToday: await attachFeedbackDetailCallyzer(tx, staffId, reportDate, feedbackGivenToday),
    refusedToday: await attachFeedbackDetailCallyzer(tx, staffId, reportDate, refusedToday),
    referralsLeadToday: referralsLeadToday.map((r) => ({ ...r, remarks: "" })),
    referralsMuaToday: referralsMuaToday.map((r) => ({ ...r, remarks: "" })),
    negativeOlreadyToday: await attachFeedbackRatingCallyzer(tx, staffId, reportDate, negativeOlreadyToday),
    positiveOlreadyToday: await attachFeedbackRatingCallyzer(tx, staffId, reportDate, positiveOlreadyToday),
    negativeMuaToday: await attachFeedbackRatingCallyzer(tx, staffId, reportDate, negativeMuaToday),
    positiveMuaToday: await attachFeedbackRatingCallyzer(tx, staffId, reportDate, positiveMuaToday),
  };
}

async function autofillRmBase(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
  role: "regional_rm" | "commission_rm",
): Promise<RmDayEndPayload> {
  const month = currentMonthKey();
  const { start, end } = monthBounds(month);

  const targets = await queryTargetVsActual(tx, month, staffId, role);
  const t = targets[0];

  const bookingTarget = t?.targetBookings ?? 0;
  const bookingAchieved = t?.actualBookings ?? 0;
  const pushTarget = t?.targetLeadsWorked ?? 0;
  const pushAchieved = t?.actualPushCount ?? 0;

  const [pushToday] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM mua_pushes mp
    WHERE mp.pushed_by = ${staffId}::uuid
      AND mp.created_at::date = ${reportDate}::date
  `;

  const [bookingsToday] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM bookings b
    JOIN bride_leads bl ON bl.id = b.lead_id
    WHERE bl.assigned_rm_id = ${staffId}::uuid
      AND b.booking_date = ${reportDate}::date
      AND NOT COALESCE(b.cancelled, false)
  `;

  const [privyMtd] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM bookings b
    JOIN bride_leads bl ON bl.id = b.lead_id
    JOIN muas m ON m.id = b.mua_id
    WHERE bl.assigned_rm_id = ${staffId}::uuid
      AND m.plan_tier = 'highest_privy'::plan_tier
      AND b.booking_date >= ${start}::date
      AND b.booking_date <= ${end}::date
      AND NOT COALESCE(b.cancelled, false)
  `;

  const [privyToday] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM bookings b
    JOIN bride_leads bl ON bl.id = b.lead_id
    JOIN muas m ON m.id = b.mua_id
    WHERE bl.assigned_rm_id = ${staffId}::uuid
      AND m.plan_tier = 'highest_privy'::plan_tier
      AND b.booking_date = ${reportDate}::date
      AND NOT COALESCE(b.cancelled, false)
  `;

  const callsToday = await countCallsOnDate(tx, staffId, reportDate);
  const talkTimeSec = await sumTalkTimeOnDate(tx, staffId, reportDate);
  const conferenceCalls = await fetchConferenceLeads(tx, staffId, reportDate, role);

  const base = {
    bookingTargetVsAchieved: targetGap(bookingTarget, bookingAchieved),
    pushTargetVsAchieved: targetGap(pushTarget, pushAchieved),
    privyBookingsMtd: privyMtd?.count ?? 0,
    privyBookingsToday: privyToday?.count ?? 0,
    pushToday: pushToday?.count ?? 0,
    bookingsToday: bookingsToday?.count ?? 0,
    callsToday,
    talkTimeSec,
    conferenceCalls,
  };

  if (role === "regional_rm") {
    const [
      allPushesToday,
      allBookingsToday,
      muasWorkedToday,
      stalePlanMuasNotPushed,
    ] = await Promise.all([
      fetchAllPushesToday(tx, staffId, reportDate),
      fetchAllBookingsToday(tx, staffId, reportDate),
      fetchMuasWorkedToday(tx, staffId, reportDate),
      fetchStalePlanMuasNotPushed(tx, staffId, reportDate),
    ]);
    return {
      ...base,
      pushToday: allPushesToday.length,
      bookingsToday: allBookingsToday.length,
      allPushesToday,
      allBookingsToday,
      muasWorkedToday,
      stalePlanMuasNotPushed,
      pipelinesTomorrow: [],
    };
  }

  const [allPushesToday, allBookingsToday, muasWorkedToday, pipelinesTomorrow] =
    await Promise.all([
      fetchAllPushesToday(tx, staffId, reportDate),
      fetchAllBookingsToday(tx, staffId, reportDate),
      fetchMuasWorkedToday(tx, staffId, reportDate),
      fetchPipelinesTomorrow(tx, staffId, reportDate, role),
    ]);
  return {
    ...base,
    pushToday: allPushesToday.length,
    bookingsToday: allBookingsToday.length,
    allPushesToday,
    allBookingsToday,
    muasWorkedToday,
    stalePlanMuasNotPushed: [],
    pipelinesTomorrow,
  };
}

export async function autofillRmDayEnd(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
): Promise<RmDayEndPayload> {
  return autofillRmBase(tx, staffId, reportDate, "regional_rm");
}

export async function autofillCommissionDayEnd(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
): Promise<CommissionDayEndPayload> {
  const base = await autofillRmBase(tx, staffId, reportDate, "commission_rm");
  const month = currentMonthKey();
  const { start, end } = monthBounds(month);

  const [commissionToday] = await tx<{ amount: string }[]>`
    SELECT COALESCE(SUM(b.commission_paid), 0)::text AS amount
    FROM bookings b
    WHERE EXISTS (
        SELECT 1 FROM mua_pushes mp_rm
        WHERE mp_rm.id = b.push_id AND mp_rm.pushed_by = ${staffId}::uuid
      )
      AND COALESCE(b.commission_paid_at::date, b.booking_date) = ${reportDate}::date
      AND ${tx.unsafe(activeBookingSql("b"))}
  `;

  const [paymentsToday] = await tx<{ amount: string }[]>`
    SELECT COALESCE(SUM(b.commission_paid), 0)::text AS amount
    FROM bookings b
    WHERE EXISTS (
        SELECT 1 FROM mua_pushes mp_rm
        WHERE mp_rm.id = b.push_id AND mp_rm.pushed_by = ${staffId}::uuid
      )
      AND b.commission_paid_at::date = ${reportDate}::date
      AND COALESCE(b.commission_paid, 0) > 0
      AND ${tx.unsafe(activeBookingSql("b"))}
  `;

  const [pendingMtd] = await tx<{ amount: string }[]>`
    SELECT COALESCE(SUM(
      GREATEST(COALESCE(b.commission_amount, 0) - COALESCE(b.commission_paid, 0), 0)
    ), 0)::text AS amount
    FROM bookings b
    WHERE EXISTS (
        SELECT 1 FROM mua_pushes mp_rm
        WHERE mp_rm.id = b.push_id AND mp_rm.pushed_by = ${staffId}::uuid
      )
      AND b.booking_date >= ${start}::date
      AND b.booking_date <= ${end}::date
      AND ${tx.unsafe(activeBookingSql("b"))}
  `;

  const [pendingOverall] = await tx<{ amount: string }[]>`
    SELECT COALESCE(SUM(
      GREATEST(COALESCE(b.commission_amount, 0) - COALESCE(b.commission_paid, 0), 0)
    ), 0)::text AS amount
    FROM bookings b
    WHERE EXISTS (
        SELECT 1 FROM mua_pushes mp_rm
        WHERE mp_rm.id = b.push_id AND mp_rm.pushed_by = ${staffId}::uuid
      )
      AND ${tx.unsafe(activeBookingSql("b"))}
  `;

  const targets = await queryTargetVsActual(tx, month, staffId, "commission_rm");
  const t = targets[0];
  const commissionTarget = t?.targetCommission ?? 0;
  const commissionAchievedMtd = t?.actualCommissionCollected ?? 0;

  return {
    ...base,
    commissionTargetVsAchieved: targetGap(commissionTarget, commissionAchievedMtd),
    commissionEarnedToday: Number(commissionToday?.amount ?? 0),
    paymentsReceivedToday: Number(paymentsToday?.amount ?? 0),
    pendingPaymentsMtd: Number(pendingMtd?.amount ?? 0),
    overallPendingPayments: Number(pendingOverall?.amount ?? 0),
  };
}

export async function autofillCareDayEnd(
  tx: postgres.Sql,
  staffId: string,
  reportDate: string,
): Promise<CareDayEndPayload> {
  const creditStaffIds = await getCallyzerCreditStaffIds(tx, staffId);
  const callScoped = callLogsStaffFilter(tx, creditStaffIds);
  const callsMade = await countCallsOnDate(tx, staffId, reportDate);
  const talkTimeSec = await sumTalkTimeOnDate(tx, staffId, reportDate);

  const [openStats] = await tx<{ openTickets: number; openL2L3: number }[]>`
    SELECT
      COUNT(*) FILTER (WHERE t.status != 'closed')::int AS "openTickets",
      COUNT(*) FILTER (
        WHERE t.status != 'closed' AND t.escalation_level >= 2
      )::int AS "openL2L3"
    FROM support.tickets t
  `;

  type CareTicketQueryRow = {
    ticketId: string;
    ticketNumber: string;
    subject: string;
    category: string;
    status: string;
    priority: string | null;
    partyName: string | null;
    partyType: string;
    partyPhone: string | null;
    daysSinceOpen: number;
    escalationLevel: number;
    lastContact: string | null;
    todayAction: string | null;
  };

  function careTicketSelect() {
    return tx`
      SELECT
        t.id AS "ticketId",
        t.ticket_number AS "ticketNumber",
        LEFT(t.complaint_text, 120) AS subject,
        t.category,
        t.status::text AS status,
        t.urgency::text AS priority,
        COALESCE(m.name, bl.bride_name, t.raised_by_name, 'Unknown') AS "partyName",
        t.raised_by_type::text AS "partyType",
        COALESCE(m.phone, m.whatsapp, bl.phone, t.raised_by_phone) AS "partyPhone",
        GREATEST(0, (CURRENT_DATE - t.created_at::date))::int AS "daysSinceOpen",
        t.escalation_level AS "escalationLevel",
        t.updated_at::text AS "lastContact",
        (
          SELECT string_agg(action, ' · ' ORDER BY created_at DESC)
          FROM (
            SELECT c.created_at, CONCAT(
              REPLACE(c.entry_type::text, '_', ' '),
              ': ',
              LEFT(COALESCE(c.description, ''), 100)
            ) AS action
            FROM comms c
            WHERE c.actor_id = ${staffId}::uuid
              AND c.created_at::date = ${reportDate}::date
              AND (c.mua_id = t.mua_id OR c.lead_id = t.lead_id)
            UNION ALL
            SELECT tu.created_at, CONCAT('Update: ', LEFT(tu.update_text, 100))
            FROM support.ticket_updates tu
            WHERE tu.ticket_id = t.id
              AND tu.created_by = ${staffId}::uuid
              AND tu.created_at::date = ${reportDate}::date
            UNION ALL
            SELECT tt.updated_at, CONCAT('Task done: ', LEFT(tt.title, 80))
            FROM support.ticket_tasks tt
            WHERE tt.ticket_id = t.id
              AND tt.assigned_to = ${staffId}::uuid
              AND tt.status = 'done'
              AND tt.updated_at::date = ${reportDate}::date
            UNION ALL
            SELECT tc.created_at, CONCAT('Note: ', LEFT(tc.body, 100))
            FROM support.ticket_comments tc
            WHERE tc.ticket_id = t.id
              AND tc.author_id = ${staffId}::uuid
              AND tc.created_at::date = ${reportDate}::date
            ORDER BY created_at DESC
            LIMIT 5
          ) acts
        ) AS "todayAction"
    `;
  }

  function mapCareTicketRow(row: CareTicketQueryRow): CareTicketRow {
    const issueSummary = `${TICKET_CATEGORY_LABELS[row.category] ?? row.category.replace(/_/g, " ")} · ${row.subject}`;
    return {
      ticketId: row.ticketId,
      ticketNumber: row.ticketNumber,
      subject: row.subject,
      partyName: row.partyName ?? undefined,
      partyType: (row.partyType === "bride" || row.partyType === "mua" ? row.partyType : "other") as
        | "bride"
        | "mua"
        | "other",
      partyPhone: row.partyPhone,
      issueSummary,
      status: row.status,
      todayAction: row.todayAction ?? "—",
      daysSinceOpen: row.daysSinceOpen,
      escalationLevel: row.escalationLevel,
      priority: row.priority ?? undefined,
      lastContact: row.lastContact,
      remarks: "",
    };
  }

  const issuesListToday = await tx<CareTicketQueryRow[]>`
    ${careTicketSelect()}
    FROM support.tickets t
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    WHERE t.status != 'closed'
      AND t.created_at::date = ${reportDate}::date
    ORDER BY t.created_at DESC
    LIMIT 50
  `;

  const issuesAddressedToday = await tx<CareTicketQueryRow[]>`
    SELECT DISTINCT ON (t.id)
      t.id AS "ticketId",
      t.ticket_number AS "ticketNumber",
      LEFT(t.complaint_text, 120) AS subject,
      t.category,
      t.status::text AS status,
      t.urgency::text AS priority,
      COALESCE(m.name, bl.bride_name, t.raised_by_name, 'Unknown') AS "partyName",
      t.raised_by_type::text AS "partyType",
      COALESCE(m.phone, m.whatsapp, bl.phone, t.raised_by_phone) AS "partyPhone",
      GREATEST(0, (CURRENT_DATE - t.created_at::date))::int AS "daysSinceOpen",
      t.escalation_level AS "escalationLevel",
      COALESCE(
        (
          SELECT MAX(cl.called_at)::text
          FROM call_logs cl
          JOIN muas m2 ON m2.id = t.mua_id
          WHERE ${callScoped}
            AND ${callLogOnIstDate(tx, reportDate)}
            AND (
              cl.client_phone = m2.phone OR cl.client_phone = m2.whatsapp
            )
        ),
        (
          SELECT MAX(c.created_at)::text
          FROM comms c
          WHERE c.actor_id = ${staffId}::uuid
            AND c.created_at::date = ${reportDate}::date
            AND c.entry_type::text LIKE 'care_%'
            AND (c.mua_id = t.mua_id OR c.lead_id = t.lead_id)
        ),
        t.updated_at::text
      ) AS "lastContact",
      (
        SELECT string_agg(action, ' · ' ORDER BY created_at DESC)
        FROM (
          SELECT c.created_at, CONCAT(
            REPLACE(c.entry_type::text, '_', ' '),
            ': ',
            LEFT(COALESCE(c.description, ''), 100)
          ) AS action
          FROM comms c
          WHERE c.actor_id = ${staffId}::uuid
            AND c.created_at::date = ${reportDate}::date
            AND (c.mua_id = t.mua_id OR c.lead_id = t.lead_id)
          UNION ALL
          SELECT tu.created_at, CONCAT('Update: ', LEFT(tu.update_text, 100))
          FROM support.ticket_updates tu
          WHERE tu.ticket_id = t.id
            AND tu.created_by = ${staffId}::uuid
            AND tu.created_at::date = ${reportDate}::date
          UNION ALL
          SELECT tt.updated_at, CONCAT('Task done: ', LEFT(tt.title, 80))
          FROM support.ticket_tasks tt
          WHERE tt.ticket_id = t.id
            AND tt.assigned_to = ${staffId}::uuid
            AND tt.status = 'done'
            AND tt.updated_at::date = ${reportDate}::date
          ORDER BY created_at DESC
          LIMIT 5
        ) acts
      ) AS "todayAction"
    FROM support.tickets t
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    LEFT JOIN support.ticket_tasks tt
      ON tt.ticket_id = t.id AND tt.assigned_to = ${staffId}::uuid
    WHERE (
      (tt.status = 'done' AND tt.updated_at::date = ${reportDate}::date)
      OR (
        t.assigned_to = ${staffId}::uuid
        AND t.updated_at::date = ${reportDate}::date
        AND t.status = 'closed'
      )
      OR EXISTS (
        SELECT 1 FROM comms c
        WHERE c.actor_id = ${staffId}::uuid
          AND c.created_at::date = ${reportDate}::date
          AND c.entry_type::text LIKE 'care_%'
          AND (c.mua_id = t.mua_id OR c.lead_id = t.lead_id)
      )
      OR EXISTS (
        SELECT 1 FROM call_logs cl
        JOIN muas m3 ON m3.id = t.mua_id
        WHERE ${callScoped}
          AND ${callLogOnIstDate(tx, reportDate)}
          AND (cl.client_phone = m3.phone OR cl.client_phone = m3.whatsapp)
      )
    )
    ORDER BY t.id, tt.updated_at DESC NULLS LAST
    LIMIT 50
  `;

  const ticketsClosedToday = await tx<CareTicketQueryRow[]>`
    ${careTicketSelect()}
    FROM support.tickets t
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    WHERE t.status = 'closed'
      AND COALESCE(t.closed_at, t.updated_at)::date = ${reportDate}::date
      AND (
        t.assigned_to = ${staffId}::uuid
        OR t.closed_by = ${staffId}::uuid
        OR EXISTS (
          SELECT 1 FROM comms c
          WHERE c.actor_id = ${staffId}::uuid
            AND c.created_at::date = ${reportDate}::date
            AND c.entry_type::text LIKE 'care_%'
            AND (c.mua_id = t.mua_id OR c.lead_id = t.lead_id)
        )
      )
    ORDER BY COALESCE(t.closed_at, t.updated_at) DESC
    LIMIT 50
  `;

  const urgentIssues = await tx<CareTicketQueryRow[]>`
    ${careTicketSelect()}
    FROM support.tickets t
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    WHERE t.status != 'closed'
      AND t.escalation_level >= 2
    ORDER BY t.escalation_level DESC, t.updated_at ASC
    LIMIT 30
  `;

  const callyzerRows = await tx<
    {
      callLogId: string;
      durationSec: number;
      calledAt: string | null;
      direction: string | null;
      ticketId: string | null;
      ticketNumber: string | null;
      category: string | null;
      subject: string | null;
      muaName: string;
      muaPhone: string | null;
    }[]
  >`
    SELECT DISTINCT ON (cl.id)
      cl.id AS "callLogId",
      cl.duration_sec AS "durationSec",
      cl.called_at::text AS "calledAt",
      cl.direction::text AS direction,
      tk.id AS "ticketId",
      tk.ticket_number AS "ticketNumber",
      tk.category,
      LEFT(tk.complaint_text, 80) AS subject,
      m.name AS "muaName",
      COALESCE(m.phone, m.whatsapp) AS "muaPhone"
    FROM call_logs cl
    JOIN muas m ON (
      length(regexp_replace(COALESCE(cl.client_phone, ''), '\\D', '', 'g')) >= 10
      AND regexp_replace(COALESCE(cl.client_phone, ''), '\\D', '', 'g')
        LIKE '%' || right(
          regexp_replace(COALESCE(m.phone, m.whatsapp, ''), '\\D', '', 'g'),
          10
        )
    )
    JOIN LATERAL (
      SELECT id, ticket_number, category, complaint_text, updated_at
      FROM support.tickets
      WHERE mua_id = m.id
        AND status != 'closed'
      ORDER BY updated_at DESC
      LIMIT 1
    ) tk ON true
    WHERE ${callScoped}
      AND ${callLogOnIstDate(tx, reportDate)}
    ORDER BY cl.id, tk.updated_at DESC NULLS LAST
    LIMIT 50
  `;

  const discussionRows = await tx<CareTicketQueryRow[]>`
    SELECT DISTINCT ON (t.id)
      t.id AS "ticketId",
      t.ticket_number AS "ticketNumber",
      LEFT(t.complaint_text, 120) AS subject,
      t.category,
      t.status::text AS status,
      t.urgency::text AS priority,
      COALESCE(m.name, bl.bride_name, t.raised_by_name, 'Unknown') AS "partyName",
      t.raised_by_type::text AS "partyType",
      COALESCE(m.phone, m.whatsapp, bl.phone, t.raised_by_phone) AS "partyPhone",
      GREATEST(0, (CURRENT_DATE - t.created_at::date))::int AS "daysSinceOpen",
      t.escalation_level AS "escalationLevel",
      src.created_at::text AS "lastContact",
      src.detail AS "todayAction"
    FROM support.tickets t
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    JOIN LATERAL (
      SELECT tc.created_at, CONCAT(
        COALESCE(s.name, 'Staff'),
        ': ',
        LEFT(tc.body, 160)
      ) AS detail
      FROM support.ticket_comments tc
      LEFT JOIN staff s ON s.id = tc.author_id
      WHERE tc.ticket_id = t.id
        AND tc.is_internal = true
        AND tc.created_at::date = ${reportDate}::date
        AND (
          tc.author_id = ${staffId}::uuid
          OR s.role IN ('admin', 'owner')
        )
      UNION ALL
      SELECT ti.created_at, CONCAT(
        'Admin ',
        COALESCE(a.name, 'action'),
        ' — ',
        REPLACE(ti.action, '_', ' '),
        CASE
          WHEN ti.payload->>'brief' IS NOT NULL
          THEN CONCAT(': ', LEFT(ti.payload->>'brief', 120))
          ELSE ''
        END
      )
      FROM support.ticket_interventions ti
      LEFT JOIN staff a ON a.id = ti.admin_id
      WHERE ti.ticket_id = t.id
        AND ti.created_at::date = ${reportDate}::date
      ORDER BY created_at DESC
      LIMIT 1
    ) src ON true
    WHERE t.assigned_to = ${staffId}::uuid
       OR t.assigned_admin_id IS NOT NULL
    ORDER BY t.id, src.created_at DESC
    LIMIT 30
  `;

  const chatSupportActivity = await tx<
    {
      inquiryId: string;
      displayId: string;
      visitorName: string;
      visitorKind: string;
      phone: string | null;
      detail: string;
    }[]
  >`
    SELECT
      si.id AS "inquiryId",
      si.display_id AS "displayId",
      si.name AS "visitorName",
      si.visitor_kind AS "visitorKind",
      si.phone,
      CONCAT(
        CASE si.status::text
          WHEN 'done' THEN 'Completed'
          WHEN 'in_progress' THEN 'In progress'
          WHEN 'pending' THEN 'Pending'
          WHEN 'cancelled' THEN 'Cancelled'
          ELSE INITCAP(REPLACE(si.status::text, '_', ' '))
        END,
        ' · ',
        COALESCE(
          NULLIF(TRIM(si.completion_notes), ''),
          NULLIF(TRIM(si.completion_outcome), ''),
          NULLIF(TRIM(si.message), ''),
          'Chat support'
        )
      ) AS detail
    FROM support.support_inquiries si
    WHERE (
      si.assigned_to = ${staffId}::uuid
      OR si.completed_by = ${staffId}::uuid
    )
      AND (
        si.created_at::date = ${reportDate}::date
        OR si.updated_at::date = ${reportDate}::date
        OR si.completed_at::date = ${reportDate}::date
      )
    ORDER BY COALESCE(si.completed_at, si.updated_at, si.created_at) DESC
    LIMIT 40
  `;

  const [tasksDone] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM support.ticket_tasks tt
    WHERE tt.assigned_to = ${staffId}::uuid
      AND tt.status = 'done'
      AND tt.updated_at::date = ${reportDate}::date
  `;

  const [pendingTasks] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM support.ticket_tasks tt
    WHERE tt.assigned_to = ${staffId}::uuid
      AND tt.status IN ('pending', 'in_progress')
  `;

  return {
    totalOpenTickets: openStats?.openTickets ?? 0,
    callsMade,
    talkTimeSec,
    openL2L3Count: openStats?.openL2L3 ?? 0,
    callyzerMuaContacts: callyzerRows
      .filter((row) => row.ticketId)
      .map((row) => {
      const direction =
        row.direction === "inbound" || row.direction === "outbound" ? row.direction : null;
      const categoryLabel = row.category
        ? (TICKET_CATEGORY_LABELS[row.category] ?? row.category.replace(/_/g, " "))
        : "Ticket";
      return {
        callLogId: row.callLogId,
        ticketId: row.ticketId!,
        ticketNumber: row.ticketNumber ?? "—",
        muaName: row.muaName,
        muaPhone: row.muaPhone,
        issueSummary: row.subject ? `${categoryLabel} · ${row.subject}` : categoryLabel,
        callyzer: {
          durationSec: row.durationSec ?? 0,
          calledAt: row.calledAt,
          direction,
        },
        remarks: "",
      };
    }),
    ticketsClosedToday: ticketsClosedToday.map(mapCareTicketRow),
    issuesListToday: issuesListToday.map(mapCareTicketRow),
    issuesAddressedToday: issuesAddressedToday.map(mapCareTicketRow),
    urgentIssues: urgentIssues.map(mapCareTicketRow),
    tasksDoneToday: tasksDone?.count ?? 0,
    pendingTasks: pendingTasks?.count ?? 0,
    discussionPoints: discussionRows.map((row) => ({
      ...mapCareTicketRow(row),
      detail: row.todayAction ?? "",
    })),
    chatSupportActivity: chatSupportActivity.map((row) => ({ ...row, remarks: "" })),
    manualTickets: [],
  };
}

export async function autofillDayEndPayload(
  tx: postgres.Sql,
  templateKey: DayEndTemplateKey,
  staffId: string,
  reportDate: string,
) {
  switch (templateKey) {
    case "sales":
      return autofillSalesDayEnd(tx, staffId, reportDate);
    case "sales_ops":
      return autofillSalesOpsDayEnd(tx, staffId, reportDate);
    case "lead_uploader":
      return autofillLeadUploaderDayEnd(tx, staffId, reportDate);
    case "activation":
      return autofillActivationDayEnd(tx, staffId, reportDate);
    case "feedback":
      return autofillFeedbackDayEnd(tx, staffId, reportDate);
    case "rm":
      return autofillRmDayEnd(tx, staffId, reportDate);
    case "commission":
      return autofillCommissionDayEnd(tx, staffId, reportDate);
    case "care":
      return autofillCareDayEnd(tx, staffId, reportDate);
    default:
      return {};
  }
}
