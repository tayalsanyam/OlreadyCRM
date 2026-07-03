import { sql } from "@/db/index";
import { fromDbPlanTier, toDbPlanTier } from "@/lib/db-mappers";
import { FEEDBACK_BOOKING_LEAD_PREDICATE } from "@/lib/bookings-filter-sql";
import { leadTracksCommissionSync } from "@/lib/lead-tracks-commission";
import type { PlanTier, Region } from "@/lib/types";

export type AdminBookingsByMuaFilters = {
  region?: Region | null;
  regionalRmId?: string | null;
  /** @deprecated use regionalRmId */
  rmId?: string | null;
  commissionRmId?: string | null;
  selfBooking?: "all" | "yes" | "no";
  planTier?: PlanTier | null;
  q?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
};

export type MuaBookingSummary = {
  muaId: string;
  muaName: string;
  planTier: PlanTier | null;
  formalBookings: number;
  feedbackBookings: number;
  totalBookings: number;
  totalRevenue: number;
  avgBookingValue: number;
  lastBookingDate: string | null;
};

export type AdminBookingByMuaRow = {
  muaId: string;
  muaName: string;
  leadId: string;
  displayId: string;
  brideName: string;
  ceremonyType: string | null;
  eventDate: string | null;
  bookingDate: string;
  source: "formal" | "feedback";
  bookedPrice: number | null;
  tracksCommission: boolean;
  commissionAmount: number | null;
  commissionPaid: number | null;
};

function monthToBounds(month: string | null): { from: string | null; to: string | null } {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return { from: null, to: null };
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y!, m!, 0).getDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, "0")}`,
  };
}

export function resolveByMuaDateBounds(opts: {
  fromDate?: string | null;
  toDate?: string | null;
  month?: string | null;
}): { fromDate: string | null; toDate: string | null } {
  if (opts.fromDate || opts.toDate) {
    return { fromDate: opts.fromDate ?? null, toDate: opts.toDate ?? null };
  }
  const monthBounds = monthToBounds(opts.month ?? null);
  return { fromDate: monthBounds.from, toDate: monthBounds.to };
}

export async function fetchAdminBookingsByMua(
  filters: AdminBookingsByMuaFilters
): Promise<MuaBookingSummary[]> {
  const region = filters.region ?? null;
  const regionalRmId = filters.regionalRmId ?? filters.rmId ?? null;
  const commissionRmId = filters.commissionRmId ?? null;
  const selfBooking = filters.selfBooking ?? "all";
  const planDb = filters.planTier ? toDbPlanTier(filters.planTier) : null;
  const fromDate = filters.fromDate ?? null;
  const toDate = filters.toDate ?? null;
  const qLike = filters.q?.trim() ? `%${filters.q.trim()}%` : null;

  const rows = await sql<
    {
      muaId: string;
      muaName: string;
      planTier: string | null;
      formalBookings: number;
      feedbackBookings: number;
      totalRevenue: string;
      avgBookingValue: string;
      lastBookingDate: string | null;
    }[]
  >`
    SELECT
      m.id AS "muaId",
      m.name AS "muaName",
      m.plan_tier::text AS "planTier",
      COUNT(b.id) FILTER (
        WHERE ${selfBooking}::text IN ('all', 'no')
          AND NOT COALESCE(b.cancelled, false)
          AND (${fromDate}::date IS NULL OR b.booking_date >= ${fromDate}::date)
          AND (${toDate}::date IS NULL OR b.booking_date <= ${toDate}::date)
          AND (${region}::text IS NULL OR bl.region = ${region}::region)
          AND (${regionalRmId}::uuid IS NULL OR bl.assigned_rm_id = ${regionalRmId}::uuid)
          AND (
            ${commissionRmId}::uuid IS NULL
            OR EXISTS (
              SELECT 1 FROM mua_pushes mp_f
              WHERE mp_f.id = b.push_id AND mp_f.pushed_by = ${commissionRmId}::uuid
            )
          )
      )::int AS "formalBookings",
      (
        SELECT COUNT(*)::int
        FROM lead_feedback lf
        JOIN bride_leads bl2 ON bl2.id = lf.lead_id
        WHERE lf.olready_mua_id = m.id
          AND ${selfBooking}::text IN ('all', 'yes')
          AND ${sql.unsafe(FEEDBACK_BOOKING_LEAD_PREDICATE)}
          AND (${fromDate}::date IS NULL OR lf.created_at::date >= ${fromDate}::date)
          AND (${toDate}::date IS NULL OR lf.created_at::date <= ${toDate}::date)
          AND (${region}::text IS NULL OR bl2.region = ${region}::region)
          AND (${regionalRmId}::uuid IS NULL OR bl2.assigned_rm_id = ${regionalRmId}::uuid)
          AND (
            ${commissionRmId}::uuid IS NULL
            OR EXISTS (
              SELECT 1 FROM mua_pushes mp_fb
              WHERE mp_fb.mua_id = m.id AND mp_fb.pushed_by = ${commissionRmId}::uuid
            )
          )
      ) AS "feedbackBookings",
      COALESCE(
        SUM(b.booked_price) FILTER (
          WHERE ${selfBooking}::text IN ('all', 'no')
            AND NOT COALESCE(b.cancelled, false)
            AND (${fromDate}::date IS NULL OR b.booking_date >= ${fromDate}::date)
            AND (${toDate}::date IS NULL OR b.booking_date <= ${toDate}::date)
            AND (${region}::text IS NULL OR bl.region = ${region}::region)
            AND (${regionalRmId}::uuid IS NULL OR bl.assigned_rm_id = ${regionalRmId}::uuid)
            AND (
              ${commissionRmId}::uuid IS NULL
              OR EXISTS (
                SELECT 1 FROM mua_pushes mp_f
                WHERE mp_f.id = b.push_id AND mp_f.pushed_by = ${commissionRmId}::uuid
              )
            )
        ),
        0
      ) AS "totalRevenue",
      COALESCE(
        AVG(b.booked_price) FILTER (
          WHERE ${selfBooking}::text IN ('all', 'no')
            AND NOT COALESCE(b.cancelled, false)
            AND (${fromDate}::date IS NULL OR b.booking_date >= ${fromDate}::date)
            AND (${toDate}::date IS NULL OR b.booking_date <= ${toDate}::date)
            AND (${region}::text IS NULL OR bl.region = ${region}::region)
            AND (${regionalRmId}::uuid IS NULL OR bl.assigned_rm_id = ${regionalRmId}::uuid)
            AND (
              ${commissionRmId}::uuid IS NULL
              OR EXISTS (
                SELECT 1 FROM mua_pushes mp_f
                WHERE mp_f.id = b.push_id AND mp_f.pushed_by = ${commissionRmId}::uuid
              )
            )
        ),
        0
      ) AS "avgBookingValue",
      GREATEST(
        MAX(b.booking_date) FILTER (
          WHERE ${selfBooking}::text IN ('all', 'no')
            AND NOT COALESCE(b.cancelled, false)
            AND (${fromDate}::date IS NULL OR b.booking_date >= ${fromDate}::date)
            AND (${toDate}::date IS NULL OR b.booking_date <= ${toDate}::date)
            AND (${region}::text IS NULL OR bl.region = ${region}::region)
            AND (${regionalRmId}::uuid IS NULL OR bl.assigned_rm_id = ${regionalRmId}::uuid)
            AND (
              ${commissionRmId}::uuid IS NULL
              OR EXISTS (
                SELECT 1 FROM mua_pushes mp_f
                WHERE mp_f.id = b.push_id AND mp_f.pushed_by = ${commissionRmId}::uuid
              )
            )
        ),
        (
          SELECT MAX(lf.created_at::date)
          FROM lead_feedback lf
          JOIN bride_leads bl2 ON bl2.id = lf.lead_id
          WHERE lf.olready_mua_id = m.id
            AND ${selfBooking}::text IN ('all', 'yes')
            AND ${sql.unsafe(FEEDBACK_BOOKING_LEAD_PREDICATE)}
            AND (${fromDate}::date IS NULL OR lf.created_at::date >= ${fromDate}::date)
            AND (${toDate}::date IS NULL OR lf.created_at::date <= ${toDate}::date)
            AND (${region}::text IS NULL OR bl2.region = ${region}::region)
            AND (${regionalRmId}::uuid IS NULL OR bl2.assigned_rm_id = ${regionalRmId}::uuid)
            AND (
              ${commissionRmId}::uuid IS NULL
              OR EXISTS (
                SELECT 1 FROM mua_pushes mp_fb
                WHERE mp_fb.mua_id = m.id AND mp_fb.pushed_by = ${commissionRmId}::uuid
              )
            )
        )
      ) AS "lastBookingDate"
    FROM muas m
    LEFT JOIN bookings b ON b.mua_id = m.id
    LEFT JOIN bride_leads bl ON bl.id = b.lead_id
    WHERE (${planDb}::text IS NULL OR m.plan_tier = ${planDb}::plan_tier)
      AND (
        ${qLike}::text IS NULL
        OR m.name ILIKE ${qLike}
        OR m.display_id ILIKE ${qLike}
      )
    GROUP BY m.id, m.name, m.plan_tier
    HAVING
      COUNT(b.id) FILTER (
        WHERE ${selfBooking}::text IN ('all', 'no')
          AND NOT COALESCE(b.cancelled, false)
          AND (${fromDate}::date IS NULL OR b.booking_date >= ${fromDate}::date)
          AND (${toDate}::date IS NULL OR b.booking_date <= ${toDate}::date)
          AND (${region}::text IS NULL OR bl.region = ${region}::region)
          AND (${regionalRmId}::uuid IS NULL OR bl.assigned_rm_id = ${regionalRmId}::uuid)
          AND (
            ${commissionRmId}::uuid IS NULL
            OR EXISTS (
              SELECT 1 FROM mua_pushes mp_f
              WHERE mp_f.id = b.push_id AND mp_f.pushed_by = ${commissionRmId}::uuid
            )
          )
      ) > 0
      OR (
        SELECT COUNT(*)::int
        FROM lead_feedback lf
        JOIN bride_leads bl2 ON bl2.id = lf.lead_id
        WHERE lf.olready_mua_id = m.id
          AND ${selfBooking}::text IN ('all', 'yes')
          AND ${sql.unsafe(FEEDBACK_BOOKING_LEAD_PREDICATE)}
          AND (${fromDate}::date IS NULL OR lf.created_at::date >= ${fromDate}::date)
          AND (${toDate}::date IS NULL OR lf.created_at::date <= ${toDate}::date)
          AND (${region}::text IS NULL OR bl2.region = ${region}::region)
          AND (${regionalRmId}::uuid IS NULL OR bl2.assigned_rm_id = ${regionalRmId}::uuid)
          AND (
            ${commissionRmId}::uuid IS NULL
            OR EXISTS (
              SELECT 1 FROM mua_pushes mp_fb
              WHERE mp_fb.mua_id = m.id AND mp_fb.pushed_by = ${commissionRmId}::uuid
            )
          )
      ) > 0
    ORDER BY "totalRevenue" DESC, m.name ASC
  `;

  return rows.map((r) => ({
    muaId: r.muaId,
    muaName: r.muaName,
    planTier: fromDbPlanTier(r.planTier),
    formalBookings: r.formalBookings,
    feedbackBookings: r.feedbackBookings,
    totalBookings: r.formalBookings + r.feedbackBookings,
    totalRevenue: Number(r.totalRevenue),
    avgBookingValue: Number(r.avgBookingValue),
    lastBookingDate: r.lastBookingDate,
  }));
}

export async function fetchAdminBookingsByMuaDetail(
  filters: AdminBookingsByMuaFilters
): Promise<AdminBookingByMuaRow[]> {
  const region = filters.region ?? null;
  const regionalRmId = filters.regionalRmId ?? filters.rmId ?? null;
  const commissionRmId = filters.commissionRmId ?? null;
  const selfBooking = filters.selfBooking ?? "all";
  const planDb = filters.planTier ? toDbPlanTier(filters.planTier) : null;
  const fromDate = filters.fromDate ?? null;
  const toDate = filters.toDate ?? null;
  const qLike = filters.q?.trim() ? `%${filters.q.trim()}%` : null;

  const rows = await sql<
    {
      muaId: string;
      muaName: string;
      leadId: string;
      displayId: string;
      brideName: string;
      ceremonyType: string | null;
      eventDate: string | null;
      bookingDate: string;
      source: "formal" | "feedback";
      bookedPrice: string | null;
      commissionAmount: string | null;
      commissionPaid: string | null;
      shiftedAt: string | null;
      leadStatus: string;
    }[]
  >`
    SELECT * FROM (
      SELECT
        m.id AS "muaId",
        m.name AS "muaName",
        bl.id AS "leadId",
        bl.display_id AS "displayId",
        bl.bride_name AS "brideName",
        le.ceremony_type AS "ceremonyType",
        le.event_date::text AS "eventDate",
        b.booking_date::text AS "bookingDate",
        'formal'::text AS source,
        b.booked_price::text AS "bookedPrice",
        b.commission_amount::text AS "commissionAmount",
        b.commission_paid::text AS "commissionPaid",
        bl.shifted_at::text AS "shiftedAt",
        bl.status::text AS "leadStatus"
      FROM bookings b
      JOIN muas m ON m.id = b.mua_id
      JOIN bride_leads bl ON bl.id = b.lead_id
      JOIN lead_events le ON le.id = b.event_id
      LEFT JOIN mua_pushes mp ON mp.id = b.push_id
      WHERE ${selfBooking}::text IN ('all', 'no')
        AND NOT COALESCE(b.cancelled, false)
        AND (${fromDate}::date IS NULL OR b.booking_date >= ${fromDate}::date)
        AND (${toDate}::date IS NULL OR b.booking_date <= ${toDate}::date)
        AND (${region}::text IS NULL OR bl.region = ${region}::region)
        AND (${regionalRmId}::uuid IS NULL OR bl.assigned_rm_id = ${regionalRmId}::uuid)
        AND (${commissionRmId}::uuid IS NULL OR mp.pushed_by = ${commissionRmId}::uuid)
        AND (${planDb}::text IS NULL OR m.plan_tier = ${planDb}::plan_tier)
        AND (
          ${qLike}::text IS NULL
          OR m.name ILIKE ${qLike}
          OR m.display_id ILIKE ${qLike}
          OR bl.bride_name ILIKE ${qLike}
          OR bl.display_id ILIKE ${qLike}
        )

      UNION ALL

      SELECT
        m.id AS "muaId",
        m.name AS "muaName",
        bl.id AS "leadId",
        bl.display_id AS "displayId",
        bl.bride_name AS "brideName",
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
        lf.created_at::date::text AS "bookingDate",
        'feedback'::text AS source,
        NULL::text AS "bookedPrice",
        NULL::text AS "commissionAmount",
        NULL::text AS "commissionPaid",
        NULL::text AS "shiftedAt",
        bl.status::text AS "leadStatus"
      FROM lead_feedback lf
      JOIN bride_leads bl ON bl.id = lf.lead_id
      JOIN muas m ON m.id = lf.olready_mua_id
      LEFT JOIN lead_events le_fb ON le_fb.id = lf.event_id
      WHERE ${selfBooking}::text IN ('all', 'yes')
        AND ${sql.unsafe(FEEDBACK_BOOKING_LEAD_PREDICATE)}
        AND (${fromDate}::date IS NULL OR lf.created_at::date >= ${fromDate}::date)
        AND (${toDate}::date IS NULL OR lf.created_at::date <= ${toDate}::date)
        AND (${region}::text IS NULL OR bl.region = ${region}::region)
        AND (${regionalRmId}::uuid IS NULL OR bl.assigned_rm_id = ${regionalRmId}::uuid)
        AND (
          ${commissionRmId}::uuid IS NULL
          OR EXISTS (
            SELECT 1 FROM mua_pushes mp_fb
            WHERE mp_fb.mua_id = m.id AND mp_fb.pushed_by = ${commissionRmId}::uuid
          )
        )
        AND (${planDb}::text IS NULL OR m.plan_tier = ${planDb}::plan_tier)
        AND (
          ${qLike}::text IS NULL
          OR m.name ILIKE ${qLike}
          OR m.display_id ILIKE ${qLike}
          OR bl.bride_name ILIKE ${qLike}
          OR bl.display_id ILIKE ${qLike}
        )
    ) rows
    ORDER BY rows."bookingDate" DESC, rows."muaName" ASC, rows."brideName" ASC
  `;

  return rows.map((r) => {
    const commissionAmount =
      r.commissionAmount != null ? Number(r.commissionAmount) : null;
    const commissionPaid =
      r.commissionPaid != null ? Number(r.commissionPaid) : null;
    const tracksCommission =
      r.source === "formal" &&
      (leadTracksCommissionSync({
        shiftedAt: r.shiftedAt,
        status: r.leadStatus,
      }) ||
        commissionAmount != null ||
        (commissionPaid ?? 0) > 0);

    return {
      muaId: r.muaId,
      muaName: r.muaName,
      leadId: r.leadId,
      displayId: r.displayId,
      brideName: r.brideName,
      ceremonyType: r.ceremonyType,
      eventDate: r.eventDate,
      bookingDate: r.bookingDate,
      source: r.source,
      bookedPrice: r.bookedPrice != null ? Number(r.bookedPrice) : null,
      tracksCommission,
      commissionAmount,
      commissionPaid,
    };
  });
}
