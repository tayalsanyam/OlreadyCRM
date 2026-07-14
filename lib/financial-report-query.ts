import { sql } from "@/db/index";

export type FinancialIncomeType = "sales" | "commission";
export type FinancialSegmentBy = "user" | "plan" | "region" | "lead";

export type FinancialReportParams = {
  dateFrom?: string | null;
  dateTo?: string | null;
  incomeType: FinancialIncomeType;
  segmentBy: FinancialSegmentBy;
  staffId?: string | null;
};

export type FinancialSummary = {
  salesCollected: number;
  salesPayments: number;
  commissionCollected: number;
  commissionDue: number;
  commissionOutstanding: number;
  bookingGmv: number;
};

export type FinancialBreakdownRow = {
  key: string;
  label: string;
  amount: number;
  count: number;
  meta?: string | null;
};

export type FinancialDetailRow = {
  id: string;
  date: string;
  incomeType: FinancialIncomeType;
  amount: number;
  label: string;
  sublabel?: string | null;
  staffName?: string | null;
  plan?: string | null;
  region?: string | null;
  leadDisplayId?: string | null;
  brideName?: string | null;
  paymentMode?: string | null;
};

function num(v: unknown): number {
  return v != null ? Number(v) : 0;
}

export async function fetchFinancialSummary(
  params: Pick<FinancialReportParams, "dateFrom" | "dateTo" | "staffId">
): Promise<FinancialSummary> {
  const dateFrom = params.dateFrom ?? null;
  const dateTo = params.dateTo ?? null;
  const staffId = params.staffId ?? null;

  const [sales] = await sql<
    { collected: number; payments: number }[]
  >`
    SELECT
      COALESCE(SUM(pr.amount), 0)::float AS collected,
      COUNT(*)::int AS payments
    FROM sales.payment_records pr
    JOIN sales.pipeline p ON p.id = pr.pipeline_id
    WHERE (${dateFrom}::date IS NULL OR pr.payment_date >= ${dateFrom}::date)
      AND (${dateTo}::date IS NULL OR pr.payment_date <= ${dateTo}::date)
      AND (
        ${staffId}::uuid IS NULL
        OR p.sales_closed_by = ${staffId}::uuid
      )
  `;

  const [commission] = await sql<
    {
      collected: number;
      due: number;
      outstanding: number;
      gmv: number;
    }[]
  >`
    SELECT
      COALESCE(SUM(b.commission_paid), 0)::float AS collected,
      COALESCE(SUM(b.commission_amount), 0)::float AS due,
      COALESCE(SUM(
        GREATEST(COALESCE(b.commission_amount, 0) - COALESCE(b.commission_paid, 0), 0)
      ), 0)::float AS outstanding,
      COALESCE(SUM(b.booked_price), 0)::float AS gmv
    FROM bookings b
    JOIN bride_leads bl ON bl.id = b.lead_id
    WHERE NOT COALESCE(b.cancelled, false)
      AND (
        (${dateFrom}::date IS NULL AND ${dateTo}::date IS NULL)
        OR (
          COALESCE(b.commission_paid_at::date, b.booking_date) >= COALESCE(${dateFrom}::date, '1900-01-01'::date)
          AND COALESCE(b.commission_paid_at::date, b.booking_date) <= COALESCE(${dateTo}::date, '9999-12-31'::date)
        )
      )
      AND (
        ${staffId}::uuid IS NULL
        OR bl.assigned_rm_id = ${staffId}::uuid
      )
  `;

  return {
    salesCollected: num(sales?.collected),
    salesPayments: num(sales?.payments),
    commissionCollected: num(commission?.collected),
    commissionDue: num(commission?.due),
    commissionOutstanding: num(commission?.outstanding),
    bookingGmv: num(commission?.gmv),
  };
}

export async function fetchFinancialBreakdown(
  params: FinancialReportParams
): Promise<FinancialBreakdownRow[]> {
  const { incomeType, segmentBy, dateFrom, dateTo, staffId } = {
    dateFrom: params.dateFrom ?? null,
    dateTo: params.dateTo ?? null,
    incomeType: params.incomeType,
    segmentBy: params.segmentBy,
    staffId: params.staffId ?? null,
  };

  if (incomeType === "sales") {
    if (segmentBy === "user") {
      const rows = await sql<FinancialBreakdownRow[]>`
        SELECT
          COALESCE(s.id::text, 'unknown') AS key,
          COALESCE(s.name, 'Unassigned') AS label,
          COALESCE(SUM(pr.amount), 0)::float AS amount,
          COUNT(*)::int AS count,
          s.role::text AS meta
        FROM sales.payment_records pr
        JOIN sales.pipeline p ON p.id = pr.pipeline_id
        LEFT JOIN staff s ON s.id = p.sales_closed_by
        WHERE (${dateFrom}::date IS NULL OR pr.payment_date >= ${dateFrom}::date)
          AND (${dateTo}::date IS NULL OR pr.payment_date <= ${dateTo}::date)
          AND (${staffId}::uuid IS NULL OR p.sales_closed_by = ${staffId}::uuid)
        GROUP BY s.id, s.name, s.role
        ORDER BY amount DESC
      `;
      return rows;
    }
    if (segmentBy === "plan") {
      const rows = await sql<FinancialBreakdownRow[]>`
        SELECT
          COALESCE(NULLIF(TRIM(o.plan), ''), 'No plan') AS key,
          COALESCE(NULLIF(TRIM(o.plan), ''), 'No plan') AS label,
          COALESCE(SUM(pr.amount), 0)::float AS amount,
          COUNT(*)::int AS count,
          NULL::text AS meta
        FROM sales.payment_records pr
        JOIN sales.pipeline p ON p.id = pr.pipeline_id
        LEFT JOIN sales.onboarding o ON o.pipeline_id = p.id
        WHERE (${dateFrom}::date IS NULL OR pr.payment_date >= ${dateFrom}::date)
          AND (${dateTo}::date IS NULL OR pr.payment_date <= ${dateTo}::date)
          AND (${staffId}::uuid IS NULL OR p.sales_closed_by = ${staffId}::uuid)
        GROUP BY COALESCE(NULLIF(TRIM(o.plan), ''), 'No plan')
        ORDER BY amount DESC
      `;
      return rows;
    }
    if (segmentBy === "region") {
      const rows = await sql<FinancialBreakdownRow[]>`
        SELECT
          COALESCE(NULLIF(TRIM(m.city), ''), 'Unknown') AS key,
          COALESCE(NULLIF(TRIM(m.city), ''), 'Unknown') AS label,
          COALESCE(SUM(pr.amount), 0)::float AS amount,
          COUNT(*)::int AS count,
          NULL::text AS meta
        FROM sales.payment_records pr
        JOIN sales.pipeline p ON p.id = pr.pipeline_id
        JOIN muas m ON m.id = p.mua_id
        WHERE (${dateFrom}::date IS NULL OR pr.payment_date >= ${dateFrom}::date)
          AND (${dateTo}::date IS NULL OR pr.payment_date <= ${dateTo}::date)
          AND (${staffId}::uuid IS NULL OR p.sales_closed_by = ${staffId}::uuid)
        GROUP BY COALESCE(NULLIF(TRIM(m.city), ''), 'Unknown')
        ORDER BY amount DESC
      `;
      return rows;
    }
    return [];
  }

  // Commission income — collected in date range
  if (segmentBy === "user") {
    return sql<FinancialBreakdownRow[]>`
      SELECT
        COALESCE(s.id::text, 'unknown') AS key,
        COALESCE(s.name, 'Unassigned') AS label,
        COALESCE(SUM(b.commission_paid), 0)::float AS amount,
        COUNT(*)::int AS count,
        s.role::text AS meta
      FROM bookings b
      JOIN bride_leads bl ON bl.id = b.lead_id
      LEFT JOIN staff s ON s.id = bl.assigned_rm_id
      WHERE NOT COALESCE(b.cancelled, false)
        AND COALESCE(b.commission_paid, 0) > 0
        AND (${dateFrom}::date IS NULL OR COALESCE(b.commission_paid_at::date, b.booking_date) >= ${dateFrom}::date)
        AND (${dateTo}::date IS NULL OR COALESCE(b.commission_paid_at::date, b.booking_date) <= ${dateTo}::date)
        AND (${staffId}::uuid IS NULL OR bl.assigned_rm_id = ${staffId}::uuid)
      GROUP BY s.id, s.name, s.role
      ORDER BY amount DESC
    `;
  }
  if (segmentBy === "plan") {
    return sql<FinancialBreakdownRow[]>`
      SELECT
        COALESCE(m.plan_tier::text, 'no_plan') AS key,
        COALESCE(REPLACE(m.plan_tier::text, '_', ' '), 'No plan') AS label,
        COALESCE(SUM(b.commission_paid), 0)::float AS amount,
        COUNT(*)::int AS count,
        NULL::text AS meta
      FROM bookings b
      JOIN muas m ON m.id = b.mua_id
      JOIN bride_leads bl ON bl.id = b.lead_id
      WHERE NOT COALESCE(b.cancelled, false)
        AND COALESCE(b.commission_paid, 0) > 0
        AND (${dateFrom}::date IS NULL OR COALESCE(b.commission_paid_at::date, b.booking_date) >= ${dateFrom}::date)
        AND (${dateTo}::date IS NULL OR COALESCE(b.commission_paid_at::date, b.booking_date) <= ${dateTo}::date)
        AND (${staffId}::uuid IS NULL OR bl.assigned_rm_id = ${staffId}::uuid)
      GROUP BY m.plan_tier
      ORDER BY amount DESC
    `;
  }
  if (segmentBy === "region") {
    return sql<FinancialBreakdownRow[]>`
      SELECT
        COALESCE(bl.region::text, 'none') AS key,
        COALESCE(INITCAP(bl.region::text), 'No region') AS label,
        COALESCE(SUM(b.commission_paid), 0)::float AS amount,
        COUNT(*)::int AS count,
        NULL::text AS meta
      FROM bookings b
      JOIN bride_leads bl ON bl.id = b.lead_id
      WHERE NOT COALESCE(b.cancelled, false)
        AND COALESCE(b.commission_paid, 0) > 0
        AND (${dateFrom}::date IS NULL OR COALESCE(b.commission_paid_at::date, b.booking_date) >= ${dateFrom}::date)
        AND (${dateTo}::date IS NULL OR COALESCE(b.commission_paid_at::date, b.booking_date) <= ${dateTo}::date)
        AND (${staffId}::uuid IS NULL OR bl.assigned_rm_id = ${staffId}::uuid)
      GROUP BY bl.region
      ORDER BY amount DESC
    `;
  }
  if (segmentBy === "lead") {
    return sql<FinancialBreakdownRow[]>`
      SELECT
        bl.id::text AS key,
        bl.bride_name || ' (' || bl.display_id || ')' AS label,
        COALESCE(SUM(b.commission_paid), 0)::float AS amount,
        COUNT(*)::int AS count,
        bl.region::text AS meta
      FROM bookings b
      JOIN bride_leads bl ON bl.id = b.lead_id
      WHERE NOT COALESCE(b.cancelled, false)
        AND COALESCE(b.commission_paid, 0) > 0
        AND (${dateFrom}::date IS NULL OR COALESCE(b.commission_paid_at::date, b.booking_date) >= ${dateFrom}::date)
        AND (${dateTo}::date IS NULL OR COALESCE(b.commission_paid_at::date, b.booking_date) <= ${dateTo}::date)
        AND (${staffId}::uuid IS NULL OR bl.assigned_rm_id = ${staffId}::uuid)
      GROUP BY bl.id, bl.bride_name, bl.display_id, bl.region
      ORDER BY amount DESC
    `;
  }
  return [];
}

export async function fetchFinancialDetails(
  params: FinancialReportParams & { limit?: number }
): Promise<FinancialDetailRow[]> {
  const dateFrom = params.dateFrom ?? null;
  const dateTo = params.dateTo ?? null;
  const staffId = params.staffId ?? null;
  const limit = params.limit ?? 200;

  if (params.incomeType === "sales") {
    return sql<FinancialDetailRow[]>`
      SELECT
        pr.id::text AS id,
        pr.payment_date::text AS date,
        'sales'::text AS "incomeType",
        pr.amount::float AS amount,
        m.name AS label,
        p.stage::text AS sublabel,
        s.name AS "staffName",
        o.plan AS plan,
        m.city AS region,
        NULL::text AS "leadDisplayId",
        NULL::text AS "brideName",
        pr.payment_mode AS "paymentMode"
      FROM sales.payment_records pr
      JOIN sales.pipeline p ON p.id = pr.pipeline_id
      JOIN muas m ON m.id = p.mua_id
      LEFT JOIN sales.onboarding o ON o.pipeline_id = p.id
      LEFT JOIN staff s ON s.id = p.sales_closed_by
      WHERE (${dateFrom}::date IS NULL OR pr.payment_date >= ${dateFrom}::date)
        AND (${dateTo}::date IS NULL OR pr.payment_date <= ${dateTo}::date)
        AND (${staffId}::uuid IS NULL OR p.sales_closed_by = ${staffId}::uuid)
      ORDER BY pr.payment_date DESC
      LIMIT ${limit}
    `;
  }

  return sql<FinancialDetailRow[]>`
    SELECT
      b.id::text AS id,
      COALESCE(b.commission_paid_at::date, b.booking_date)::text AS date,
      'commission'::text AS "incomeType",
      COALESCE(b.commission_paid, 0)::float AS amount,
      m.name AS label,
      le.ceremony_type AS sublabel,
      s.name AS "staffName",
      m.plan_tier::text AS plan,
      bl.region::text AS region,
      bl.display_id AS "leadDisplayId",
      bl.bride_name AS "brideName",
      b.payment_mode AS "paymentMode"
    FROM bookings b
    JOIN bride_leads bl ON bl.id = b.lead_id
    JOIN lead_events le ON le.id = b.event_id
    JOIN muas m ON m.id = b.mua_id
    LEFT JOIN staff s ON s.id = bl.assigned_rm_id
    WHERE NOT COALESCE(b.cancelled, false)
      AND COALESCE(b.commission_paid, 0) > 0
      AND (${dateFrom}::date IS NULL OR COALESCE(b.commission_paid_at::date, b.booking_date) >= ${dateFrom}::date)
      AND (${dateTo}::date IS NULL OR COALESCE(b.commission_paid_at::date, b.booking_date) <= ${dateTo}::date)
      AND (${staffId}::uuid IS NULL OR bl.assigned_rm_id = ${staffId}::uuid)
    ORDER BY COALESCE(b.commission_paid_at, b.booking_date::timestamptz) DESC
    LIMIT ${limit}
  `;
}
