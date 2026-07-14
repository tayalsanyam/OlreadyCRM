import { sql } from "@/db/index";
import { csvDateCell } from "@/lib/utils";
import { FEEDBACK_BOOKING_LEAD_PREDICATE } from "@/lib/bookings-filter-sql";
import { toDbTier } from "@/lib/report-utils";

export type RevenuePaymentStatus = "Fully Paid" | "Partial" | "Unpaid" | "Feedback";

export type RevenueBookingSource = "formal" | "feedback";

export type RevenueReportRow = {
  id: string;
  bookingDate: string;
  bookedPrice: number;
  advancePaid: number | null;
  fullPaid: number | null;
  zohoInvoiceRef: string | null;
  outstanding: number;
  leadDisplayId: string;
  brideName: string;
  region: string;
  budgetTier: string;
  ceremonyType: string;
  eventDate: string;
  muaName: string;
  muaPlan: string | null;
  rmName: string | null;
  cancelled: boolean;
  source: RevenueBookingSource;
  status: RevenuePaymentStatus;
};

export function revenuePaymentStatus(row: {
  source: RevenueBookingSource;
  bookedPrice: number;
  advancePaid: number | null;
  fullPaid: number | null;
}): RevenuePaymentStatus {
  if (row.source === "feedback") return "Feedback";
  const paid = (row.advancePaid ?? 0) + (row.fullPaid ?? 0);
  if (paid >= row.bookedPrice) return "Fully Paid";
  if (paid > 0) return "Partial";
  return "Unpaid";
}

export function buildRevenueSummary(rows: RevenueReportRow[]) {
  return {
    totalBooked: rows.reduce((a, r) => a + Number(r.bookedPrice), 0),
    totalAdvance: rows.reduce((a, r) => a + Number(r.advancePaid ?? 0), 0),
    totalFullPaid: rows.reduce((a, r) => a + Number(r.fullPaid ?? 0), 0),
    totalOutstanding: rows.reduce((a, r) => a + Number(r.outstanding), 0),
    countBookings: rows.length,
    countFormal: rows.filter((r) => r.source === "formal").length,
    countFeedback: rows.filter((r) => r.source === "feedback").length,
    countFullyPaid: rows.filter((r) => r.status === "Fully Paid").length,
    countPartial: rows.filter((r) => r.status === "Partial").length,
    countUnpaid: rows.filter((r) => r.status === "Unpaid").length,
  };
}

export const REVENUE_CSV_HEADERS = [
  "Date",
  "Source",
  "Bride",
  "Ceremony",
  "Event Date",
  "MUA",
  "Plan",
  "RM",
  "Region",
  "Booked Price",
  "Advance",
  "Full Paid",
  "Outstanding",
  "Zoho Ref",
  "Payment Status",
] as const;

export function revenueRowToCsv(r: RevenueReportRow): unknown[] {
  return [
    csvDateCell(r.bookingDate),
    r.source,
    r.brideName,
    r.ceremonyType,
    csvDateCell(r.eventDate),
    r.muaName,
    r.muaPlan ?? "",
    r.rmName ?? "",
    r.region,
    r.bookedPrice,
    r.advancePaid ?? 0,
    r.fullPaid ?? 0,
    r.outstanding,
    r.zohoInvoiceRef ?? "",
    r.status,
  ];
}

export type RevenueQueryParams = {
  month?: string | null;
  bookingFrom?: string | null;
  bookingTo?: string | null;
  region?: string | null;
  rmId?: string | null;
  tier?: string | null;
  includeCancelled?: boolean;
  scopeRmId?: string | null;
  scopeCommission?: boolean;
  scopeFeedback?: boolean;
};

export async function fetchRevenueReportRows(
  params: RevenueQueryParams
): Promise<RevenueReportRow[]> {
  const month = params.month ?? null;
  const bookingFrom = params.bookingFrom ?? null;
  const bookingTo = params.bookingTo ?? null;
  const region = params.region ?? null;
  const rmId = params.rmId ?? null;
  const tier = params.tier ? toDbTier(params.tier) : null;
  const includeCancelled = params.includeCancelled ?? false;
  const scopeRmId = params.scopeRmId ?? null;
  const scopeCommission = params.scopeCommission ?? false;
  const scopeFeedback = params.scopeFeedback ?? false;

  const rows = await sql<
    (Omit<RevenueReportRow, "status" | "outstanding"> & {
      cancelled: boolean;
      advancePaid: number | null;
      fullPaid: number | null;
      bookedPrice: number;
    })[]
  >`
    SELECT * FROM (
      SELECT
        b.id,
        b.booking_date::text AS "bookingDate",
        COALESCE(NULLIF(b.booked_price, 0), b.commission_amount, 0)::float AS "bookedPrice",
        b.advance_paid AS "advancePaid",
        b.full_paid AS "fullPaid",
        b.zoho_invoice_ref AS "zohoInvoiceRef",
        bl.display_id AS "leadDisplayId",
        bl.bride_name AS "brideName",
        bl.region::text AS region,
        bl.budget_tier::text AS "budgetTier",
        COALESCE(le.ceremony_type, '—') AS "ceremonyType",
        COALESCE(le.event_date::text, '') AS "eventDate",
        m.name AS "muaName",
        m.plan_tier::text AS "muaPlan",
        s.name AS "rmName",
        COALESCE(b.cancelled, false) AS cancelled,
        'formal'::text AS source
      FROM bookings b
      JOIN bride_leads bl ON bl.id = b.lead_id
      LEFT JOIN lead_events le ON le.id = b.event_id
      JOIN muas m ON m.id = b.mua_id
      LEFT JOIN staff s ON s.id = bl.assigned_rm_id
      WHERE (
          (${bookingFrom}::text IS NOT NULL AND b.booking_date >= ${bookingFrom}::date)
          OR (
            ${bookingFrom}::text IS NULL
            AND (
              ${month}::text IS NULL
              OR to_char(b.booking_date, 'YYYY-MM') = ${month}
            )
          )
        )
        AND (${bookingTo}::text IS NULL OR b.booking_date <= ${bookingTo}::date)
        AND (${region}::text IS NULL OR bl.region = ${region}::region)
        AND (${rmId}::text IS NULL OR bl.assigned_rm_id = ${rmId}::uuid)
        AND (${tier}::text IS NULL OR bl.budget_tier = ${tier}::budget_tier)
        AND (${includeCancelled}::boolean OR NOT COALESCE(b.cancelled, false))
        AND (${scopeRmId}::uuid IS NULL OR bl.assigned_rm_id = ${scopeRmId}::uuid)
        AND (${scopeCommission}::boolean = false OR bl.status = 'commission_rm')
        AND (
          ${scopeFeedback}::boolean = false
          OR (
            bl.status IN ('expired'::lead_status, 'booked'::lead_status)
            AND NOT EXISTS (
              SELECT 1 FROM lead_events le2
              WHERE le2.lead_id = bl.id
                AND le2.status != 'not_needed'
                AND le2.event_date >= CURRENT_DATE
            )
          )
        )

      UNION ALL

      SELECT
        lf.id,
        lf.created_at::date::text AS "bookingDate",
        0::float AS "bookedPrice",
        NULL::numeric AS "advancePaid",
        NULL::numeric AS "fullPaid",
        NULL::text AS "zohoInvoiceRef",
        bl.display_id AS "leadDisplayId",
        bl.bride_name AS "brideName",
        bl.region::text AS region,
        bl.budget_tier::text AS "budgetTier",
        COALESCE(
          le_fb.ceremony_type,
          (
            SELECT le.ceremony_type
            FROM lead_events le
            WHERE le.lead_id = lf.lead_id AND le.status != 'not_needed'
            ORDER BY le.event_date DESC NULLS LAST, le.ceremony_type
            LIMIT 1
          ),
          '—'
        ) AS "ceremonyType",
        COALESCE(
          le_fb.event_date::text,
          (
            SELECT le.event_date::text
            FROM lead_events le
            WHERE le.lead_id = lf.lead_id AND le.status != 'not_needed'
            ORDER BY le.event_date DESC NULLS LAST, le.ceremony_type
            LIMIT 1
          ),
          ''
        ) AS "eventDate",
        m.name AS "muaName",
        m.plan_tier::text AS "muaPlan",
        s.name AS "rmName",
        false AS cancelled,
        'feedback'::text AS source
      FROM lead_feedback lf
      JOIN bride_leads bl ON bl.id = lf.lead_id
      JOIN muas m ON m.id = lf.olready_mua_id
      LEFT JOIN lead_events le_fb ON le_fb.id = lf.event_id
      LEFT JOIN staff s ON s.id = bl.assigned_rm_id
      WHERE ${sql.unsafe(FEEDBACK_BOOKING_LEAD_PREDICATE)}
        AND (
          (${bookingFrom}::text IS NOT NULL AND lf.created_at::date >= ${bookingFrom}::date)
          OR (
            ${bookingFrom}::text IS NULL
            AND (
              ${month}::text IS NULL
              OR to_char(lf.created_at, 'YYYY-MM') = ${month}
            )
          )
        )
        AND (${bookingTo}::text IS NULL OR lf.created_at::date <= ${bookingTo}::date)
        AND (${region}::text IS NULL OR bl.region = ${region}::region)
        AND (${rmId}::text IS NULL OR bl.assigned_rm_id = ${rmId}::uuid)
        AND (${tier}::text IS NULL OR bl.budget_tier = ${tier}::budget_tier)
        AND (${scopeRmId}::uuid IS NULL OR bl.assigned_rm_id = ${scopeRmId}::uuid)
        AND (${scopeCommission}::boolean = false OR bl.status = 'commission_rm')
        AND (
          ${scopeFeedback}::boolean = false
          OR (
            bl.status IN ('expired'::lead_status, 'booked'::lead_status)
            AND NOT EXISTS (
              SELECT 1 FROM lead_events le2
              WHERE le2.lead_id = bl.id
                AND le2.status != 'not_needed'
                AND le2.event_date >= CURRENT_DATE
            )
          )
        )
    ) revenue_rows
    ORDER BY "bookingDate" DESC, "muaName" ASC, "brideName" ASC
  `;

  return rows.map((r) => {
    const bookedPrice = Number(r.bookedPrice);
    const advancePaid = r.advancePaid != null ? Number(r.advancePaid) : null;
    const fullPaid = r.fullPaid != null ? Number(r.fullPaid) : null;
    const outstanding =
      r.source === "feedback"
        ? 0
        : bookedPrice - (advancePaid ?? 0) - (fullPaid ?? 0);
    const mapped = {
      ...r,
      bookedPrice,
      advancePaid,
      fullPaid,
      outstanding,
      source: r.source as RevenueBookingSource,
    };
    return {
      ...mapped,
      status: revenuePaymentStatus(mapped),
    };
  });
}
