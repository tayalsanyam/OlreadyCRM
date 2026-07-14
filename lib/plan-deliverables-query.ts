import { sql, startOfWeekMonday } from "@/db/index";
import { activeBookingSql } from "@/lib/active-bookings";
import {
  ADMIN_PLAN_TAG_LABELS,
  parseAdminPlanTag,
  type AdminPlanTag,
} from "@/lib/admin-plan-tag";
import { fromDbPlanTier } from "@/lib/db-mappers";
import {
  MUA_LAST_CONTACT_SQL,
  MUA_LAST_PUSH_SQL,
  MUA_PLAN_RM_NAME_SQL,
  MUA_SALES_RM_NAME_SQL,
} from "@/lib/mua-contact-sql";
import { REGION_CITIES } from "@/lib/mua-region";
import { PLAN_TIER_LABELS, type PlanTier, type Region } from "@/lib/types";

export type PlanDeliverableRow = {
  id: string;
  displayId: string;
  name: string;
  city: string;
  planTier: string | null;
  planTierLabel: string;
  adminPlanTag: AdminPlanTag | null;
  adminPlanTagLabel: string | null;
  planExpiry: string | null;
  planActivatedAt: string | null;
  planRmId: string | null;
  planRmName: string | null;
  regionalRmName: string | null;
  salesRmName: string | null;
  lastContactAt: string | null;
  lastPushedAt: string | null;
  monthlyPushTarget: number | null;
  pushesThisMonth: number;
  totalPushes: number;
  pushesSincePlan: number;
  assuredBookings: number | null;
  totalBookings: number;
  totalBookingRevenue: number;
  weeklyCap: number | null;
  weeklyUsed: number;
  weeklyRemaining: number;
  planExpired: boolean;
  expiringWithin30Days: boolean;
  pushTargetMet: boolean;
  bookingTargetMet: boolean;
};

export async function fetchPlanDeliverables(params: {
  planRmId?: string | null;
  regionalRmId?: string | null;
  search?: string | null;
  planTier?: string | null;
  nearExpiry?: boolean;
  state?: string | null;
  region?: Region | null;
}): Promise<PlanDeliverableRow[]> {
  const monday = startOfWeekMonday();
  const planRmId = params.planRmId ?? null;
  const regionalRmId = params.regionalRmId ?? null;
  const search = params.search?.trim() || null;
  const planTier = params.planTier ?? null;
  const nearExpiry = params.nearExpiry ?? false;
  const state = params.state?.trim() || null;
  const region = params.region ?? null;
  const regionCities =
    region && REGION_CITIES[region] ? REGION_CITIES[region] : [];

  const rows = await sql<
    {
      id: string;
      displayId: string;
      name: string;
      city: string;
      planTier: string | null;
      adminPlanTag: string | null;
      planExpiry: string | null;
      planActivatedAt: string | null;
      planRmId: string | null;
      planRmName: string | null;
      regionalRmName: string | null;
      salesRmName: string | null;
      lastContactAt: string | null;
      lastPushedAt: string | null;
      monthlyPushTarget: number | null;
      pushesThisMonth: number;
      totalPushes: number;
      pushesSincePlan: number;
      assuredBookings: number | null;
      totalBookings: number;
      totalBookingRevenue: number;
      weeklyCap: number | null;
      weeklyUsed: number;
    }[]
  >`
    SELECT
      m.id,
      m.display_id AS "displayId",
      m.name,
      m.city,
      m.plan_tier::text AS "planTier",
      m.admin_plan_tag AS "adminPlanTag",
      m.plan_expiry::text AS "planExpiry",
      (
        SELECT MAX(mph.assigned_at)::text
        FROM mua_plan_history mph
        WHERE mph.mua_id = m.id
          AND mph.plan_tier IS NOT DISTINCT FROM m.plan_tier
      ) AS "planActivatedAt",
      m.plan_rm_id AS "planRmId",
      ${sql.unsafe(MUA_PLAN_RM_NAME_SQL)} AS "planRmName",
      rrm.name AS "regionalRmName",
      ${sql.unsafe(MUA_SALES_RM_NAME_SQL)} AS "salesRmName",
      ${sql.unsafe(MUA_LAST_CONTACT_SQL)} AS "lastContactAt",
      ${sql.unsafe(MUA_LAST_PUSH_SQL)} AS "lastPushedAt",
      pt.monthly_push_target AS "monthlyPushTarget",
      (
        SELECT COUNT(*)::int FROM mua_pushes mp
        WHERE mp.mua_id = m.id
          AND mp.created_at >= date_trunc('month', CURRENT_DATE)
      ) AS "pushesThisMonth",
      (
        SELECT COUNT(*)::int FROM mua_pushes mp WHERE mp.mua_id = m.id
      ) AS "totalPushes",
      (
        SELECT COUNT(*)::int FROM mua_pushes mp
        WHERE mp.mua_id = m.id
          AND mp.created_at >= COALESCE(
            (
              SELECT MAX(mph.assigned_at)
              FROM mua_plan_history mph
              WHERE mph.mua_id = m.id
                AND mph.plan_tier IS NOT DISTINCT FROM m.plan_tier
            ),
            m.created_at
          )
      ) AS "pushesSincePlan",
      pt.assured_bookings AS "assuredBookings",
      (
        SELECT COUNT(*)::int FROM bookings b
        WHERE b.mua_id = m.id AND ${sql.unsafe(activeBookingSql("b"))}
      ) AS "totalBookings",
      (
        SELECT COALESCE(SUM(b.booked_price), 0)::float FROM bookings b
        WHERE b.mua_id = m.id AND ${sql.unsafe(activeBookingSql("b"))}
      ) AS "totalBookingRevenue",
      pt.weekly_cap AS "weeklyCap",
      (
        SELECT COUNT(*)::int FROM mua_pushes mp
        WHERE mp.mua_id = m.id AND mp.created_at >= ${monday}
      ) AS "weeklyUsed"
    FROM muas m
    LEFT JOIN plan_tiers pt ON pt.tier = m.plan_tier
    LEFT JOIN staff rrm ON rrm.id = m.assigned_rm_id
    WHERE m.status = 'active'
      AND m.plan_tier IS NOT NULL
      AND (${planRmId}::uuid IS NULL OR m.plan_rm_id = ${planRmId}::uuid)
      AND (${regionalRmId}::uuid IS NULL OR m.assigned_rm_id = ${regionalRmId}::uuid)
      AND (${planTier}::text IS NULL OR m.plan_tier::text = ${planTier})
      AND (
        ${nearExpiry}::boolean = false
        OR (
          m.plan_expiry IS NOT NULL
          AND m.plan_expiry >= CURRENT_DATE
          AND m.plan_expiry <= CURRENT_DATE + INTERVAL '30 days'
        )
      )
      AND (
        ${search}::text IS NULL
        OR m.name ILIKE ${search ? `%${search}%` : null}
        OR m.display_id ILIKE ${search ? `%${search}%` : null}
      )
      AND (
        ${state}::text IS NULL
        OR ${state} = ANY(m.plan_states)
        OR EXISTS (
          SELECT 1 FROM city_regions cr
          WHERE cr.city = m.city AND cr.state = ${state}
        )
      )
      AND (
        ${region}::text IS NULL
        OR EXISTS (
          SELECT 1 FROM mua_regions mr
          WHERE mr.mua_id = m.id AND mr.region = ${region}::region
        )
        OR (
          NOT EXISTS (SELECT 1 FROM mua_regions mr WHERE mr.mua_id = m.id)
          AND m.city = ANY(${regionCities}::text[])
        )
      )
    ORDER BY
      (m.plan_expiry IS NOT NULL AND m.plan_expiry < CURRENT_DATE) DESC,
      (m.plan_expiry IS NOT NULL AND m.plan_expiry <= CURRENT_DATE + INTERVAL '30 days') DESC,
      pt.sort_order NULLS LAST,
      m.name
  `;

  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const in30Str = in30.toISOString().slice(0, 10);

  return rows.map((r) => {
    const tierKey = r.planTier ? fromDbPlanTier(r.planTier) : null;
    const planTierLabel =
      tierKey && PLAN_TIER_LABELS[tierKey as PlanTier]
        ? PLAN_TIER_LABELS[tierKey as PlanTier]
        : r.planTier ?? "—";
    const adminPlanTag = parseAdminPlanTag(r.adminPlanTag);
    const adminPlanTagLabel = adminPlanTag
      ? ADMIN_PLAN_TAG_LABELS[adminPlanTag]
      : null;
    const weeklyCap = r.weeklyCap ?? 0;
    const weeklyUsed = r.weeklyUsed ?? 0;
    const monthlyTarget = r.monthlyPushTarget ?? 0;
    const pushesThisMonth = r.pushesThisMonth ?? 0;
    const assured = r.assuredBookings ?? 0;
    const totalBookings = r.totalBookings ?? 0;
    const planExpired = r.planExpiry != null && r.planExpiry < today;
    const expiringWithin30Days =
      r.planExpiry != null &&
      r.planExpiry >= today &&
      r.planExpiry <= in30Str;

    return {
      id: r.id,
      displayId: r.displayId,
      name: r.name,
      city: r.city,
      planTier: r.planTier,
      planTierLabel,
      adminPlanTag,
      adminPlanTagLabel,
      planExpiry: r.planExpiry,
      planActivatedAt: r.planActivatedAt,
      planRmId: r.planRmId,
      planRmName: r.planRmName,
      regionalRmName: r.regionalRmName,
      salesRmName: r.salesRmName,
      lastContactAt: r.lastContactAt,
      lastPushedAt: r.lastPushedAt,
      monthlyPushTarget: r.monthlyPushTarget,
      pushesThisMonth,
      totalPushes: r.totalPushes ?? 0,
      pushesSincePlan: r.pushesSincePlan ?? 0,
      assuredBookings: r.assuredBookings,
      totalBookings,
      totalBookingRevenue: Number(r.totalBookingRevenue ?? 0),
      weeklyCap: r.weeklyCap,
      weeklyUsed,
      weeklyRemaining: Math.max(0, weeklyCap - weeklyUsed),
      planExpired,
      expiringWithin30Days,
      pushTargetMet: monthlyTarget > 0 ? pushesThisMonth >= monthlyTarget : pushesThisMonth > 0,
      bookingTargetMet: assured > 0 ? totalBookings >= assured : totalBookings > 0,
    };
  });
}
