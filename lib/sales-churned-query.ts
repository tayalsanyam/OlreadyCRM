import type { TransactionSql } from "@/db/index";
import { WIN_BACK_MUA_PREDICATE } from "@/lib/mua-win-back";
import { MUA_PLAN_RM_NAME_SQL } from "@/lib/mua-contact-sql";

export type ChurnedMuaRow = {
  muaId: string;
  displayId: string | null;
  muaName: string;
  muaCity: string | null;
  muaSource: string | null;
  phone: string | null;
  planExpiry: string | null;
  lastPlan: string | null;
  salesClosedByName: string | null;
  assignedRmName: string | null;
  planRmName: string | null;
  currentSalesRmName: string | null;
  totalBookingRevenue: number;
  daysSincePlanExpiry: number;
  hasActivePipeline: boolean;
};

/** Win-back cohort — expired plan / former customers; optionally only those without an active sales pipeline. */
export async function listChurnedMuas(
  tx: TransactionSql,
  opts: { pendingPipelineOnly?: boolean; city?: string | null; source?: string | null; q?: string | null } = {}
): Promise<ChurnedMuaRow[]> {
  const pendingOnly = opts.pendingPipelineOnly ?? false;
  const qPattern = opts.q ? `%${opts.q}%` : null;

  const rows = await tx<ChurnedMuaRow[]>`
    SELECT
      m.id AS "muaId",
      m.display_id AS "displayId",
      m.name AS "muaName",
      m.city AS "muaCity",
      m.source AS "muaSource",
      COALESCE(NULLIF(m.phone, ''), NULLIF(m.whatsapp, ''), m.alternate_phone) AS phone,
      m.plan_expiry AS "planExpiry",
      COALESCE(
        pt.name,
        NULLIF(REPLACE(m.plan_tier::text, '_', ' '), ''),
        (
          SELECT COALESCE(pt2.name, NULLIF(REPLACE(mph.plan_tier::text, '_', ' '), ''))
          FROM mua_plan_history mph
          LEFT JOIN plan_tiers pt2 ON pt2.tier = mph.plan_tier
          WHERE mph.mua_id = m.id
          ORDER BY mph.assigned_at DESC
          LIMIT 1
        )
      ) AS "lastPlan",
      COALESCE(
        deal_closer_pipe.name,
        deal_closer_mua.name,
        (
          SELECT s.name
          FROM sales.pipeline sp
          JOIN staff s ON s.id = sp.sales_closed_by
          WHERE sp.mua_id = m.id AND sp.sales_closed_by IS NOT NULL
          ORDER BY sp.updated_at DESC
          LIMIT 1
        )
      ) AS "salesClosedByName",
      arm.name AS "assignedRmName",
      ${tx.unsafe(MUA_PLAN_RM_NAME_SQL)} AS "planRmName",
      (
        SELECT s.name
        FROM sales.pipeline sp
        LEFT JOIN staff s ON s.id = sp.assigned_to
        WHERE sp.mua_id = m.id
          AND sp.status = 'active'
          AND sp.stage <> 'Rejected'
        ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
        LIMIT 1
      ) AS "currentSalesRmName",
      COALESCE((
        SELECT SUM(b.booked_price)
        FROM bookings b
        WHERE b.mua_id = m.id AND NOT b.cancelled
      ), 0)::numeric(14,2) AS "totalBookingRevenue",
      GREATEST(
        COALESCE(DATE_PART('day', NOW() - COALESCE(m.plan_expiry, CURRENT_DATE)), 0),
        0
      )::int AS "daysSincePlanExpiry",
      EXISTS (
        SELECT 1 FROM sales.pipeline p
        WHERE p.mua_id = m.id AND p.status = 'active'
      ) AS "hasActivePipeline"
    FROM muas m
    LEFT JOIN plan_tiers pt ON pt.tier = m.plan_tier
    LEFT JOIN staff arm ON arm.id = m.assigned_rm_id
    LEFT JOIN staff deal_closer_mua ON deal_closer_mua.id = m.sales_closed_by
    LEFT JOIN LATERAL (
      SELECT sales_closed_by
      FROM sales.pipeline sp
      WHERE sp.mua_id = m.id
        AND sp.status = 'active'
        AND sp.stage <> 'Rejected'
      ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
      LIMIT 1
    ) canon ON true
    LEFT JOIN staff deal_closer_pipe ON deal_closer_pipe.id = canon.sales_closed_by
    WHERE ${tx.unsafe(WIN_BACK_MUA_PREDICATE)}
      AND (${opts.city || null}::text IS NULL OR m.city = ${opts.city || null})
      AND (${opts.source || null}::text IS NULL OR m.source = ${opts.source || null})
      AND (${pendingOnly}::boolean IS FALSE
        OR NOT EXISTS (
          SELECT 1 FROM sales.pipeline p
          WHERE p.mua_id = m.id AND p.status = 'active'
        ))
      AND (
        ${qPattern}::text IS NULL
        OR m.name ILIKE ${qPattern}
        OR m.city ILIKE ${qPattern}
        OR m.display_id ILIKE ${qPattern}
        OR m.phone ILIKE ${qPattern}
        OR m.whatsapp ILIKE ${qPattern}
      )
    ORDER BY m.plan_expiry DESC NULLS LAST, m.updated_at DESC, m.id
  `;

  const seen = new Set<string>();
  return rows.filter((row: ChurnedMuaRow) => {
    if (seen.has(row.muaId)) return false;
    seen.add(row.muaId);
    return true;
  });
}
