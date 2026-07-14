import { sql } from "@/db/index";
import { FEEDBACK_BOOKING_LEAD_PREDICATE } from "@/lib/bookings-filter-sql";
import { fromDbTier } from "@/lib/db-mappers";
import { toDateOnly } from "@/lib/date-only";
import { leadTracksCommissionSync } from "@/lib/lead-tracks-commission";
import type { BudgetTier, Region } from "@/lib/types";

export type MuaBookingSource = "rm" | "commission" | "feedback";

export type MuaBookingLedgerRow = {
  id: string;
  leadId: string;
  displayId: string;
  brideName: string;
  city: string;
  region: Region;
  budgetTier: BudgetTier | null;
  ceremonyType: string | null;
  eventDate: string | null;
  bookedPrice: number | null;
  bookingDate: string;
  source: MuaBookingSource;
  /** Set for feedback-sourced rows: whether MUA was on plan at confirmation time. */
  onPlan: boolean | null;
  cancelled: boolean;
  rmName: string | null;
  recordedBy: string | null;
};

export type MuaBookingsSummary = {
  formalCount: number;
  feedbackCount: number;
  totalCount: number;
  formalRevenue: number;
  cancelledCount: number;
};

function mapBookingSource(shiftedAt: string | null, leadStatus: string): MuaBookingSource {
  return leadTracksCommissionSync({ shiftedAt, status: leadStatus })
    ? "commission"
    : "rm";
}

export async function countMuaFeedbackBookings(muaId: string): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM lead_feedback lf
    WHERE lf.olready_mua_id = ${muaId}::uuid
      AND ${sql.unsafe(FEEDBACK_BOOKING_LEAD_PREDICATE)}
  `;
  return row?.count ?? 0;
}

export async function fetchMuaBookingsLedger(muaId: string): Promise<{
  summary: MuaBookingsSummary;
  rows: MuaBookingLedgerRow[];
}> {
  const formalRows = await sql<
    {
      id: string;
      leadId: string;
      displayId: string;
      brideName: string;
      city: string;
      region: string;
      budgetTier: string;
      shiftedAt: string | null;
      leadStatus: string;
      ceremonyType: string;
      eventDate: string | null;
      bookedPrice: string;
      bookingDate: string;
      cancelled: boolean;
      rmName: string | null;
      recordedBy: string | null;
    }[]
  >`
    SELECT
      b.id,
      b.lead_id AS "leadId",
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      bl.city,
      bl.region::text AS region,
      bl.budget_tier::text AS "budgetTier",
      bl.shifted_at AS "shiftedAt",
      bl.status::text AS "leadStatus",
      le.ceremony_type AS "ceremonyType",
      le.event_date AS "eventDate",
      b.booked_price AS "bookedPrice",
      b.booking_date AS "bookingDate",
      COALESCE(b.cancelled, false) AS cancelled,
      s.name AS "rmName",
      creator.name AS "recordedBy"
    FROM bookings b
    JOIN bride_leads bl ON bl.id = b.lead_id
    JOIN lead_events le ON le.id = b.event_id
    LEFT JOIN staff s ON s.id = bl.assigned_rm_id
    LEFT JOIN staff creator ON creator.id = b.created_by
    WHERE b.mua_id = ${muaId}::uuid
    ORDER BY b.booking_date DESC, b.created_at DESC
  `;

  const feedbackRows = await sql<
    {
      id: string;
      leadId: string;
      displayId: string;
      brideName: string;
      city: string;
      region: string;
      budgetTier: string;
      ceremonyType: string | null;
      eventDate: string | null;
      bookingDate: string;
      onPlan: boolean;
      rmName: string | null;
      recordedBy: string | null;
    }[]
  >`
    SELECT
      lf.id,
      lf.lead_id AS "leadId",
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      bl.city,
      bl.region::text AS region,
      bl.budget_tier::text AS "budgetTier",
      COALESCE(
        le_fb.ceremony_type,
        (
          SELECT le.ceremony_type
          FROM lead_events le
          WHERE le.lead_id = lf.lead_id AND le.status != 'not_needed'
          ORDER BY le.event_date DESC NULLS LAST
          LIMIT 1
        )
      ) AS "ceremonyType",
      COALESCE(
        le_fb.event_date,
        (
          SELECT le.event_date
          FROM lead_events le
          WHERE le.lead_id = lf.lead_id AND le.status != 'not_needed'
          ORDER BY le.event_date DESC NULLS LAST
          LIMIT 1
        )
      ) AS "eventDate",
      lf.created_at AS "bookingDate",
      COALESCE(
        (
          SELECT true
          FROM mua_plan_history mph
          WHERE mph.mua_id = lf.olready_mua_id
            AND mph.plan_tier IS NOT NULL
            AND mph.assigned_at <= lf.created_at
            AND (mph.expiry_at IS NULL OR mph.expiry_at >= lf.created_at::date)
          ORDER BY mph.assigned_at DESC
          LIMIT 1
        ),
        (
          SELECT m.plan_tier IS NOT NULL
            AND (m.plan_expiry IS NULL OR m.plan_expiry >= lf.created_at::date)
          FROM muas m
          WHERE m.id = lf.olready_mua_id
        ),
        false
      ) AS "onPlan",
      s.name AS "rmName",
      submitter.name AS "recordedBy"
    FROM lead_feedback lf
    JOIN bride_leads bl ON bl.id = lf.lead_id
    LEFT JOIN lead_events le_fb ON le_fb.id = lf.event_id
    LEFT JOIN staff s ON s.id = bl.assigned_rm_id
    LEFT JOIN staff submitter ON submitter.id = lf.submitted_by
    WHERE lf.olready_mua_id = ${muaId}::uuid
      AND ${sql.unsafe(FEEDBACK_BOOKING_LEAD_PREDICATE)}
    ORDER BY lf.created_at DESC
  `;

  const mappedFormal: MuaBookingLedgerRow[] = formalRows.map((r) => ({
    id: r.id,
    leadId: r.leadId,
    displayId: r.displayId,
    brideName: r.brideName,
    city: r.city,
    region: r.region as Region,
    budgetTier: fromDbTier(r.budgetTier),
    ceremonyType: r.ceremonyType,
    eventDate: r.eventDate ? toDateOnly(r.eventDate) : null,
    bookedPrice: Number(r.bookedPrice),
    bookingDate: toDateOnly(r.bookingDate) ?? "",
    source: mapBookingSource(r.shiftedAt, r.leadStatus),
    onPlan: null,
    cancelled: r.cancelled,
    rmName: r.rmName,
    recordedBy: r.recordedBy,
  }));

  const mappedFeedback: MuaBookingLedgerRow[] = feedbackRows.map((r) => ({
    id: r.id,
    leadId: r.leadId,
    displayId: r.displayId,
    brideName: r.brideName,
    city: r.city,
    region: r.region as Region,
    budgetTier: fromDbTier(r.budgetTier),
    ceremonyType: r.ceremonyType,
    eventDate: r.eventDate ? toDateOnly(r.eventDate) : null,
    bookedPrice: null,
    bookingDate: toDateOnly(r.bookingDate) ?? "",
    source: "feedback",
    onPlan: r.onPlan,
    cancelled: false,
    rmName: r.rmName,
    recordedBy: r.recordedBy,
  }));

  const rows = [...mappedFormal, ...mappedFeedback].sort((a, b) =>
    b.bookingDate.localeCompare(a.bookingDate)
  );

  const activeFormal = mappedFormal.filter((r) => !r.cancelled);
  const formalRevenue = activeFormal.reduce((sum, r) => sum + (r.bookedPrice ?? 0), 0);

  return {
    summary: {
      formalCount: activeFormal.length,
      feedbackCount: mappedFeedback.length,
      totalCount: activeFormal.length + mappedFeedback.length,
      formalRevenue,
      cancelledCount: mappedFormal.filter((r) => r.cancelled).length,
    },
    rows,
  };
}

export const MUA_BOOKING_CSV_HEADERS = [
  "bookingDate",
  "source",
  "displayId",
  "brideName",
  "ceremonyType",
  "eventDate",
  "bookedPrice",
  "onPlan",
  "cancelled",
  "rmName",
  "recordedBy",
  "city",
  "region",
] as const;

export function muaBookingRowsToCsv(rows: MuaBookingLedgerRow[]): unknown[][] {
  return rows.map((r) => [
    r.bookingDate,
    r.source,
    r.displayId,
    r.brideName,
    r.ceremonyType ?? "",
    r.eventDate ?? "",
    r.bookedPrice ?? "",
    r.source === "feedback" ? (r.onPlan ? "on_plan" : "not_on_plan") : "",
    r.cancelled ? "yes" : "no",
    r.rmName ?? "",
    r.recordedBy ?? "",
    r.city,
    r.region,
  ]);
}
