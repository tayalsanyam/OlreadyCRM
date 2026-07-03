import { sql, startOfWeekMonday } from "@/db/index";
import { effectiveWeeklyCap } from "@/lib/mua-weekly-cap";
import { DEFAULT_PER_LEAD_CAP, COMMISSION_NON_PLAN_WEEKLY_CAP } from "@/lib/sla-defaults";
import {
  adminPlanTagSortKey,
  parseAdminPlanTag,
  type AdminPlanTag,
} from "@/lib/admin-plan-tag";
import { citiesForRegions, muaMatchesRegion } from "@/lib/mua-region";
import { fromDbPushStage, fromDbPushStatus } from "@/lib/db-mappers";
import {
  PLAN_TIER_LABELS,
  type MuaPushStage,
  type MuaPushStatus,
  type PlanTier,
  type Region,
} from "@/lib/types";
import { isMuaAvailableToPush } from "@/lib/mua-push-availability";

const TIER_ORDER: Record<string, number> = {
  highest_privy: 1,
  highestPrivy: 1,
  phoenix_2: 2,
  phoenix2: 2,
  phoenix: 3,
  pro: 4,
  prime: 5,
};

export interface AvailableMuaRow {
  id: string;
  displayId: string;
  name: string;
  city: string;
  planTier: string | null;
  planExpiry: string | null;
  region: Region | null;
  weeklyCap: number;
  weeklyUsed: number;
  atWeeklyCap: boolean;
  adminPlanTag: AdminPlanTag | null;
  leadActiveCount?: number;
  perLeadCap?: number;
  /** Latest push of this MUA on the requested lead, if any */
  leadPushId?: string | null;
  leadPushStatus?: MuaPushStatus | null;
  leadPushStage?: MuaPushStage | null;
  leadPushEventLabels?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
}

export type FetchAvailableMuasOptions = {
  /** Fallback when no ceremony regions (session / lead). */
  rmRegion?: Region | null;
  /** Regions for selected ceremonies — filters MUAs serving any of these regions. */
  ceremonyRegions?: Region[];
};

export async function fetchAvailableMuas(
  leadId: string,
  commissionMode: boolean,
  options: FetchAvailableMuasOptions = {}
): Promise<AvailableMuaRow[]> {
  const monday = startOfWeekMonday();
  const ceremonyRegions = options.ceremonyRegions ?? [];
  const filterRegions = commissionMode
    ? []
    : ceremonyRegions.length > 0
      ? ceremonyRegions
      : options.rmRegion
        ? [options.rmRegion]
        : [];

  const cities =
    filterRegions.length > 0 ? citiesForRegions(filterRegions) : [];

  const [sla] = await sql<{ perLeadCap: number }[]>`
    SELECT per_lead_cap FROM sla_config WHERE id = 1
  `;
  const perLeadCap = sla?.perLeadCap ?? DEFAULT_PER_LEAD_CAP;

  const [leadActive] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM mua_pushes
    WHERE lead_id = ${leadId}::uuid AND status NOT IN ('closed', 'booked')
  `;

  const rows = await sql<
    {
      id: string;
      displayId: string;
      name: string;
      city: string;
      planTier: string | null;
      planExpiry: string | null;
      region: string | null;
      weeklyCap: number | null;
      weeklyCapOverride: number | null;
      weeklyCapBonus: number;
      weeklyUsed: number;
      adminPlanTag: string | null;
      leadPushId: string | null;
      leadPushStatus: string | null;
      leadPushStage: string | null;
      leadPushEventLabels: string | null;
      muaPhone: string | null;
      muaWhatsapp: string | null;
    }[]
  >`
    SELECT
      m.id,
      m.display_id,
      m.name,
      m.city,
      m.phone AS mua_phone,
      m.whatsapp AS mua_whatsapp,
      m.plan_tier,
      m.plan_expiry,
      m.admin_plan_tag AS "adminPlanTag",
      (
        SELECT mr.region::text FROM mua_regions mr
        WHERE mr.mua_id = m.id
        ORDER BY mr.region
        LIMIT 1
      ) AS region,
      p.weekly_cap AS "weeklyCap",
      m.weekly_cap_override AS "weeklyCapOverride",
      COALESCE(m.weekly_cap_bonus, 0) AS "weeklyCapBonus",
      (
        SELECT COUNT(*)::int FROM mua_pushes mp
        WHERE mp.mua_id = m.id AND mp.created_at >= ${monday}
      ) AS weekly_used,
      lp.push_id AS "leadPushId",
      lp.push_status AS "leadPushStatus",
      lp.push_stage AS "leadPushStage",
      lp.event_labels AS "leadPushEventLabels"
    FROM muas m
    LEFT JOIN plan_tiers p ON p.tier = m.plan_tier
    LEFT JOIN LATERAL (
      SELECT
        mp.id AS push_id,
        mp.status::text AS push_status,
        mp.stage::text AS push_stage,
        (
          SELECT string_agg(le.ceremony_type, ', ' ORDER BY le.ceremony_type)
          FROM lead_events le
          WHERE le.id = ANY(mp.event_ids)
        ) AS event_labels
      FROM mua_pushes mp
      WHERE mp.lead_id = ${leadId}::uuid AND mp.mua_id = m.id
      ORDER BY mp.created_at DESC
      LIMIT 1
    ) lp ON true
    WHERE m.status = 'active'
      AND (m.admin_plan_tag IS NULL OR m.admin_plan_tag <> 'hold')
      AND (
        ${commissionMode} = true AND (
          EXISTS (
            SELECT 1 FROM sales.pipeline p
            WHERE p.mua_id = m.id
              AND p.status = 'active'
              AND p.stage <> 'Rejected'
          )
          OR EXISTS (
            SELECT 1 FROM mua_pushes mp
            WHERE mp.lead_id = ${leadId}::uuid
              AND mp.mua_id = m.id
              AND mp.status NOT IN ('closed', 'booked')
          )
        )
        OR (${commissionMode} = false AND (
          m.plan_tier IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM mua_pushes mp
            WHERE mp.lead_id = ${leadId}::uuid
              AND mp.mua_id = m.id
              AND mp.status NOT IN ('closed', 'booked')
          )
        ))
      )
      AND (
        ${filterRegions.length === 0}
        OR EXISTS (
          SELECT 1 FROM mua_regions mr
          WHERE mr.mua_id = m.id
            AND mr.region = ANY(${sql.array(filterRegions)}::region[])
        )
        OR (
          NOT EXISTS (SELECT 1 FROM mua_regions mr WHERE mr.mua_id = m.id)
          AND (
            m.city = ANY(${cities})
            OR EXISTS (
              SELECT 1 FROM mua_pushes mp
              JOIN bride_leads bl ON bl.id = mp.lead_id
              WHERE mp.mua_id = m.id
                AND bl.region = ANY(${sql.array(filterRegions)}::region[])
            )
          )
        )
      )
    ORDER BY p.sort_order NULLS LAST, m.name
  `;

  return rows
    .map((m) => {
      const weeklyCap = effectiveWeeklyCap(
        m.weeklyCap ?? 0,
        m.weeklyCapOverride,
        m.weeklyCapBonus,
      ) || (commissionMode ? COMMISSION_NON_PLAN_WEEKLY_CAP : 0);
      const weeklyUsed = m.weeklyUsed ?? 0;
      const tag = parseAdminPlanTag(m.adminPlanTag);
      const leadPushStatus = m.leadPushStatus
        ? fromDbPushStatus(m.leadPushStatus)
        : null;
      return {
        id: m.id,
        displayId: m.displayId,
        name: m.name,
        city: m.city,
        planTier: m.planTier,
        planExpiry: m.planExpiry ?? null,
        region: (m.region as Region | null) ?? null,
        weeklyCap,
        weeklyUsed,
        atWeeklyCap: weeklyCap > 0 && weeklyUsed >= weeklyCap,
        adminPlanTag: tag,
        leadActiveCount: leadActive?.count ?? 0,
        perLeadCap,
        leadPushId: m.leadPushId ?? null,
        leadPushStatus,
        leadPushStage: m.leadPushStage ? fromDbPushStage(m.leadPushStage) : null,
        leadPushEventLabels: m.leadPushEventLabels ?? null,
        phone: m.muaPhone ?? null,
        whatsapp: m.muaWhatsapp ?? null,
      };
    })
    .sort((a, b) => {
      const availDiff =
        Number(isMuaAvailableToPush(b)) - Number(isMuaAvailableToPush(a));
      if (availDiff !== 0) return availDiff;
      const tagDiff =
        adminPlanTagSortKey(a.adminPlanTag) - adminPlanTagSortKey(b.adminPlanTag);
      if (tagDiff !== 0) return tagDiff;
      const ao = a.planTier ? TIER_ORDER[a.planTier] ?? 99 : 100;
      const bo = b.planTier ? TIER_ORDER[b.planTier] ?? 99 : 100;
      return ao - bo;
    }) as AvailableMuaRow[];
}

/** Client/mock filter: MUA visible if it matches any target region. */
export function filterMuasByRegions<T extends { city: string; regions?: Region[] | null }>(
  muas: T[],
  regions: Region[],
  hasPushInRegion?: (muaId: string, region: Region) => boolean
): T[] {
  if (!regions.length) return muas;
  return muas.filter((m) =>
    regions.some((r) =>
      muaMatchesRegion(
        { regions: m.regions ?? undefined, city: m.city },
        r,
        hasPushInRegion?.((m as { id?: string }).id ?? "", r)
      )
    )
  );
}

export function planTierLabel(tier: string | null): string {
  if (!tier) return "Non-plan";
  const camel = tier.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()) as PlanTier;
  return PLAN_TIER_LABELS[camel] ?? tier;
}
