import { sql } from "@/db/index";
import { muaNotOnPlanSql } from "@/lib/mua-active-plan";
import type { AdminPlanTag } from "@/lib/admin-plan-tag";
import type { Region, RmMuaRosterItem } from "@/lib/types";

export type CommissionMuaExpiryFilter =
  | "all"
  | "active"
  | "expiring"
  | "expired"
  | "none";

export type CommissionMuaFilters = {
  regions: Region[];
  regionCities: string[];
  tierDb: string | null;
  availableOnly: boolean;
  monday: Date;
  pageSize: number;
  offset: number;
  search: string | null;
  city: string | null;
  expiry: CommissionMuaExpiryFilter;
  pushedFrom: string | null;
  pushedTo: string | null;
  adminTag: AdminPlanTag | "all" | "untagged";
};

export interface CommissionMuaRow extends RmMuaRosterItem {
  phone: string | null;
  whatsapp: string | null;
  adminPlanTag: AdminPlanTag | null;
  salesPipelineId: string | null;
}

function searchPattern(q: string | null): string | null {
  const trimmed = q?.trim();
  if (!trimmed) return null;
  return `%${trimmed}%`;
}

/** Paginated commission MUA roster — national scope; region is optional filter only. */
export async function fetchCommissionMuasPage(
  filters: CommissionMuaFilters
): Promise<{ rows: CommissionMuaRow[]; total: number }> {
  const {
    regions,
    regionCities,
    tierDb,
    availableOnly,
    monday,
    pageSize,
    offset,
    search,
    city,
    expiry,
    pushedFrom,
    pushedTo,
    adminTag,
  } = filters;

  const regionCount = regions.length;
  const searchLike = searchPattern(search);
  const tagFilter =
    adminTag === "all" ? null : adminTag === "untagged" ? "__untagged__" : adminTag;

  const [countRow] = await sql<{ total: number }[]>`
    SELECT COUNT(*)::int AS total
    FROM muas m
    LEFT JOIN plan_tiers p ON p.tier = m.plan_tier
    WHERE m.status = 'active'
      AND EXISTS (
        SELECT 1 FROM sales.pipeline sp
        WHERE sp.mua_id = m.id
          AND sp.status = 'active'
          AND sp.stage <> 'Rejected'
      )
      AND (
        ${regionCount} = 0
        OR EXISTS (
          SELECT 1 FROM mua_regions mr
          WHERE mr.mua_id = m.id AND mr.region = ANY(${regions}::region[])
        )
        OR (
          NOT EXISTS (SELECT 1 FROM mua_regions mr WHERE mr.mua_id = m.id)
          AND (
            m.city = ANY(${regionCities}::text[])
            OR EXISTS (
              SELECT 1 FROM mua_pushes mp
              JOIN bride_leads bl ON bl.id = mp.lead_id
              WHERE mp.mua_id = m.id AND bl.region = ANY(${regions}::region[])
            )
          )
        )
      )
      AND (${tierDb}::text IS NULL OR m.plan_tier = ${tierDb}::plan_tier)
      AND (
        ${searchLike}::text IS NULL
        OR m.name ILIKE ${searchLike}
        OR m.city ILIKE ${searchLike}
        OR m.phone ILIKE ${searchLike}
        OR m.whatsapp ILIKE ${searchLike}
      )
      AND (${city}::text IS NULL OR TRIM(${city}) = '' OR m.city = ${city})
      AND (
        ${expiry} = 'all'
        OR (${expiry} = 'active' AND m.plan_tier IS NOT NULL AND m.plan_expiry > CURRENT_DATE)
        OR (
          ${expiry} = 'expiring'
          AND m.plan_expiry IS NOT NULL
          AND m.plan_expiry >= CURRENT_DATE
          AND m.plan_expiry <= CURRENT_DATE + 30
        )
        OR (${expiry} = 'expired' AND m.plan_expiry IS NOT NULL AND m.plan_expiry < CURRENT_DATE)
        OR (${expiry} = 'none' AND ${sql.unsafe(muaNotOnPlanSql("m"))})
      )
      AND (
        ${tagFilter}::text IS NULL
        OR (${tagFilter} = '__untagged__' AND m.admin_plan_tag IS NULL)
        OR m.admin_plan_tag = ${tagFilter}
      )
      AND (
        (${pushedFrom}::date IS NULL AND ${pushedTo}::date IS NULL)
        OR EXISTS (
          SELECT 1 FROM mua_pushes mp
          WHERE mp.mua_id = m.id
            AND (${pushedFrom}::date IS NULL OR mp.created_at::date >= ${pushedFrom}::date)
            AND (${pushedTo}::date IS NULL OR mp.created_at::date <= ${pushedTo}::date)
        )
      )
      AND (
        ${availableOnly} = false
        OR (
          COALESCE(p.weekly_cap, 0) > 0
          AND (
            SELECT COUNT(*)::int FROM mua_pushes mp
            WHERE mp.mua_id = m.id AND mp.created_at >= ${monday}
          ) < COALESCE(p.weekly_cap, 0)
        )
      )
  `;

  const rows = await sql<CommissionMuaRow[]>`
    WITH weekly AS (
      SELECT mua_id, COUNT(*)::int AS cnt
      FROM mua_pushes
      WHERE created_at >= ${monday}
      GROUP BY mua_id
    ),
    push_stats AS (
      SELECT
        mua_id,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_conversations,
        COUNT(*) FILTER (WHERE status = 'awaiting_close')::int AS awaiting_close,
        COUNT(*)::int AS total_pushes_all_time,
        MAX(created_at) AS last_pushed
      FROM mua_pushes
      GROUP BY mua_id
    ),
    booking_stats AS (
      SELECT mua_id, COUNT(*)::int AS total_bookings
      FROM bookings
      GROUP BY mua_id
    )
    SELECT
      m.id,
      m.display_id,
      m.name,
      m.city,
      m.phone,
      m.whatsapp,
      m.admin_plan_tag AS "adminPlanTag",
      (
        SELECT sp.id FROM sales.pipeline sp
        WHERE sp.mua_id = m.id AND sp.status = 'active'
        ORDER BY sp.created_at DESC
        LIMIT 1
      ) AS "salesPipelineId",
      m.plan_tier AS plan_tier,
      m.plan_expiry,
      COALESCE(p.weekly_cap, 0) AS weekly_cap,
      COALESCE(w.cnt, 0) AS weekly_used,
      GREATEST(0, COALESCE(p.weekly_cap, 0) - COALESCE(w.cnt, 0)) AS weekly_remaining,
      COALESCE(ps.active_conversations, 0) AS active_conversations,
      COALESCE(ps.awaiting_close, 0) AS awaiting_close,
      COALESCE(bs.total_bookings, 0) AS total_bookings,
      COALESCE(ps.total_pushes_all_time, 0) AS total_pushes_all_time,
      ps.last_pushed
    FROM muas m
    LEFT JOIN plan_tiers p ON p.tier = m.plan_tier
    LEFT JOIN weekly w ON w.mua_id = m.id
    LEFT JOIN push_stats ps ON ps.mua_id = m.id
    LEFT JOIN booking_stats bs ON bs.mua_id = m.id
    WHERE m.status = 'active'
      AND EXISTS (
        SELECT 1 FROM sales.pipeline sp
        WHERE sp.mua_id = m.id
          AND sp.status = 'active'
          AND sp.stage <> 'Rejected'
      )
      AND (
        ${regionCount} = 0
        OR EXISTS (
          SELECT 1 FROM mua_regions mr
          WHERE mr.mua_id = m.id AND mr.region = ANY(${regions}::region[])
        )
        OR (
          NOT EXISTS (SELECT 1 FROM mua_regions mr WHERE mr.mua_id = m.id)
          AND (
            m.city = ANY(${regionCities}::text[])
            OR EXISTS (
              SELECT 1 FROM mua_pushes mp
              JOIN bride_leads bl ON bl.id = mp.lead_id
              WHERE mp.mua_id = m.id AND bl.region = ANY(${regions}::region[])
            )
          )
        )
      )
      AND (${tierDb}::text IS NULL OR m.plan_tier = ${tierDb}::plan_tier)
      AND (
        ${searchLike}::text IS NULL
        OR m.name ILIKE ${searchLike}
        OR m.city ILIKE ${searchLike}
        OR m.phone ILIKE ${searchLike}
        OR m.whatsapp ILIKE ${searchLike}
      )
      AND (${city}::text IS NULL OR TRIM(${city}) = '' OR m.city = ${city})
      AND (
        ${expiry} = 'all'
        OR (${expiry} = 'active' AND m.plan_tier IS NOT NULL AND m.plan_expiry > CURRENT_DATE)
        OR (
          ${expiry} = 'expiring'
          AND m.plan_expiry IS NOT NULL
          AND m.plan_expiry >= CURRENT_DATE
          AND m.plan_expiry <= CURRENT_DATE + 30
        )
        OR (${expiry} = 'expired' AND m.plan_expiry IS NOT NULL AND m.plan_expiry < CURRENT_DATE)
        OR (${expiry} = 'none' AND ${sql.unsafe(muaNotOnPlanSql("m"))})
      )
      AND (
        ${tagFilter}::text IS NULL
        OR (${tagFilter} = '__untagged__' AND m.admin_plan_tag IS NULL)
        OR m.admin_plan_tag = ${tagFilter}
      )
      AND (
        (${pushedFrom}::date IS NULL AND ${pushedTo}::date IS NULL)
        OR EXISTS (
          SELECT 1 FROM mua_pushes mp
          WHERE mp.mua_id = m.id
            AND (${pushedFrom}::date IS NULL OR mp.created_at::date >= ${pushedFrom}::date)
            AND (${pushedTo}::date IS NULL OR mp.created_at::date <= ${pushedTo}::date)
        )
      )
      AND (
        ${availableOnly} = false
        OR (
          COALESCE(p.weekly_cap, 0) > 0
          AND COALESCE(w.cnt, 0) < COALESCE(p.weekly_cap, 0)
        )
      )
    ORDER BY p.sort_order NULLS LAST, m.name
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;

  return { rows, total: countRow?.total ?? 0 };
}
