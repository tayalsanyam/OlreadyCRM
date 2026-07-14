import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import { apiErrorResponse } from "@/lib/api-error-response";
import {
  effectiveSalesMonth,
  parseAdminSalesReportFilters,
} from "@/lib/admin-sales-report-filters";
import { PIPELINE_CLOSED_AT_SQL } from "@/lib/sales-reports-queries";
import {
  ONBOARDING_PLAN_TIER_SQL,
} from "@/lib/sales-targets";
import { PLAN_TIER_LABELS, type PlanTier } from "@/lib/types";

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parsePlanMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(value ?? 0);
    if (Number.isFinite(n) && n > 0) out[key] = n;
  }
  return out;
}

function mergePlanMaps(rows: Record<string, number>[]): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const row of rows) {
    for (const [tier, value] of Object.entries(row)) {
      merged[tier] = (merged[tier] ?? 0) + value;
    }
  }
  return merged;
}

function tierLabel(tier: string | null): string {
  if (!tier) return "Non-plan";
  return PLAN_TIER_LABELS[tier as PlanTier] ?? tier;
}

type TrackingMemberRow = {
  userId: string;
  salesperson: string;
  teamName: string | null;
  targetRevenue: string | number;
  actualRevenue: string | number;
  targetPotentialCalls: number;
  actualPotentialCalls: number;
  targetPotentialSold: number;
  actualPotentialSold: number;
  targetExistingCalls: number;
  actualExistingCalls: number;
  targetExistingSold: number;
  actualExistingSold: number;
  targetSoldTotal: number;
  actualDealsClosed: number;
  planTargets: Record<string, number> | null;
  planSold: Record<string, number> | null;
};

type NormalizedTrackingMember = {
  userId: string;
  salesperson: string;
  teamName: string | null;
  targetRevenue: number;
  actualRevenue: number;
  targetPotentialCalls: number;
  actualPotentialCalls: number;
  targetPotentialSold: number;
  actualPotentialSold: number;
  targetExistingCalls: number;
  actualExistingCalls: number;
  targetExistingSold: number;
  actualExistingSold: number;
  targetSoldTotal: number;
  actualDealsClosed: number;
  planTargets: Record<string, number>;
  planSold: Record<string, number>;
};

type ClosedDealRow = {
  muaName: string;
  salesperson: string;
  planTier: string | null;
  amount: string | number;
  closedAt: string;
};

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const f = parseAdminSalesReportFilters(new URL(request.url).searchParams);
  const effectiveMonth = effectiveSalesMonth(f);
  const qPattern = f.q ? `%${f.q}%` : null;
  const closedAtSql = PIPELINE_CLOSED_AT_SQL;
  const tierSql = ONBOARDING_PLAN_TIER_SQL;

  try {
    const payload = await withTransaction(async (tx) => {
      const members = await tx<TrackingMemberRow[]>`
        WITH revenue_actuals AS (
          SELECT
            p.sales_closed_by AS user_id,
            COALESCE(SUM(pr.amount), 0)::numeric(14,2) AS revenue
          FROM sales.payment_records pr
          JOIN sales.pipeline p ON p.id = pr.pipeline_id
          JOIN muas m ON m.id = p.mua_id
          WHERE p.sales_closed_by IS NOT NULL
            AND to_char(pr.payment_date, 'YYYY-MM') = ${effectiveMonth}
            AND (${f.dateFrom}::date IS NULL OR pr.payment_date >= ${f.dateFrom}::date)
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
          GROUP BY p.sales_closed_by
        ),
        sold_actuals AS (
          SELECT
            p.sales_closed_by AS user_id,
            COUNT(*)::int AS deals_closed,
            COUNT(*) FILTER (WHERE p.mua_type = 'candidate')::int AS potential_sold,
            COUNT(*) FILTER (WHERE p.mua_type IN ('re_engage', 'renewal'))::int AS existing_sold
          FROM sales.pipeline p
          JOIN muas m ON m.id = p.mua_id
          WHERE p.stage IN ('Onboarding', 'Deal Closed')
            AND p.sales_closed_by IS NOT NULL
            AND to_char(${tx.unsafe(closedAtSql)}, 'YYYY-MM') = ${effectiveMonth}
            AND (${f.dateFrom}::date IS NULL OR (${tx.unsafe(closedAtSql)})::date >= ${f.dateFrom}::date)
            AND (${f.dateTo}::date IS NULL OR (${tx.unsafe(closedAtSql)})::date <= ${f.dateTo}::date)
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
              ${qPattern}::text IS NULL
              OR m.name ILIKE ${qPattern}
              OR m.city ILIKE ${qPattern}
            )
          GROUP BY p.sales_closed_by
        ),
        call_actuals AS (
          SELECT
            cl.actor_id AS user_id,
            COUNT(DISTINCT p.id) FILTER (WHERE p.mua_type = 'candidate')::int AS potential_calls,
            COUNT(DISTINCT p.id) FILTER (WHERE p.mua_type IN ('re_engage', 'renewal'))::int AS existing_calls
          FROM sales.comms_log cl
          JOIN sales.pipeline p ON p.id = cl.pipeline_id
          JOIN muas m ON m.id = p.mua_id
          WHERE cl.entry_type IN ('callLogged', 'whatsappLogged')
            AND to_char(cl.created_at, 'YYYY-MM') = ${effectiveMonth}
            AND (${f.dateFrom}::date IS NULL OR cl.created_at::date >= ${f.dateFrom}::date)
            AND (${f.dateTo}::date IS NULL OR cl.created_at::date <= ${f.dateTo}::date)
            AND (${f.muaType}::text IS NULL OR p.mua_type = ${f.muaType})
            AND (${f.source}::text IS NULL OR m.source = ${f.source})
            AND (${f.city}::text IS NULL OR m.city = ${f.city})
            AND (${f.assignedTo}::uuid IS NULL OR p.assigned_to = ${f.assignedTo}::uuid)
            AND (${f.teamId}::uuid IS NULL OR m.team_id = ${f.teamId}::uuid)
            AND (
              ${qPattern}::text IS NULL
              OR m.name ILIKE ${qPattern}
              OR m.city ILIKE ${qPattern}
            )
          GROUP BY cl.actor_id
        ),
        plan_sold_by_user AS (
          SELECT
            p.sales_closed_by AS user_id,
            ${tx.unsafe(tierSql)} AS tier,
            COUNT(*)::int AS deals
          FROM sales.pipeline p
          JOIN sales.onboarding o ON o.pipeline_id = p.id
          JOIN muas m ON m.id = p.mua_id
          WHERE p.stage IN ('Onboarding', 'Deal Closed')
            AND p.sales_closed_by IS NOT NULL
            AND to_char(${tx.unsafe(closedAtSql)}, 'YYYY-MM') = ${effectiveMonth}
            AND (${f.dateFrom}::date IS NULL OR (${tx.unsafe(closedAtSql)})::date >= ${f.dateFrom}::date)
            AND (${f.dateTo}::date IS NULL OR (${tx.unsafe(closedAtSql)})::date <= ${f.dateTo}::date)
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
              ${qPattern}::text IS NULL
              OR m.name ILIKE ${qPattern}
              OR m.city ILIKE ${qPattern}
            )
          GROUP BY p.sales_closed_by, ${tx.unsafe(tierSql)}
        )
        SELECT
          s.id AS "userId",
          s.name AS salesperson,
          tm.name AS "teamName",
          COALESCE(st.target_revenue, 0)::numeric(14,2) AS "targetRevenue",
          COALESCE(ra.revenue, 0)::numeric(14,2) AS "actualRevenue",
          COALESCE(st.target_potential_calls, 0)::int AS "targetPotentialCalls",
          COALESCE(ca.potential_calls, 0)::int AS "actualPotentialCalls",
          COALESCE(st.target_potential_sold, 0)::int AS "targetPotentialSold",
          COALESCE(sa.potential_sold, 0)::int AS "actualPotentialSold",
          COALESCE(st.target_existing_calls, 0)::int AS "targetExistingCalls",
          COALESCE(ca.existing_calls, 0)::int AS "actualExistingCalls",
          COALESCE(st.target_existing_sold, 0)::int AS "targetExistingSold",
          COALESCE(sa.existing_sold, 0)::int AS "actualExistingSold",
          (COALESCE(st.target_potential_sold, 0) + COALESCE(st.target_existing_sold, 0))::int AS "targetSoldTotal",
          COALESCE(sa.deals_closed, 0)::int AS "actualDealsClosed",
          st.plan_targets AS "planTargets",
          plan_agg.plan_sold AS "planSold"
        FROM staff s
        LEFT JOIN sales.targets st ON st.user_id = s.id AND st.month = ${effectiveMonth}
        LEFT JOIN sales.teams tm ON tm.id = s.team_id
        LEFT JOIN revenue_actuals ra ON ra.user_id = s.id
        LEFT JOIN sold_actuals sa ON sa.user_id = s.id
        LEFT JOIN call_actuals ca ON ca.user_id = s.id
        LEFT JOIN LATERAL (
          SELECT COALESCE(jsonb_object_agg(tier, deals), '{}'::jsonb) AS plan_sold
          FROM (
            SELECT tier, SUM(deals)::int AS deals
            FROM plan_sold_by_user ps
            WHERE ps.user_id = s.id AND tier IS NOT NULL
            GROUP BY tier
          ) agg
        ) plan_agg ON TRUE
        WHERE s.active = true
          AND s.role::text IN ('sales_rm', 'sales_tl')
          AND (${f.unassignedOnly}::boolean IS FALSE)
          AND (${f.assignedTo}::uuid IS NULL OR s.id = ${f.assignedTo}::uuid)
          AND (${f.teamId}::uuid IS NULL OR s.team_id = ${f.teamId}::uuid)
          AND (
            ${qPattern}::text IS NULL
            OR s.name ILIKE ${qPattern}
          )
        ORDER BY tm.name NULLS LAST, s.name ASC
      `;

      const closedDeals = await tx<ClosedDealRow[]>`
        SELECT
          m.name AS "muaName",
          COALESCE(s.name, 'Unknown') AS salesperson,
          ${tx.unsafe(tierSql)} AS "planTier",
          COALESCE(pay.total_amount, 0)::numeric(14,2) AS amount,
          ${tx.unsafe(closedAtSql)} AS "closedAt"
        FROM sales.pipeline p
        JOIN muas m ON m.id = p.mua_id
        JOIN sales.onboarding o ON o.pipeline_id = p.id
        LEFT JOIN staff s ON s.id = p.sales_closed_by
        LEFT JOIN LATERAL (
          SELECT SUM(pr.amount)::numeric(14,2) AS total_amount
          FROM sales.payment_records pr
          WHERE pr.pipeline_id = p.id
            AND to_char(pr.payment_date, 'YYYY-MM') = ${effectiveMonth}
        ) pay ON TRUE
        WHERE p.stage IN ('Onboarding', 'Deal Closed')
          AND p.sales_closed_by IS NOT NULL
          AND to_char(${tx.unsafe(closedAtSql)}, 'YYYY-MM') = ${effectiveMonth}
          AND (${f.dateFrom}::date IS NULL OR (${tx.unsafe(closedAtSql)})::date >= ${f.dateFrom}::date)
          AND (${f.dateTo}::date IS NULL OR (${tx.unsafe(closedAtSql)})::date <= ${f.dateTo}::date)
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
            OR s.name ILIKE ${qPattern}
          )
          AND (
            ${f.assignedTo}::uuid IS NULL
            OR p.sales_closed_by = ${f.assignedTo}::uuid
            OR s.id = ${f.assignedTo}::uuid
          )
        ORDER BY ${tx.unsafe(closedAtSql)} DESC, m.name
        LIMIT 200
      `;

      const normalizedMembers: NormalizedTrackingMember[] = members.map((m: TrackingMemberRow) => ({
        userId: m.userId,
        salesperson: m.salesperson,
        teamName: m.teamName,
        targetRevenue: num(m.targetRevenue),
        actualRevenue: num(m.actualRevenue),
        targetPotentialCalls: num(m.targetPotentialCalls),
        actualPotentialCalls: num(m.actualPotentialCalls),
        targetPotentialSold: num(m.targetPotentialSold),
        actualPotentialSold: num(m.actualPotentialSold),
        targetExistingCalls: num(m.targetExistingCalls),
        actualExistingCalls: num(m.actualExistingCalls),
        targetExistingSold: num(m.targetExistingSold),
        actualExistingSold: num(m.actualExistingSold),
        targetSoldTotal: num(m.targetSoldTotal),
        actualDealsClosed: num(m.actualDealsClosed),
        planTargets: parsePlanMap(m.planTargets),
        planSold: parsePlanMap(m.planSold),
      }));

      const overview = {
        targetRevenue: normalizedMembers.reduce((s, m) => s + m.targetRevenue, 0),
        actualRevenue: normalizedMembers.reduce((s, m) => s + m.actualRevenue, 0),
        targetSoldTotal: normalizedMembers.reduce((s, m) => s + m.targetSoldTotal, 0),
        actualDealsClosed: normalizedMembers.reduce((s, m) => s + m.actualDealsClosed, 0),
        targetPotentialSold: normalizedMembers.reduce((s, m) => s + m.targetPotentialSold, 0),
        actualPotentialSold: normalizedMembers.reduce((s, m) => s + m.actualPotentialSold, 0),
        targetExistingSold: normalizedMembers.reduce((s, m) => s + m.targetExistingSold, 0),
        actualExistingSold: normalizedMembers.reduce((s, m) => s + m.actualExistingSold, 0),
        planTargets: mergePlanMaps(normalizedMembers.map((m) => m.planTargets)),
        planSold: mergePlanMaps(normalizedMembers.map((m) => m.planSold)),
      };

      return {
        month: effectiveMonth,
        overview,
        members: normalizedMembers,
        closedDeals: closedDeals.map((d: ClosedDealRow) => ({
          muaName: d.muaName,
          salesperson: d.salesperson,
          planTier: d.planTier,
          planLabel: tierLabel(d.planTier),
          amount: num(d.amount),
          closedAt: d.closedAt,
        })),
      };
    });

    return NextResponse.json({ data: payload, error: null });
  } catch (error) {
    return apiErrorResponse(error, "Failed to load target tracking");
  }
}
