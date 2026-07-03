import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import {
  effectiveSalesMonth,
  parseAdminSalesReportFilters,
} from "@/lib/admin-sales-report-filters";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const f = parseAdminSalesReportFilters(new URL(request.url).searchParams);
  const effectiveMonth = effectiveSalesMonth(f);
  const qPattern = f.q ? `%${f.q}%` : null;

  const data = await withTransaction(async (tx) => {
    const monthly = await tx`
      SELECT
        COALESCE(SUM(pr.amount), 0)::numeric(14,2) AS "totalRevenue",
        COUNT(*)::int AS "paymentsCount",
        TO_CHAR(pr.payment_date, 'YYYY-MM') AS month
      FROM sales.payment_records pr
      JOIN sales.pipeline p ON p.id = pr.pipeline_id
      JOIN muas m ON m.id = p.mua_id
      WHERE (
          (${f.dateFrom}::date IS NOT NULL AND pr.payment_date >= ${f.dateFrom}::date)
          OR (
            ${f.dateFrom}::date IS NULL
            AND TO_CHAR(pr.payment_date, 'YYYY-MM') = ${effectiveMonth}
          )
        )
        AND (${f.dateTo}::date IS NULL OR pr.payment_date <= ${f.dateTo}::date)
        AND (${f.stage}::text IS NULL OR p.stage = ${f.stage})
        AND (${f.muaType}::text IS NULL OR p.mua_type = ${f.muaType})
        AND (${f.source}::text IS NULL OR m.source = ${f.source})
        AND (${f.city}::text IS NULL OR m.city = ${f.city})
        AND (${f.assignedTo}::uuid IS NULL OR p.assigned_to = ${f.assignedTo}::uuid)
        AND (
          ${f.teamId}::uuid IS NULL
          OR m.team_id = ${f.teamId}::uuid
          OR EXISTS (
            SELECT 1 FROM staff _st
            WHERE _st.id IN (p.sales_closed_by, p.assigned_to)
              AND _st.team_id = ${f.teamId}::uuid
          )
        )
        AND (${f.unassignedOnly}::boolean IS FALSE OR p.assigned_to IS NULL)
        AND (
          ${f.assignedOnly}::boolean IS FALSE
          OR EXISTS (
            SELECT 1 FROM staff _asf
            WHERE _asf.id = p.assigned_to
              AND _asf.role IN ('sales_rm', 'sales_tl')
          )
        )
        AND (
          ${qPattern}::text IS NULL
          OR m.name ILIKE ${qPattern}
          OR m.city ILIKE ${qPattern}
        )
      GROUP BY TO_CHAR(pr.payment_date, 'YYYY-MM')
    `;

    const byMode = await tx`
      SELECT payment_mode AS "paymentMode", COALESCE(SUM(pr.amount), 0)::numeric(14,2) AS revenue, COUNT(*)::int AS total
      FROM sales.payment_records pr
      JOIN sales.pipeline p ON p.id = pr.pipeline_id
      JOIN muas m ON m.id = p.mua_id
      WHERE (
          (${f.dateFrom}::date IS NOT NULL AND pr.payment_date >= ${f.dateFrom}::date)
          OR (
            ${f.dateFrom}::date IS NULL
            AND TO_CHAR(pr.payment_date, 'YYYY-MM') = ${effectiveMonth}
          )
        )
        AND (${f.dateTo}::date IS NULL OR pr.payment_date <= ${f.dateTo}::date)
        AND (${f.stage}::text IS NULL OR p.stage = ${f.stage})
        AND (${f.muaType}::text IS NULL OR p.mua_type = ${f.muaType})
        AND (${f.source}::text IS NULL OR m.source = ${f.source})
        AND (${f.city}::text IS NULL OR m.city = ${f.city})
        AND (${f.assignedTo}::uuid IS NULL OR p.assigned_to = ${f.assignedTo}::uuid)
        AND (
          ${f.teamId}::uuid IS NULL
          OR m.team_id = ${f.teamId}::uuid
          OR EXISTS (
            SELECT 1 FROM staff _st
            WHERE _st.id IN (p.sales_closed_by, p.assigned_to)
              AND _st.team_id = ${f.teamId}::uuid
          )
        )
        AND (${f.unassignedOnly}::boolean IS FALSE OR p.assigned_to IS NULL)
        AND (
          ${f.assignedOnly}::boolean IS FALSE
          OR EXISTS (
            SELECT 1 FROM staff _asf
            WHERE _asf.id = p.assigned_to
              AND _asf.role IN ('sales_rm', 'sales_tl')
          )
        )
        AND (
          ${qPattern}::text IS NULL
          OR m.name ILIKE ${qPattern}
          OR m.city ILIKE ${qPattern}
        )
      GROUP BY payment_mode
      ORDER BY revenue DESC
    `;

    const bySalesperson = await tx`
      SELECT
        COALESCE(s.name, 'Unknown') AS salesperson,
        COALESCE(SUM(pr.amount), 0)::numeric(14,2) AS revenue,
        COUNT(DISTINCT p.id)::int AS deals
      FROM sales.pipeline p
      JOIN sales.payment_records pr ON pr.pipeline_id = p.id
      JOIN muas m ON m.id = p.mua_id
      LEFT JOIN staff s ON s.id = p.sales_closed_by
      WHERE (
          (${f.dateFrom}::date IS NOT NULL AND pr.payment_date >= ${f.dateFrom}::date)
          OR (
            ${f.dateFrom}::date IS NULL
            AND TO_CHAR(pr.payment_date, 'YYYY-MM') = ${effectiveMonth}
          )
        )
        AND (${f.dateTo}::date IS NULL OR pr.payment_date <= ${f.dateTo}::date)
        AND (${f.stage}::text IS NULL OR p.stage = ${f.stage})
        AND (${f.muaType}::text IS NULL OR p.mua_type = ${f.muaType})
        AND (${f.source}::text IS NULL OR m.source = ${f.source})
        AND (${f.city}::text IS NULL OR m.city = ${f.city})
        AND (${f.assignedTo}::uuid IS NULL OR p.assigned_to = ${f.assignedTo}::uuid)
        AND (
          ${f.teamId}::uuid IS NULL
          OR m.team_id = ${f.teamId}::uuid
          OR EXISTS (
            SELECT 1 FROM staff _st
            WHERE _st.id IN (p.sales_closed_by, p.assigned_to)
              AND _st.team_id = ${f.teamId}::uuid
          )
        )
        AND (${f.unassignedOnly}::boolean IS FALSE OR p.assigned_to IS NULL)
        AND (
          ${f.assignedOnly}::boolean IS FALSE
          OR EXISTS (
            SELECT 1 FROM staff _asf
            WHERE _asf.id = p.assigned_to
              AND _asf.role IN ('sales_rm', 'sales_tl')
          )
        )
        AND (
          ${qPattern}::text IS NULL
          OR m.name ILIKE ${qPattern}
          OR m.city ILIKE ${qPattern}
        )
      GROUP BY COALESCE(s.name, 'Unknown')
      ORDER BY revenue DESC
    `;

    const byDeal = await tx`
      SELECT
        m.name AS "muaName",
        COALESCE(closer.name, assignee.name, 'Unknown') AS "salesRm",
        pay.total_amount AS amount,
        COALESCE(pt.name, NULLIF(REPLACE(m.plan_tier::text, '_', ' '), ''), 'Non-plan') AS plan,
        pay.last_payment_date AS date
      FROM (
        SELECT
          pipeline_id,
          SUM(amount)::numeric(14,2) AS total_amount,
          MAX(payment_date) AS last_payment_date
        FROM sales.payment_records
        GROUP BY pipeline_id
      ) pay
      JOIN sales.pipeline p ON p.id = pay.pipeline_id
      JOIN muas m ON m.id = p.mua_id
      LEFT JOIN staff closer ON closer.id = p.sales_closed_by
      LEFT JOIN staff assignee ON assignee.id = p.assigned_to
      LEFT JOIN plan_tiers pt ON pt.tier = m.plan_tier
      WHERE EXISTS (
        SELECT 1
        FROM sales.payment_records prf
        WHERE prf.pipeline_id = p.id
          AND (
            (${f.dateFrom}::date IS NOT NULL AND prf.payment_date >= ${f.dateFrom}::date)
            OR (
              ${f.dateFrom}::date IS NULL
              AND TO_CHAR(prf.payment_date, 'YYYY-MM') = ${effectiveMonth}
            )
          )
          AND (${f.dateTo}::date IS NULL OR prf.payment_date <= ${f.dateTo}::date)
      )
      AND (${f.stage}::text IS NULL OR p.stage = ${f.stage})
      AND (${f.muaType}::text IS NULL OR p.mua_type = ${f.muaType})
      AND (${f.source}::text IS NULL OR m.source = ${f.source})
      AND (${f.city}::text IS NULL OR m.city = ${f.city})
      AND (${f.assignedTo}::uuid IS NULL OR p.assigned_to = ${f.assignedTo}::uuid)
      AND (
        ${f.teamId}::uuid IS NULL
        OR m.team_id = ${f.teamId}::uuid
        OR EXISTS (
          SELECT 1 FROM staff _st
          WHERE _st.id IN (p.sales_closed_by, p.assigned_to)
            AND _st.team_id = ${f.teamId}::uuid
        )
      )
      AND (${f.unassignedOnly}::boolean IS FALSE OR p.assigned_to IS NULL)
      AND (
        ${f.assignedOnly}::boolean IS FALSE
        OR EXISTS (
          SELECT 1 FROM staff _asf
          WHERE _asf.id = p.assigned_to
            AND _asf.role IN ('sales_rm', 'sales_tl')
        )
      )
      AND (
        ${qPattern}::text IS NULL
        OR m.name ILIKE ${qPattern}
        OR m.city ILIKE ${qPattern}
        OR closer.name ILIKE ${qPattern}
        OR assignee.name ILIKE ${qPattern}
      )
      ORDER BY pay.last_payment_date DESC, m.name
    `;

    return [
      ...(monthly as Record<string, unknown>[]).map((r) => ({ section: "monthly", ...r })),
      ...(byMode as Record<string, unknown>[]).map((r) => ({ section: "byMode", month: effectiveMonth, ...r })),
      ...(bySalesperson as Record<string, unknown>[]).map((r) => ({
        section: "bySalesperson",
        month: effectiveMonth,
        ...r,
      })),
      ...(byDeal as Record<string, unknown>[]).map((r) => ({
        section: "byDeal",
        month: effectiveMonth,
        ...r,
      })),
    ];
  });

  return NextResponse.json({ data, error: null });
}
