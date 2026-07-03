import { sql, type TransactionSql } from "@/db/index";
import { fromDbTier, toDbTier } from "@/lib/db-mappers";
import {
  isCommissionOverdue,
  commissionPaymentStatus,
} from "@/lib/commission-booking";
import { bookingPaymentStatus } from "@/lib/booking-payment";
import { toDateOnly } from "@/lib/date-only";
import { leadTracksCommissionSync } from "@/lib/lead-tracks-commission";
import { FORMAL_SELF_BOOKING_EXISTS } from "@/lib/bookings-filter-sql";
import type { BudgetTier, BookingRow, PlanTier, UserRole } from "@/lib/types";

function mapPlan(raw: string | null): PlanTier | null {
  if (!raw) return null;
  const map: Record<string, PlanTier> = {
    highest_privy: "highestPrivy",
    phoenix_2: "phoenix2",
    phoenix: "phoenix",
    pro: "pro",
    prime: "prime",
  };
  return map[raw] ?? (raw as PlanTier);
}

type RawBookingRow = BookingRow & {
  budgetTier: string;
  muaPlan: string | null;
  shiftedAt: string | null;
  leadStatus: string;
};

export type FetchBookingsListOpts = {
  role: UserRole;
  userId: string;
  region?: string | null;
  tier?: BudgetTier | null;
  /** Regional RM on the lead (`assigned_rm_id`). */
  regionalRmId?: string | null;
  /** @deprecated use regionalRmId */
  rmId?: string | null;
  /** Commission RM who pushed the MUA (`mua_pushes.pushed_by`). */
  commissionRmId?: string | null;
  /** Feedback-captured bookings vs RM/commission formal bookings. */
  selfBooking?: SelfBookingFilter;
  month?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  cancelled?: boolean | null;
  page?: number;
  pageSize?: number;
  tx?: TransactionSql;
};

export type SelfBookingFilter = "all" | "yes" | "no";

export type FetchBookingsListResult = {
  rows: BookingRow[];
  total: number;
};

function mapBookingRow(r: RawBookingRow, elevated: boolean): BookingRow {
  const commissionAmount =
    r.commissionAmount != null ? Number(r.commissionAmount) : null;
  const commissionPaid =
    r.commissionPaid != null ? Number(r.commissionPaid) : null;
  const leadTracks = leadTracksCommissionSync({
    shiftedAt: r.shiftedAt ?? null,
    status: r.leadStatus,
  });
  const trackCommission =
    leadTracks ||
    (elevated &&
      (!!r.shiftedAt ||
        commissionAmount != null ||
        (commissionPaid ?? 0) > 0));
  const bookingDate = toDateOnly(r.bookingDate) ?? "";
  const brideFullyPaidAt = toDateOnly(r.brideFullyPaidAt);
  return {
    id: r.id,
    bookedPrice: Number(r.bookedPrice),
    advancePaid: r.advancePaid != null ? Number(r.advancePaid) : null,
    fullPaid: r.fullPaid != null ? Number(r.fullPaid) : null,
    paymentMode: r.paymentMode ?? null,
    bookingDate,
    zohoInvoiceRef: r.zohoInvoiceRef,
    trackCommission,
    commissionAmount,
    commissionPaid,
    commissionPaidAt: r.commissionPaidAt ?? null,
    commissionPaymentMode: r.commissionPaymentMode ?? null,
    brideFullyPaidAt,
    commissionNextFollowUpAt: toDateOnly(r.commissionNextFollowUpAt) ?? null,
    commissionOverdue: trackCommission
      ? isCommissionOverdue({
          commissionAmount,
          commissionPaid,
          bookingDate,
          brideFullyPaidAt,
        })
      : false,
    cancelled: Boolean(r.cancelled),
    cancelReason: r.cancelReason ?? null,
    leadId: r.leadId,
    displayId: r.displayId,
    brideName: r.brideName,
    city: r.city,
    region: r.region,
    budgetTier: fromDbTier(String(r.budgetTier)),
    ceremonyType: r.ceremonyType,
    eventDate: r.eventDate,
    muaId: r.muaId,
    muaName: r.muaName,
    muaPlan: mapPlan(r.muaPlan),
    rmName: r.rmName,
    pushStage: r.pushStage,
  };
}

export async function fetchBookingsList(
  opts: FetchBookingsListOpts
): Promise<FetchBookingsListResult> {
  const client = opts.tx ?? sql;
  const elevated = opts.role === "admin" || opts.role === "owner";
  const regionalRmId =
    elevated && (opts.regionalRmId ?? opts.rmId)
      ? (opts.regionalRmId ?? opts.rmId ?? null)
      : null;
  const commissionRmId = elevated && opts.commissionRmId ? opts.commissionRmId : null;
  const selfBooking = opts.selfBooking ?? "all";

  let fromDate = opts.fromDate ?? null;
  let toDate = opts.toDate ?? null;
  if (!fromDate && !toDate && opts.month && /^\d{4}-\d{2}$/.test(opts.month)) {
    const [y, m] = opts.month.split("-").map(Number);
    const last = new Date(y!, m!, 0).getDate();
    fromDate = `${opts.month}-01`;
    toDate = `${opts.month}-${String(last).padStart(2, "0")}`;
  }

  const region = opts.region ?? null;
  const tierDb = opts.tier ? toDbTier(opts.tier) : null;
  const cancelled = opts.cancelled ?? null;
  const role = opts.role;

  const [countRow] = await client<{ total: number }[]>`
    SELECT COUNT(*)::int AS total
    FROM bookings b
    JOIN bride_leads bl ON bl.id = b.lead_id
    JOIN lead_events le ON le.id = b.event_id
    JOIN muas m ON m.id = b.mua_id
    LEFT JOIN staff s ON s.id = bl.assigned_rm_id
    LEFT JOIN mua_pushes mp ON mp.id = b.push_id
    WHERE 1=1
      AND (
        ${role}::text <> 'regionalRm'
        OR bl.assigned_rm_id = ${opts.userId}::uuid
      )
      AND (
        ${role}::text <> 'commissionRm'
        OR (
          bl.shifted_at IS NOT NULL
          OR bl.status = 'commission_rm'
          OR mp.pushed_by = ${opts.userId}::uuid
        )
      )
      AND (${region}::text IS NULL OR bl.region = ${region}::region)
      AND (${tierDb}::text IS NULL OR bl.budget_tier = ${tierDb}::budget_tier)
      AND (${regionalRmId}::uuid IS NULL OR bl.assigned_rm_id = ${regionalRmId}::uuid)
      AND (${commissionRmId}::uuid IS NULL OR mp.pushed_by = ${commissionRmId}::uuid)
      AND (
        ${selfBooking}::text = 'all'
        OR (${selfBooking}::text = 'yes' AND ${client.unsafe(FORMAL_SELF_BOOKING_EXISTS)})
        OR (${selfBooking}::text = 'no' AND NOT ${client.unsafe(FORMAL_SELF_BOOKING_EXISTS)})
      )
      AND (${fromDate}::date IS NULL OR b.booking_date >= ${fromDate}::date)
      AND (${toDate}::date IS NULL OR b.booking_date <= ${toDate}::date)
      AND (
        ${cancelled}::boolean IS NULL
        OR COALESCE(b.cancelled, false) = ${cancelled}::boolean
      )
  `;

  const page = opts.page != null ? Math.max(1, opts.page) : null;
  const pageSize =
    opts.pageSize != null ? Math.max(1, opts.pageSize) : null;

  const rows = await client<RawBookingRow[]>`
    SELECT
      b.id,
      b.booked_price AS "bookedPrice",
      b.advance_paid AS "advancePaid",
      b.full_paid AS "fullPaid",
      b.payment_mode AS "paymentMode",
      b.booking_date AS "bookingDate",
      b.zoho_invoice_ref AS "zohoInvoiceRef",
      b.commission_amount AS "commissionAmount",
      b.commission_paid AS "commissionPaid",
      b.commission_paid_at AS "commissionPaidAt",
      b.commission_payment_mode AS "commissionPaymentMode",
      b.bride_fully_paid_at AS "brideFullyPaidAt",
      b.commission_next_follow_up_at AS "commissionNextFollowUpAt",
      b.cancelled,
      b.cancel_reason AS "cancelReason",
      bl.id AS "leadId",
      bl.shifted_at AS "shiftedAt",
      bl.status::text AS "leadStatus",
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      bl.city,
      bl.region::text AS region,
      bl.budget_tier::text AS "budgetTier",
      le.ceremony_type AS "ceremonyType",
      le.event_date AS "eventDate",
      m.id AS "muaId",
      m.name AS "muaName",
      m.plan_tier::text AS "muaPlan",
      s.name AS "rmName",
      mp.stage::text AS "pushStage"
    FROM bookings b
    JOIN bride_leads bl ON bl.id = b.lead_id
    JOIN lead_events le ON le.id = b.event_id
    JOIN muas m ON m.id = b.mua_id
    LEFT JOIN staff s ON s.id = bl.assigned_rm_id
    LEFT JOIN mua_pushes mp ON mp.id = b.push_id
    WHERE 1=1
      AND (
        ${role}::text <> 'regionalRm'
        OR bl.assigned_rm_id = ${opts.userId}::uuid
      )
      AND (
        ${role}::text <> 'commissionRm'
        OR (
          bl.shifted_at IS NOT NULL
          OR bl.status = 'commission_rm'
          OR mp.pushed_by = ${opts.userId}::uuid
        )
      )
      AND (${region}::text IS NULL OR bl.region = ${region}::region)
      AND (${tierDb}::text IS NULL OR bl.budget_tier = ${tierDb}::budget_tier)
      AND (${regionalRmId}::uuid IS NULL OR bl.assigned_rm_id = ${regionalRmId}::uuid)
      AND (${commissionRmId}::uuid IS NULL OR mp.pushed_by = ${commissionRmId}::uuid)
      AND (
        ${selfBooking}::text = 'all'
        OR (${selfBooking}::text = 'yes' AND ${client.unsafe(FORMAL_SELF_BOOKING_EXISTS)})
        OR (${selfBooking}::text = 'no' AND NOT ${client.unsafe(FORMAL_SELF_BOOKING_EXISTS)})
      )
      AND (${fromDate}::date IS NULL OR b.booking_date >= ${fromDate}::date)
      AND (${toDate}::date IS NULL OR b.booking_date <= ${toDate}::date)
      AND (
        ${cancelled}::boolean IS NULL
        OR COALESCE(b.cancelled, false) = ${cancelled}::boolean
      )
    ORDER BY b.booking_date DESC, b.created_at DESC
    LIMIT ${pageSize ?? 500}
    OFFSET ${page != null && pageSize != null ? (page - 1) * pageSize : 0}
  `;

  return {
    rows: rows.map((r: RawBookingRow) => mapBookingRow(r, elevated)),
    total: countRow?.total ?? 0,
  };
}

export function bookingRowsToCsv(rows: BookingRow[]): unknown[][] {
  return rows.map((b) => {
    const brideStatus = b.cancelled
      ? "cancelled"
      : bookingPaymentStatus(b);
    const commStatus = b.trackCommission
      ? commissionPaymentStatus(b)
      : "";
    return [
      b.bookingDate,
      b.displayId,
      b.brideName,
      b.ceremonyType,
      b.eventDate ?? "",
      b.muaName,
      b.muaPlan ?? "",
      b.region,
      b.city,
      b.budgetTier,
      b.bookedPrice,
      brideStatus,
      b.advancePaid ?? "",
      b.fullPaid ?? "",
      b.paymentMode ?? "",
      b.trackCommission ? (b.commissionAmount ?? "") : "",
      b.trackCommission ? (b.commissionPaid ?? 0) : "",
      commStatus,
      b.commissionOverdue ? "yes" : "no",
      b.rmName ?? "",
      b.cancelled ? "yes" : "no",
      b.cancelReason ?? "",
      b.zohoInvoiceRef ?? "",
    ];
  });
}

export const BOOKING_CSV_HEADERS = [
  "bookingDate",
  "displayId",
  "brideName",
  "ceremonyType",
  "eventDate",
  "muaName",
  "muaPlan",
  "region",
  "city",
  "budgetTier",
  "bookedPrice",
  "bridePaymentStatus",
  "advancePaid",
  "fullPaid",
  "paymentMode",
  "commissionDue",
  "commissionReceived",
  "commissionStatus",
  "commissionOverdue",
  "rmName",
  "cancelled",
  "cancelReason",
  "zohoInvoiceRef",
] as const;
