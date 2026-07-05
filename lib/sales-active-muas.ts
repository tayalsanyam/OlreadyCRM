import type { TransactionSql } from "@/db/index";
import {
  listTeamSalesMembers,
  resolveTeamForUser,
} from "@/lib/sales-report-scope";

export type ActiveMuaRow = {
  id: string;
  name: string;
  city: string;
  planTier: string | null;
  planExpiry: string | null;
  salesClosedByName: string | null;
  assignedRmName: string | null;
  salesClosedAt: string | null;
  dealAmount: number | null;
  pipelineId: string | null;
  daysUntilExpiry: number | null;
};

/** Customer on a live subscription — roster-active with plan dates on file. */
export function onPlanMuaFilter(tx: TransactionSql) {
  return tx`
    m.status = 'active'
    AND m.plan_tier IS NOT NULL
    AND m.plan_expiry IS NOT NULL
  `;
}

const ACTIVE_MUA_SELECT = (tx: TransactionSql) => tx`
  SELECT
    m.id,
    m.name,
    m.city,
    m.plan_tier AS "planTier",
    m.plan_expiry AS "planExpiry",
    s.name AS "salesClosedByName",
    rm.name AS "assignedRmName",
    closed.updated_at AS "salesClosedAt",
    o.quoted_amount AS "dealAmount",
    closed.id AS "pipelineId",
    (m.plan_expiry::date - CURRENT_DATE)::int AS "daysUntilExpiry"
  FROM muas m
  LEFT JOIN staff s ON s.id = COALESCE(
    m.sales_closed_by,
    (SELECT p.sales_closed_by FROM sales.pipeline p
     WHERE p.mua_id = m.id AND p.stage IN ('Onboarding', 'Deal Closed')
     ORDER BY p.updated_at DESC LIMIT 1)
  )
  LEFT JOIN staff rm ON rm.id = m.assigned_rm_id
  LEFT JOIN LATERAL (
    SELECT sp.id, sp.updated_at, sp.sales_closed_by
    FROM sales.pipeline sp
    WHERE sp.mua_id = m.id AND sp.stage IN ('Onboarding', 'Deal Closed')
    ORDER BY sp.updated_at DESC
    LIMIT 1
  ) closed ON TRUE
  LEFT JOIN sales.onboarding o ON o.pipeline_id = closed.id
`;

function closerMatchesUser(tx: TransactionSql, userId: string) {
  return tx`COALESCE(
    m.sales_closed_by,
    (SELECT p.sales_closed_by FROM sales.pipeline p
     WHERE p.mua_id = m.id AND p.stage IN ('Onboarding', 'Deal Closed')
     ORDER BY p.updated_at DESC LIMIT 1)
  ) = ${userId}::uuid`;
}

function closerInTeam(tx: TransactionSql, userIds: string[]) {
  if (userIds.length === 0) return tx`FALSE`;
  return tx`COALESCE(
    m.sales_closed_by,
    (SELECT p.sales_closed_by FROM sales.pipeline p
     WHERE p.mua_id = m.id AND p.stage IN ('Onboarding', 'Deal Closed')
     ORDER BY p.updated_at DESC LIMIT 1)
  ) = ANY(${userIds}::uuid[])`;
}

export async function listActiveMuasForSalesRm(
  tx: TransactionSql,
  userId: string,
): Promise<ActiveMuaRow[]> {
  return tx<ActiveMuaRow[]>`
    ${ACTIVE_MUA_SELECT(tx)}
    WHERE ${onPlanMuaFilter(tx)}
      AND ${closerMatchesUser(tx, userId)}
    ORDER BY m.plan_expiry NULLS LAST, m.name
  `;
}

export async function listActiveMuasForSalesTl(
  tx: TransactionSql,
  tlUserId: string,
): Promise<ActiveMuaRow[]> {
  const { teamId } = await resolveTeamForUser(tx, tlUserId);
  const memberIds = new Set<string>([tlUserId]);
  if (teamId) {
    const members = await listTeamSalesMembers(tx, teamId);
    for (const m of members) memberIds.add(m.id);
  }
  const ids = Array.from(memberIds);
  return tx<ActiveMuaRow[]>`
    ${ACTIVE_MUA_SELECT(tx)}
    WHERE ${onPlanMuaFilter(tx)}
      AND ${closerInTeam(tx, ids)}
    ORDER BY m.plan_expiry NULLS LAST, m.name
  `;
}

export async function listActiveMuasAdmin(tx: TransactionSql): Promise<ActiveMuaRow[]> {
  return tx<ActiveMuaRow[]>`
    ${ACTIVE_MUA_SELECT(tx)}
    WHERE ${onPlanMuaFilter(tx)}
    ORDER BY m.plan_expiry NULLS LAST, m.name
  `;
}
