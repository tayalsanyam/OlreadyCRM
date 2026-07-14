import { sql } from "@/db/index";
import {
  overviewMonthToDateRange,
  previousOverviewMonth,
} from "@/lib/admin-overview-date-range";
import { activeBookingSql, rmStaffBookingCreditSql } from "@/lib/active-bookings";
import { monthBounds } from "@/lib/targets";

export type DashboardKpis = {
  activeLeads: number;
  commissionPipeline: number;
  criticalBand: number;
  approachingShift: number;
  bookingsMtd: number;
  activeLeadsDelta: number;
  bookingsMtdDelta: number;
  criticalBandDelta: number | null;
  approachingShiftDelta: number | null;
};

export type DashboardCallyzerSummary = {
  mappedStaff: number;
  callsMtd: number;
  talkMinutesMtd: number;
  staleStaff: number;
  lastSyncAt: string | null;
};

export type DashboardStaffRow = {
  id: string;
  name: string;
  role: "regional_rm" | "commission_rm";
  region: string | null;
  activeLeads: number;
  bookedMtd: number;
  pushesMtd: number;
  criticalUntouched: number;
  pendingConfirmation: number;
  overdueTasks: number;
  bypassesWeek: number;
  conversionRate: number;
  hasCallyzer: boolean;
  callsMtd: number;
  talkMinutesMtd: number;
  lastCallAt: string | null;
  daysSinceLastCall: number | null;
};

export async function fetchAdminDashboardKpis(month: string): Promise<DashboardKpis> {
  const { dateFrom, dateTo } = overviewMonthToDateRange(month);
  const prevMonth = previousOverviewMonth(month);
  const { start: prevStart, end: prevEnd } = monthBounds(prevMonth);

  const [row] = await sql<
    {
      activeLeads: number;
      commissionPipeline: number;
      criticalBand: number;
      approachingShift: number;
      bookingsMtd: number;
      activeLeadsLastWeek: number;
      bookingsLastMonth: number;
    }[]
  >`
    SELECT
      (SELECT COUNT(*)::int FROM bride_leads
        WHERE status IN ('assigned', 'commission_rm')) AS active_leads,
      (SELECT COUNT(*)::int FROM bride_leads
        WHERE status = 'commission_rm') AS commission_pipeline,
      (SELECT COUNT(*)::int FROM leads_full
        WHERE urgency_band = 'critical' AND status = 'assigned') AS critical_band,
      (SELECT COUNT(*)::int FROM leads_full
        WHERE status = 'assigned'
          AND days_since_assignment >= (SELECT shift_warning_day FROM sla_config WHERE id = 1)
      ) AS approaching_shift,
      (SELECT COUNT(*)::int FROM bookings b
        WHERE ${sql.unsafe(activeBookingSql("b"))}
          AND b.booking_date >= ${dateFrom}::date
          AND b.booking_date <= ${dateTo}::date
      ) AS bookings_mtd,
      (SELECT COUNT(*)::int FROM bride_leads
        WHERE status IN ('assigned', 'commission_rm')
          AND created_at <= NOW() - INTERVAL '7 days') AS active_leads_last_week,
      (SELECT COUNT(*)::int FROM bookings b
        WHERE ${sql.unsafe(activeBookingSql("b"))}
          AND b.booking_date >= ${prevStart}::date
          AND b.booking_date <= ${prevEnd}::date
      ) AS bookings_last_month
  `;

  return {
    activeLeads: row.activeLeads,
    commissionPipeline: row.commissionPipeline,
    criticalBand: row.criticalBand,
    approachingShift: row.approachingShift,
    bookingsMtd: row.bookingsMtd,
    activeLeadsDelta: row.activeLeads - row.activeLeadsLastWeek,
    bookingsMtdDelta: row.bookingsMtd - row.bookingsLastMonth,
    criticalBandDelta: null,
    approachingShiftDelta: null,
  };
}

export async function fetchAdminDashboardPortfolio(month: string): Promise<DashboardStaffRow[]> {
  const { dateFrom, dateTo } = overviewMonthToDateRange(month);

  const rows = await sql<
    {
      id: string;
      name: string;
      role: string;
      region: string | null;
      activeLeads: number;
      bookedMtd: number;
      pushesMtd: number;
      criticalUntouched: number;
      pendingConfirmation: number;
      overdueTasks: number;
      bypassesWeek: number;
      conversionRate: number | null;
      hasCallyzer: boolean;
      callsMtd: number;
      callDurationSecMtd: number;
      lastCallAt: string | null;
    }[]
  >`
    SELECT
      s.id,
      s.name,
      s.role::text AS role,
      s.region::text AS region,
      COUNT(DISTINCT bl.id) FILTER (
        WHERE (s.role = 'regional_rm' AND bl.status = 'assigned')
           OR (s.role = 'commission_rm' AND bl.status = 'commission_rm')
      )::int AS active_leads,
      (
        SELECT COUNT(*)::int
        FROM bookings b
        JOIN bride_leads bl2 ON bl2.id = b.lead_id
        WHERE ${sql.unsafe(rmStaffBookingCreditSql({ leadAlias: "bl2" }))}
          AND ${sql.unsafe(activeBookingSql("b"))}
          AND b.booking_date >= ${dateFrom}::date
          AND b.booking_date <= ${dateTo}::date
      ) AS booked_mtd,
      (
        SELECT COUNT(*)::int
        FROM mua_pushes mp2
        WHERE mp2.pushed_by = s.id
          AND mp2.created_at >= ${dateFrom}::timestamptz
          AND mp2.created_at < (${dateTo}::date + INTERVAL '1 day')
      ) AS pushes_mtd,
      COUNT(DISTINCT bl.id) FILTER (
        WHERE s.role = 'regional_rm'
          AND bl.status = 'assigned'
          AND compute_urgency_band(bl.event_date) = 'critical'
          AND NOT EXISTS (
            SELECT 1 FROM comms c
            WHERE c.lead_id = bl.id
              AND c.created_at > NOW() - INTERVAL '48 hours'
          )
      )::int AS critical_untouched,
      COUNT(DISTINCT bl.id) FILTER (
        WHERE s.role = 'commission_rm'
          AND bl.status = 'commission_rm'
          AND bl.confirmation_status = 'pending'
      )::int AS pending_confirmation,
      (
        SELECT COUNT(*)::int
        FROM rm_tasks t
        WHERE t.staff_id = s.id
          AND t.status = 'pending'
          AND t.task_type IN ('bride_confirmation', 'share_profiles', 'lead_progress_follow_up')
          AND t.due_date < CURRENT_DATE
      ) AS overdue_tasks,
      COUNT(mp.id) FILTER (
        WHERE s.role = 'regional_rm'
          AND mp.bypass_reason IS NOT NULL
          AND mp.created_at >= date_trunc('week', NOW())
      )::int AS bypasses_week,
      ROUND(
        100.0 * COUNT(DISTINCT bl.id) FILTER (WHERE bl.status = 'booked') /
        NULLIF(
          COUNT(DISTINCT bl.id) FILTER (
            WHERE bl.status IN ('assigned', 'booked', 'commission_rm')
          ),
          0
        ),
        1
      )::float AS conversion_rate,
      (
        s.callyzer_number IS NOT NULL
        AND length(regexp_replace(s.callyzer_number, '\D', '', 'g')) >= 10
      ) AS has_callyzer,
      (
        SELECT COUNT(*)::int
        FROM call_logs cl
        WHERE cl.staff_id = s.id
          AND cl.called_at >= ${dateFrom}::timestamptz
          AND cl.called_at < (${dateTo}::date + INTERVAL '1 day')
      ) AS calls_mtd,
      (
        SELECT COALESCE(SUM(cl.duration_sec), 0)::int
        FROM call_logs cl
        WHERE cl.staff_id = s.id
          AND cl.called_at >= ${dateFrom}::timestamptz
          AND cl.called_at < (${dateTo}::date + INTERVAL '1 day')
      ) AS call_duration_sec_mtd,
      (
        SELECT MAX(cl.called_at)
        FROM call_logs cl
        WHERE cl.staff_id = s.id
      ) AS last_call_at
    FROM staff s
    LEFT JOIN bride_leads bl ON bl.assigned_rm_id = s.id
    LEFT JOIN mua_pushes mp ON mp.lead_id = bl.id AND mp.pushed_by = s.id
    WHERE s.role IN ('regional_rm'::user_role, 'commission_rm'::user_role)
      AND s.active = true
    GROUP BY s.id, s.name, s.role, s.region
    ORDER BY
      CASE s.role WHEN 'regional_rm' THEN 0 ELSE 1 END,
      s.region NULLS LAST,
      s.name
  `;

  return rows.map((r) => {
    const daysSinceLastCall =
      r.lastCallAt == null
        ? null
        : Math.floor((Date.now() - new Date(r.lastCallAt).getTime()) / (1000 * 60 * 60 * 24));
    return {
      id: r.id,
      name: r.name,
      role: r.role as DashboardStaffRow["role"],
      region: r.region,
      activeLeads: r.activeLeads,
      bookedMtd: r.bookedMtd,
      pushesMtd: r.pushesMtd,
      criticalUntouched: r.criticalUntouched,
      pendingConfirmation: r.pendingConfirmation,
      overdueTasks: r.overdueTasks,
      bypassesWeek: r.bypassesWeek,
      conversionRate: r.conversionRate ?? 0,
      hasCallyzer: r.hasCallyzer,
      callsMtd: r.callsMtd,
      talkMinutesMtd: Math.round(r.callDurationSecMtd / 60),
      lastCallAt: r.lastCallAt,
      daysSinceLastCall,
    };
  });
}

export async function fetchAdminDashboardCallyzerSummary(month: string): Promise<DashboardCallyzerSummary> {
  const { dateFrom, dateTo } = overviewMonthToDateRange(month);

  const [row] = await sql<
    {
      mappedStaff: number;
      callsMtd: number;
      durationSecMtd: number;
      staleStaff: number;
      lastSyncAt: string | null;
    }[]
  >`
    SELECT
      (
        SELECT COUNT(*)::int
        FROM staff s
        WHERE s.active = true
          AND s.role IN ('regional_rm'::user_role, 'commission_rm'::user_role)
          AND s.callyzer_number IS NOT NULL
          AND length(regexp_replace(s.callyzer_number, '\D', '', 'g')) >= 10
      ) AS mapped_staff,
      (
        SELECT COUNT(*)::int
        FROM call_logs cl
        JOIN staff s ON s.id = cl.staff_id
        WHERE s.role IN ('regional_rm'::user_role, 'commission_rm'::user_role)
          AND cl.called_at >= ${dateFrom}::timestamptz
          AND cl.called_at < (${dateTo}::date + INTERVAL '1 day')
      ) AS calls_mtd,
      (
        SELECT COALESCE(SUM(cl.duration_sec), 0)::int
        FROM call_logs cl
        JOIN staff s ON s.id = cl.staff_id
        WHERE s.role IN ('regional_rm'::user_role, 'commission_rm'::user_role)
          AND cl.called_at >= ${dateFrom}::timestamptz
          AND cl.called_at < (${dateTo}::date + INTERVAL '1 day')
      ) AS duration_sec_mtd,
      (
        SELECT COUNT(*)::int
        FROM staff s
        WHERE s.active = true
          AND s.role IN ('regional_rm'::user_role, 'commission_rm'::user_role)
          AND s.callyzer_number IS NOT NULL
          AND length(regexp_replace(s.callyzer_number, '\D', '', 'g')) >= 10
          AND NOT EXISTS (
            SELECT 1
            FROM call_logs cl
            WHERE cl.staff_id = s.id
              AND cl.called_at >= NOW() - INTERVAL '3 day'
          )
      ) AS stale_staff,
      (
        SELECT MAX(cl.created_at)
        FROM call_logs cl
        JOIN staff s ON s.id = cl.staff_id
        WHERE s.role IN ('regional_rm'::user_role, 'commission_rm'::user_role)
      ) AS last_sync_at
  `;

  return {
    mappedStaff: row.mappedStaff,
    callsMtd: row.callsMtd,
    talkMinutesMtd: Math.round(row.durationSecMtd / 60),
    staleStaff: row.staleStaff,
    lastSyncAt: row.lastSyncAt,
  };
}
