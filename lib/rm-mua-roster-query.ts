import { sql, startOfWeekMonday } from "@/db/index";
import { activeBookingSql } from "@/lib/active-bookings";
import { normalizeMua } from "@/lib/db-mappers";
import { REGION_CITIES } from "@/lib/mua-region";
import type { Region, RmMuaRosterItem } from "@/lib/types";

export type RmMuaRosterScope = "region" | "my_plan";

export async function fetchRmMuaRoster(opts: {
  scope: RmMuaRosterScope;
  regions: Region[];
  planRmStaffId?: string;
}): Promise<RmMuaRosterItem[]> {
  const monday = startOfWeekMonday();
  const regions = opts.regions.length ? opts.regions : (["north"] as Region[]);
  const cities = regions.flatMap((r) => REGION_CITIES[r] ?? []);

  if (opts.scope === "my_plan") {
    if (!opts.planRmStaffId) return [];
    const rows = await sql<RmMuaRosterItem[]>`
      SELECT
        m.id,
        m.display_id,
        m.name,
        m.city,
        m.plan_tier AS plan_tier,
        m.plan_expiry,
        COALESCE(p.weekly_cap, 0) AS weekly_cap,
        p.monthly_push_target,
        p.assured_bookings,
        (
          SELECT COUNT(*)::int FROM mua_pushes mp
          WHERE mp.mua_id = m.id AND mp.created_at >= ${monday}
        ) AS weekly_used,
        GREATEST(
          0,
          COALESCE(p.weekly_cap, 0) - (
            SELECT COUNT(*)::int FROM mua_pushes mp
            WHERE mp.mua_id = m.id AND mp.created_at >= ${monday}
          )
        ) AS weekly_remaining,
        (
          SELECT COUNT(*)::int FROM mua_pushes mp
          WHERE mp.mua_id = m.id AND mp.status = 'active'
        ) AS active_conversations,
        (
          SELECT COUNT(*)::int FROM mua_pushes mp
          WHERE mp.mua_id = m.id AND mp.status = 'awaiting_close'
        ) AS awaiting_close,
        (
          SELECT COUNT(*)::int FROM bookings b
          WHERE b.mua_id = m.id AND ${sql.unsafe(activeBookingSql("b"))}
        ) AS total_bookings,
        (
          SELECT COUNT(*)::int FROM mua_pushes mp WHERE mp.mua_id = m.id
        ) AS total_pushes_all_time,
        (
          SELECT MAX(mp.created_at) FROM mua_pushes mp WHERE mp.mua_id = m.id
        ) AS last_pushed
      FROM muas m
      LEFT JOIN plan_tiers p ON p.tier = m.plan_tier
      WHERE m.plan_rm_id = ${opts.planRmStaffId}::uuid
        AND m.plan_tier IS NOT NULL
        AND m.status = 'active'
      ORDER BY p.sort_order NULLS LAST, m.name
    `;
    return rows.map(normalizeMua);
  }

  const rows = await sql<RmMuaRosterItem[]>`
    SELECT
      m.id,
      m.display_id,
      m.name,
      m.city,
      m.plan_tier AS plan_tier,
      m.plan_expiry,
      COALESCE(p.weekly_cap, 0) AS weekly_cap,
      p.monthly_push_target,
      p.assured_bookings,
      (
        SELECT COUNT(*)::int FROM mua_pushes mp
        WHERE mp.mua_id = m.id AND mp.created_at >= ${monday}
      ) AS weekly_used,
      GREATEST(
        0,
        COALESCE(p.weekly_cap, 0) - (
          SELECT COUNT(*)::int FROM mua_pushes mp
          WHERE mp.mua_id = m.id AND mp.created_at >= ${monday}
        )
      ) AS weekly_remaining,
      (
        SELECT COUNT(*)::int FROM mua_pushes mp
        WHERE mp.mua_id = m.id AND mp.status = 'active'
      ) AS active_conversations,
      (
        SELECT COUNT(*)::int FROM mua_pushes mp
        WHERE mp.mua_id = m.id AND mp.status = 'awaiting_close'
      ) AS awaiting_close,
      (
        SELECT COUNT(*)::int FROM bookings b
        WHERE b.mua_id = m.id AND ${sql.unsafe(activeBookingSql("b"))}
      ) AS total_bookings,
      (
        SELECT COUNT(*)::int FROM mua_pushes mp WHERE mp.mua_id = m.id
      ) AS total_pushes_all_time,
      (
        SELECT MAX(mp.created_at) FROM mua_pushes mp WHERE mp.mua_id = m.id
      ) AS last_pushed
    FROM muas m
    LEFT JOIN plan_tiers p ON p.tier = m.plan_tier
    WHERE m.plan_tier IS NOT NULL
      AND m.status = 'active'
      AND (
        EXISTS (
          SELECT 1 FROM mua_regions mr
          WHERE mr.mua_id = m.id AND mr.region = ANY(${regions}::region[])
        )
        OR (
          NOT EXISTS (SELECT 1 FROM mua_regions mr WHERE mr.mua_id = m.id)
          AND (
            m.city = ANY(${cities})
            OR EXISTS (
              SELECT 1 FROM mua_pushes mp
              JOIN bride_leads bl ON bl.id = mp.lead_id
              WHERE mp.mua_id = m.id AND bl.region = ANY(${regions}::region[])
            )
          )
        )
      )
    ORDER BY p.sort_order NULLS LAST, m.name
  `;

  return rows.map(normalizeMua);
}
