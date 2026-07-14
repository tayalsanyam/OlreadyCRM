import type { TransactionSql } from "@/db/index";
import type { PlanTier } from "@/lib/types";
import { PIPELINE_CLOSED_AT_SQL } from "@/lib/sales-reports-queries";

export const SALES_PLAN_TIERS: PlanTier[] = ["highestPrivy", "phoenix2", "phoenix", "pro", "prime"];

/** Map onboarding.plan text to app plan-tier keys (matches parsePlanTier). */
export const ONBOARDING_PLAN_TIER_SQL = `CASE
  WHEN o.plan ~* '(highest|privy)' THEN 'highestPrivy'
  WHEN o.plan ~* '(phoenix\\s*2|phoenix2|phoenix_2)' THEN 'phoenix2'
  WHEN lower(trim(o.plan)) = 'phoenix' THEN 'phoenix'
  WHEN lower(trim(o.plan)) = 'pro' THEN 'pro'
  WHEN lower(trim(o.plan)) = 'prime' THEN 'prime'
  ELSE NULL
END`;

export type SalesTargetRow = {
  targetRevenue?: number | null;
  targetPotentialCalls?: number | null;
  targetPotentialSold?: number | null;
  targetExistingCalls?: number | null;
  targetExistingSold?: number | null;
  minCallsPerDay?: number | null;
  minTalkTimeMinPerDay?: number | null;
  planTargets?: Record<string, number | null> | null;
  plan_targets?: Record<string, number | null> | null;
};

export type SalesTargetAggregate = {
  targetRevenue: number;
  targetPotentialCalls: number;
  targetPotentialSold: number;
  targetExistingCalls: number;
  targetExistingSold: number;
  targetSoldTotal: number;
  minCallsPerDay: number;
  minTalkTimeMinPerDay: number;
  planTargets: Record<string, number> | null;
};

export type SalesTargetActuals = {
  revenue: number;
  sold: number;
  potentialCalls: number;
  potentialSold: number;
  existingCalls: number;
  existingSold: number;
  avgCallsPerDay: number;
  avgTalkTimePerDay: number;
  planSold: Record<string, number>;
};

export type SalesTargetPace = {
  daysElapsed: number;
  daysInMonth: number;
  daysRemaining: number;
  timePct: number;
  revenuePct: number;
  soldPct: number;
  potentialSoldPct: number;
  existingSoldPct: number;
  potentialCallsPct: number;
  existingCallsPct: number;
  revenueGap: number;
  soldGap: number;
  potentialSoldGap: number;
  existingSoldGap: number;
  potentialCallsGap: number;
  existingCallsGap: number;
  projectedRevenue: number;
  projectedSold: number;
  revenueOnPace: boolean;
  soldOnPace: boolean;
  callsPct: number;
  talkPct: number;
};

export type SalesTargetMemberRow = {
  userId: string;
  name: string;
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
  actualSold: number;
};

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function sumPlanTargets(targets: Array<Record<string, unknown>>): Record<string, number> | null {
  const merged: Record<string, number> = {};
  for (const t of targets) {
    const raw = (t.plan_targets ?? t.planTargets) as Record<string, unknown> | null | undefined;
    if (!raw || typeof raw !== "object") continue;
    for (const [tier, value] of Object.entries(raw)) {
      const n = Number(value ?? 0);
      if (!Number.isFinite(n) || n <= 0) continue;
      merged[tier] = (merged[tier] ?? 0) + n;
    }
  }
  return Object.keys(merged).length ? merged : null;
}

export function normalizeTargetRow(row: Record<string, unknown>): SalesTargetAggregate {
  const targetPotentialSold = num(row.target_potential_sold ?? row.targetPotentialSold);
  const targetExistingSold = num(row.target_existing_sold ?? row.targetExistingSold);
  const planRaw = (row.plan_targets ?? row.planTargets) as Record<string, unknown> | null | undefined;
  let planTargets: Record<string, number> | null = null;
  if (planRaw && typeof planRaw === "object") {
    const merged: Record<string, number> = {};
    for (const [tier, value] of Object.entries(planRaw)) {
      const n = Number(value ?? 0);
      if (Number.isFinite(n) && n > 0) merged[tier] = n;
    }
    planTargets = Object.keys(merged).length ? merged : null;
  }

  return {
    targetRevenue: num(row.target_revenue ?? row.targetRevenue),
    targetPotentialCalls: num(row.target_potential_calls ?? row.targetPotentialCalls),
    targetPotentialSold,
    targetExistingCalls: num(row.target_existing_calls ?? row.targetExistingCalls),
    targetExistingSold,
    targetSoldTotal: targetPotentialSold + targetExistingSold,
    minCallsPerDay: num(row.min_calls_per_day ?? row.minCallsPerDay),
    minTalkTimeMinPerDay: num(row.min_talk_time_min_per_day ?? row.minTalkTimeMinPerDay),
    planTargets,
  };
}

export function aggregateSalesTargets(rows: Record<string, unknown>[]): SalesTargetAggregate | null {
  if (!rows.length) return null;
  if (rows.length === 1) return normalizeTargetRow(rows[0]!);
  const planTargets = sumPlanTargets(rows);
  const targetPotentialSold = rows.reduce(
    (s, r) => s + num(r.target_potential_sold ?? r.targetPotentialSold),
    0,
  );
  const targetExistingSold = rows.reduce(
    (s, r) => s + num(r.target_existing_sold ?? r.targetExistingSold),
    0,
  );
  return {
    targetRevenue: rows.reduce((s, r) => s + num(r.target_revenue ?? r.targetRevenue), 0),
    targetPotentialCalls: rows.reduce(
      (s, r) => s + num(r.target_potential_calls ?? r.targetPotentialCalls),
      0,
    ),
    targetPotentialSold,
    targetExistingCalls: rows.reduce(
      (s, r) => s + num(r.target_existing_calls ?? r.targetExistingCalls),
      0,
    ),
    targetExistingSold,
    targetSoldTotal: targetPotentialSold + targetExistingSold,
    minCallsPerDay: rows.reduce((s, r) => s + num(r.min_calls_per_day ?? r.minCallsPerDay), 0),
    minTalkTimeMinPerDay: rows.reduce(
      (s, r) => s + num(r.min_talk_time_min_per_day ?? r.minTalkTimeMinPerDay),
      0,
    ),
    planTargets,
  };
}

export function salesTargetHasValues(target: SalesTargetAggregate | null): boolean {
  if (!target) return false;
  return (
    target.targetRevenue > 0 ||
    target.targetPotentialCalls > 0 ||
    target.targetPotentialSold > 0 ||
    target.targetExistingCalls > 0 ||
    target.targetExistingSold > 0 ||
    target.minCallsPerDay > 0 ||
    target.minTalkTimeMinPerDay > 0 ||
    (target.planTargets != null && Object.keys(target.planTargets).length > 0)
  );
}

export function pct(actual: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.round((actual / target) * 100));
}

export function computeSalesTargetPace(
  month: string,
  target: SalesTargetAggregate | null,
  actuals: SalesTargetActuals,
): SalesTargetPace {
  const [y, mo] = month.split("-").map(Number);
  const daysInMonth = new Date(y!, mo!, 0).getDate();
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === y && now.getMonth() + 1 === mo;
  const daysElapsed = isCurrentMonth ? now.getDate() : daysInMonth;
  const timePct = daysInMonth > 0 ? Math.round((daysElapsed / daysInMonth) * 100) : 100;

  const revenueTarget = target?.targetRevenue ?? 0;
  const soldTarget = target?.targetSoldTotal ?? 0;
  const potentialSoldTarget = target?.targetPotentialSold ?? 0;
  const existingSoldTarget = target?.targetExistingSold ?? 0;
  const potentialCallsTarget = target?.targetPotentialCalls ?? 0;
  const existingCallsTarget = target?.targetExistingCalls ?? 0;

  const revenuePct = pct(actuals.revenue, revenueTarget);
  const soldPct = pct(actuals.sold, soldTarget);
  const potentialSoldPct = pct(actuals.potentialSold, potentialSoldTarget);
  const existingSoldPct = pct(actuals.existingSold, existingSoldTarget);
  const potentialCallsPct = pct(actuals.potentialCalls, potentialCallsTarget);
  const existingCallsPct = pct(actuals.existingCalls, existingCallsTarget);

  const dailyRevenue = daysElapsed > 0 ? actuals.revenue / daysElapsed : 0;
  const dailySold = daysElapsed > 0 ? actuals.sold / daysElapsed : 0;

  const minCalls = target?.minCallsPerDay ?? 0;
  const minTalk = target?.minTalkTimeMinPerDay ?? 0;
  const callsPct = pct(actuals.avgCallsPerDay, minCalls);
  const talkPct = pct(actuals.avgTalkTimePerDay, minTalk);

  return {
    daysElapsed,
    daysInMonth,
    daysRemaining: Math.max(0, daysInMonth - daysElapsed),
    timePct,
    revenuePct,
    soldPct,
    potentialSoldPct,
    existingSoldPct,
    potentialCallsPct,
    existingCallsPct,
    revenueGap: Math.max(0, revenueTarget - actuals.revenue),
    soldGap: Math.max(0, soldTarget - actuals.sold),
    potentialSoldGap: Math.max(0, potentialSoldTarget - actuals.potentialSold),
    existingSoldGap: Math.max(0, existingSoldTarget - actuals.existingSold),
    potentialCallsGap: Math.max(0, potentialCallsTarget - actuals.potentialCalls),
    existingCallsGap: Math.max(0, existingCallsTarget - actuals.existingCalls),
    projectedRevenue: Math.round(dailyRevenue * daysInMonth),
    projectedSold: Number((dailySold * daysInMonth).toFixed(1)),
    revenueOnPace: revenuePct >= timePct - 5,
    soldOnPace: soldPct >= timePct - 5,
    callsPct,
    talkPct,
  };
}

type ScopeFilters = {
  closedBy: unknown;
  closedByP: unknown;
  actor: unknown;
  caller: unknown;
};

export async function fetchSalesTargetActuals(
  tx: TransactionSql,
  month: string,
  filters: ScopeFilters,
): Promise<SalesTargetActuals> {
  const { closedBy, closedByP, actor, caller } = filters;
  const closedAt = tx.unsafe(PIPELINE_CLOSED_AT_SQL);

  const [revenue] = await tx<{ amount: number }[]>`
    SELECT COALESCE(SUM(pr.amount),0)::numeric AS amount
    FROM sales.payment_records pr
    JOIN sales.pipeline p ON p.id = pr.pipeline_id
    WHERE ${closedByP}
      AND to_char(pr.payment_date, 'YYYY-MM') = ${month}
  `;
  const [sold] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM sales.pipeline p
    WHERE ${closedBy}
      AND p.stage IN ('Onboarding', 'Deal Closed')
      AND to_char(${closedAt}, 'YYYY-MM') = ${month}
  `;
  const [potentialCalls] = await tx<{ count: number }[]>`
    SELECT COUNT(DISTINCT p.id)::int AS count
    FROM sales.comms_log cl
    JOIN sales.pipeline p ON p.id = cl.pipeline_id
    WHERE ${actor}
      AND cl.entry_type IN ('callLogged', 'whatsappLogged')
      AND p.mua_type = 'candidate'
      AND to_char(cl.created_at, 'YYYY-MM') = ${month}
  `;
  const [existingCalls] = await tx<{ count: number }[]>`
    SELECT COUNT(DISTINCT p.id)::int AS count
    FROM sales.comms_log cl
    JOIN sales.pipeline p ON p.id = cl.pipeline_id
    WHERE ${actor}
      AND cl.entry_type IN ('callLogged', 'whatsappLogged')
      AND p.mua_type IN ('re_engage', 'renewal')
      AND to_char(cl.created_at, 'YYYY-MM') = ${month}
  `;
  const [potentialSold] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM sales.pipeline p
    WHERE ${closedBy}
      AND p.stage IN ('Onboarding', 'Deal Closed')
      AND p.mua_type = 'candidate'
      AND to_char(${closedAt}, 'YYYY-MM') = ${month}
  `;
  const [existingSold] = await tx<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM sales.pipeline p
    WHERE ${closedBy}
      AND p.stage IN ('Onboarding', 'Deal Closed')
      AND p.mua_type IN ('re_engage', 'renewal')
      AND to_char(${closedAt}, 'YYYY-MM') = ${month}
  `;
  const [calls7] = await tx<{ count: number }[]>`
    SELECT (
      COALESCE((SELECT COUNT(*) FROM sales.call_logs c WHERE ${caller} AND c.called_at::date >= CURRENT_DATE - INTERVAL '6 day'), 0)
      +
      COALESCE((SELECT COUNT(*) FROM sales.comms_log cl WHERE ${actor} AND cl.entry_type = 'callLogged' AND cl.created_at::date >= CURRENT_DATE - INTERVAL '6 day'), 0)
    )::int AS count
  `;
  const [talk7] = await tx<{ minutes: number }[]>`
    SELECT COALESCE(SUM(c.duration_sec),0)::numeric / 60.0 AS minutes
    FROM sales.call_logs c
    WHERE ${caller}
      AND c.called_at::date >= CURRENT_DATE - INTERVAL '6 day'
  `;

  const planRows = await tx<{ tier: string | null; count: number }[]>`
    SELECT ${tx.unsafe(ONBOARDING_PLAN_TIER_SQL)} AS tier, COUNT(*)::int AS count
    FROM sales.pipeline p
    JOIN sales.onboarding o ON o.pipeline_id = p.id
    WHERE ${closedBy}
      AND p.stage IN ('Onboarding', 'Deal Closed')
      AND to_char(${closedAt}, 'YYYY-MM') = ${month}
    GROUP BY 1
  `;

  const planSold: Record<string, number> = {};
  for (const row of planRows) {
    if (row.tier) planSold[row.tier] = row.count;
  }

  return {
    revenue: Number(revenue?.amount ?? 0),
    sold: sold?.count ?? 0,
    potentialCalls: potentialCalls?.count ?? 0,
    potentialSold: potentialSold?.count ?? 0,
    existingCalls: existingCalls?.count ?? 0,
    existingSold: existingSold?.count ?? 0,
    avgCallsPerDay: Number(((calls7?.count ?? 0) / 7).toFixed(2)),
    avgTalkTimePerDay: Number((Number(talk7?.minutes ?? 0) / 7).toFixed(2)),
    planSold,
  };
}

export async function fetchSalesTargetByMember(
  tx: TransactionSql,
  month: string,
  userIds: string[] | null,
): Promise<SalesTargetMemberRow[]> {
  const closedAt = tx.unsafe(PIPELINE_CLOSED_AT_SQL);

  if (userIds && userIds.length === 1) return [];

  const userFilter =
    userIds && userIds.length > 0
      ? tx`AND st.user_id = ANY(${userIds}::uuid[])`
      : tx``;
  const actualUserFilter =
    userIds && userIds.length > 0
      ? tx`AND p.sales_closed_by = ANY(${userIds}::uuid[])`
      : tx``;
  const commsUserFilter =
    userIds && userIds.length > 0
      ? tx`AND cl.actor_id = ANY(${userIds}::uuid[])`
      : tx``;

  const rows = await tx<SalesTargetMemberRow[]>`
    WITH revenue_actuals AS (
      SELECT
        p.sales_closed_by AS user_id,
        COALESCE(SUM(pr.amount), 0)::numeric AS revenue
      FROM sales.payment_records pr
      JOIN sales.pipeline p ON p.id = pr.pipeline_id
      WHERE p.sales_closed_by IS NOT NULL
        AND to_char(pr.payment_date, 'YYYY-MM') = ${month}
        ${actualUserFilter}
      GROUP BY p.sales_closed_by
    ),
    sold_actuals AS (
      SELECT
        p.sales_closed_by AS user_id,
        COUNT(*)::int AS deals_closed,
        COUNT(*) FILTER (WHERE p.mua_type = 'candidate')::int AS potential_sold,
        COUNT(*) FILTER (WHERE p.mua_type IN ('re_engage', 'renewal'))::int AS existing_sold
      FROM sales.pipeline p
      WHERE p.stage IN ('Onboarding', 'Deal Closed')
        AND p.sales_closed_by IS NOT NULL
        AND to_char(${closedAt}, 'YYYY-MM') = ${month}
        ${actualUserFilter}
      GROUP BY p.sales_closed_by
    ),
    call_actuals AS (
      SELECT
        cl.actor_id AS user_id,
        COUNT(DISTINCT p.id) FILTER (WHERE p.mua_type = 'candidate')::int AS potential_calls,
        COUNT(DISTINCT p.id) FILTER (WHERE p.mua_type IN ('re_engage', 'renewal'))::int AS existing_calls
      FROM sales.comms_log cl
      JOIN sales.pipeline p ON p.id = cl.pipeline_id
      WHERE cl.entry_type IN ('callLogged', 'whatsappLogged')
        AND to_char(cl.created_at, 'YYYY-MM') = ${month}
        ${commsUserFilter}
      GROUP BY cl.actor_id
    )
    SELECT
      st.user_id AS "userId",
      s.name,
      COALESCE(st.target_revenue, 0)::numeric AS "targetRevenue",
      COALESCE(ra.revenue, 0)::numeric AS "actualRevenue",
      COALESCE(st.target_potential_calls, 0)::int AS "targetPotentialCalls",
      COALESCE(ca.potential_calls, 0)::int AS "actualPotentialCalls",
      COALESCE(st.target_potential_sold, 0)::int AS "targetPotentialSold",
      COALESCE(sa.potential_sold, 0)::int AS "actualPotentialSold",
      COALESCE(st.target_existing_calls, 0)::int AS "targetExistingCalls",
      COALESCE(ca.existing_calls, 0)::int AS "actualExistingCalls",
      COALESCE(st.target_existing_sold, 0)::int AS "targetExistingSold",
      COALESCE(sa.existing_sold, 0)::int AS "actualExistingSold",
      (COALESCE(st.target_potential_sold, 0) + COALESCE(st.target_existing_sold, 0))::int AS "targetSoldTotal",
      COALESCE(sa.deals_closed, 0)::int AS "actualSold"
    FROM sales.targets st
    JOIN staff s ON s.id = st.user_id
    LEFT JOIN revenue_actuals ra ON ra.user_id = st.user_id
    LEFT JOIN sold_actuals sa ON sa.user_id = st.user_id
    LEFT JOIN call_actuals ca ON ca.user_id = st.user_id
    WHERE st.month = ${month}
      AND s.role::text IN ('sales_rm', 'sales_tl')
      AND s.active = true
      ${userFilter}
    ORDER BY s.name
  `;

  return rows;
}
