import type { AdminMuaListItem } from "@/lib/admin-mua-list-item";
import {
  buildAdminMuaSearchPattern,
  deriveAdminMuaSegment,
  type AdminMuaListFilters,
  type AdminMuaSortBy,
  type AdminMuaSortDir,
} from "@/lib/admin-muas-query";
import { parseAdminPlanTag } from "@/lib/admin-plan-tag";
import { startOfWeekMonday, type Sql } from "@/db/index";
import { normalizeMua, toDbPlanTier } from "@/lib/db-mappers";
import { fetchRegionsByMuaIds } from "@/lib/mua-regions-db";
import { citiesForRegions } from "@/lib/mua-region";
import { WIN_BACK_MUA_PREDICATE } from "@/lib/mua-win-back";
import { muaNotOnPlanSql } from "@/lib/mua-active-plan";
import { MUA_PLAN_RM_NAME_SQL } from "@/lib/mua-contact-sql";

export type AdminMuaListPage = {
  items: AdminMuaListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  meta: {
    onPlan: number;
    expiring: number;
    needsSalesRm: number;
    missingPipeline: number;
  };
};

type MuaRow = AdminMuaListItem & {
  weeklyCap: number;
  planWeeklyCap: number;
  weeklyCapOverride: number | null;
  weeklyCapBonus: number;
  weeklyUsed: number;
  totalBookingRevenue: number;
  totalBookings: number;
  totalPushes: number;
  bookingsSincePlanStart: number;
  pushesSincePlanStart: number;
  assuredBookings: number | null;
  monthlyPushTarget: number | null;
  hasPlanHistory: boolean;
  salesRmName: string | null;
  assignedRmName: string | null;
  planRmName: string | null;
  salesPipelineId: string | null;
  salesRmId: string | null;
  salesPipelineStage: string | null;
  salesPipelineMuaType: string | null;
  daysUnassigned: number | null;
  daysSinceStageUpdate: number | null;
  hasActiveSalesPipeline: boolean;
  hasRejectedSalesPipeline: boolean;
  rejectedPipelineId: string | null;
  rejectionReason: string | null;
  rejectionNote: string | null;
  adminPlanTag: string | null;
  leadCap: number | null;
  leadBudget: string | null;
  planStates: string[];
  planCities: string[];
};

const CANONICAL_PIPELINE_ORDER = `
  ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
  LIMIT 1
`;

function adminMuaOrderBySql(sortBy: AdminMuaSortBy, sortDir: AdminMuaSortDir): string {
  const dir = sortDir === "desc" ? "DESC" : "ASC";
  const nulls = sortDir === "desc" ? "NULLS LAST" : "NULLS FIRST";
  if (sortBy === "daysUnassigned") {
    return `(
      SELECT CASE
        WHEN sp.assigned_to IS NULL THEN DATE_PART('day', NOW() - sp.created_at)::int
      END
      FROM sales.pipeline sp
      WHERE sp.mua_id = m.id
        AND sp.status = 'active'
        AND sp.stage <> 'Rejected'
      ${CANONICAL_PIPELINE_ORDER}
    ) ${dir} ${nulls}, m.name ASC, m.id`;
  }
  if (sortBy === "daysSinceUpdate") {
    return `(
      SELECT DATE_PART('day', NOW() - sp.updated_at)::int
      FROM sales.pipeline sp
      WHERE sp.mua_id = m.id
        AND sp.status = 'active'
        AND sp.stage <> 'Rejected'
      ${CANONICAL_PIPELINE_ORDER}
    ) ${dir} ${nulls}, m.name ASC, m.id`;
  }
  return `m.name ${dir}, m.id`;
}

function mapRows(
  muas: MuaRow[],
  regionMap: Map<string, import("@/lib/types").Region[]>,
): AdminMuaListItem[] {
  return muas.map((m) => {
    const hasPlanHistory = Boolean(m.hasPlanHistory);
    const normalized = normalizeMua({
      ...m,
      regions: regionMap.get(m.id) ?? [],
      services: m.services ?? [],
    });
    return {
      ...normalized,
      weeklyCap: Number(m.weeklyCap ?? 0),
      baseWeeklyCap: Number(m.planWeeklyCap ?? 0),
      weeklyCapOverride:
        m.weeklyCapOverride != null ? Number(m.weeklyCapOverride) : null,
      weeklyCapBonus: Number(m.weeklyCapBonus ?? 0),
      weeklyUsed: Number(m.weeklyUsed ?? 0),
      totalBookingRevenue: Number(m.totalBookingRevenue ?? 0),
      totalBookings: Number(m.totalBookings ?? 0),
      totalPushes: Number(m.totalPushes ?? 0),
      bookingsSincePlanStart: Number(m.bookingsSincePlanStart ?? 0),
      pushesSincePlanStart: Number(m.pushesSincePlanStart ?? 0),
      assuredBookings: m.assuredBookings != null ? Number(m.assuredBookings) : null,
      monthlyPushTarget:
        m.monthlyPushTarget != null ? Number(m.monthlyPushTarget) : null,
      hasPlanHistory,
      salesRmName: m.salesRmName ?? null,
      salesRmId: m.salesRmId ?? null,
      salesPipelineStage: m.salesPipelineStage ?? null,
      salesPipelineMuaType: m.salesPipelineMuaType ?? null,
      daysUnassigned: m.daysUnassigned != null ? Number(m.daysUnassigned) : null,
      daysSinceStageUpdate:
        m.daysSinceStageUpdate != null ? Number(m.daysSinceStageUpdate) : null,
      assignedRmName: m.assignedRmName ?? null,
      planRmName: m.planRmName ?? null,
      salesPipelineId: m.salesPipelineId ?? null,
      hasActiveSalesPipeline: Boolean(m.hasActiveSalesPipeline),
      hasRejectedSalesPipeline: Boolean(m.hasRejectedSalesPipeline),
      rejectedPipelineId: m.rejectedPipelineId ?? null,
      rejectionReason: m.rejectionReason ?? null,
      rejectionNote: m.rejectionNote ?? null,
      adminPlanTag: parseAdminPlanTag(m.adminPlanTag),
      leadCap: m.leadCap != null ? Number(m.leadCap) : null,
      leadBudget: m.leadBudget ?? null,
      planStates: m.planStates ?? [],
      planCities: m.planCities ?? [],
      segment: deriveAdminMuaSegment({
        planTier: normalized.planTier,
        planExpiry: normalized.planExpiry,
        hasPlanHistory,
      }),
    } satisfies AdminMuaListItem;
  });
}

export async function fetchAdminMuaListPage(
  db: Sql,
  filters: AdminMuaListFilters,
): Promise<AdminMuaListPage> {
  const { like, flexLike, phoneMatch } = buildAdminMuaSearchPattern(filters.q);
  const monday = startOfWeekMonday();
  const offset = (filters.page - 1) * filters.pageSize;
  const dbTiers = filters.tiers.map((t) => toDbPlanTier(t)).filter(Boolean) as string[];
  const regionCities =
    filters.regions.length > 0 ? citiesForRegions(filters.regions) : [];
  const planRmUuid =
    filters.planRm && filters.planRm !== "none" ? filters.planRm : null;
  const filterPlanRmNone = filters.planRm === "none";
  const filterPlanRmAny = filters.planRm === null;
  const pipelineStage = filters.pipelineStage;

  const [statsRow] = await db<
    {
      onPlan: number;
      expiring: number;
      needsSalesRm: number;
      missingPipeline: number;
    }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE plan_tier IS NOT NULL)::int AS "onPlan",
      COUNT(*) FILTER (
        WHERE plan_expiry IS NOT NULL
          AND plan_expiry >= CURRENT_DATE
          AND plan_expiry <= CURRENT_DATE + INTERVAL '30 days'
      )::int AS "expiring",
      COUNT(*) FILTER (
        WHERE status = 'active'
          AND EXISTS (
            SELECT 1 FROM sales.pipeline sp
            WHERE sp.mua_id = muas.id
              AND sp.status = 'active'
              AND sp.stage <> 'Rejected'
          )
          AND (
            SELECT sp.assigned_to
            FROM sales.pipeline sp
            WHERE sp.mua_id = muas.id
              AND sp.status = 'active'
              AND sp.stage <> 'Rejected'
            ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
            LIMIT 1
          ) IS NULL
      )::int AS "needsSalesRm",
      COUNT(*) FILTER (
        WHERE status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM sales.pipeline sp
            WHERE sp.mua_id = muas.id
              AND sp.status = 'active'
          )
      )::int AS "missingPipeline"
    FROM muas
  `;

  const [countRow] = await db<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM muas m
    WHERE
      (${like}::text IS NULL OR (
        m.name ILIKE ${like}
        OR (${flexLike}::text IS NOT NULL AND m.name ILIKE ${flexLike})
        OR m.city ILIKE ${like}
        OR m.display_id ILIKE ${like}
        OR (
          ${phoneMatch}::text IS NOT NULL
          AND (
            m.phone ILIKE ${phoneMatch}
            OR m.whatsapp ILIKE ${phoneMatch}
            OR m.alternate_phone ILIKE ${phoneMatch}
          )
        )
        OR (m.admin_plan_tag = 'hold' AND 'hold' ILIKE ${like})
        OR (
          m.admin_plan_tag = 'high_priority'
          AND ('high' ILIKE ${like} OR 'priority' ILIKE ${like})
        )
        OR (
          m.admin_plan_tag = 'low_priority'
          AND ('low' ILIKE ${like} OR 'priority' ILIKE ${like})
        )
      ))
      AND (
        ${filters.segment}::text = 'all'
        OR (
          ${filters.segment}::text = 'plan_customer'
          AND m.plan_tier IS NOT NULL
          AND (m.plan_expiry IS NULL OR m.plan_expiry >= CURRENT_DATE)
        )
        OR (
          ${filters.segment}::text = 'customer'
          AND (
            m.plan_tier IS NOT NULL
            OR EXISTS (SELECT 1 FROM mua_plan_history mph WHERE mph.mua_id = m.id)
          )
        )
        OR (
          ${filters.segment}::text = 'potential'
          AND NOT EXISTS (SELECT 1 FROM mua_plan_history mph WHERE mph.mua_id = m.id)
          AND (m.plan_tier IS NULL OR m.plan_expiry < CURRENT_DATE)
        )
      )
      AND (
        ${filters.tag}::text = 'all'
        OR m.admin_plan_tag = ${filters.tag}::text
      )
      AND (
        ${filters.rosterStatus}::text = 'all'
        OR m.status = ${filters.rosterStatus}::text
      )
      AND (
        ${filters.winBack}::boolean IS FALSE
        OR ${db.unsafe(WIN_BACK_MUA_PREDICATE)}
      )
      AND (
        ${dbTiers.length === 0}
        OR m.plan_tier = ANY(${dbTiers}::plan_tier[])
      )
      AND (
        ${filters.expiryStatus}::text = 'all'
        OR (
          ${filters.expiryStatus}::text = 'active'
          AND m.plan_tier IS NOT NULL
          AND (m.plan_expiry IS NULL OR m.plan_expiry >= CURRENT_DATE)
        )
        OR (
          ${filters.expiryStatus}::text = 'expiring'
          AND m.plan_expiry IS NOT NULL
          AND m.plan_expiry >= CURRENT_DATE
          AND m.plan_expiry <= CURRENT_DATE + INTERVAL '30 days'
        )
        OR (
          ${filters.expiryStatus}::text = 'expired'
          AND m.plan_expiry IS NOT NULL
          AND m.plan_expiry < CURRENT_DATE
        )
        OR (
          ${filters.expiryStatus}::text = 'none'
          AND ${db.unsafe(muaNotOnPlanSql("m"))}
        )
      )
      AND (
        ${filters.regions.length === 0}
        OR EXISTS (
          SELECT 1 FROM mua_regions mr
          WHERE mr.mua_id = m.id
            AND mr.region = ANY(${filters.regions}::region[])
        )
        OR (
          NOT EXISTS (SELECT 1 FROM mua_regions mr WHERE mr.mua_id = m.id)
          AND m.city = ANY(${regionCities}::text[])
        )
      )
      AND (
        ${filters.addedDateBasis}::text IS NULL
        OR (
          ${filters.addedDateBasis}::text = 'created'
          AND (${filters.addedFrom}::date IS NULL OR m.created_at::date >= ${filters.addedFrom}::date)
          AND (${filters.addedTo}::date IS NULL OR m.created_at::date <= ${filters.addedTo}::date)
        )
        OR (
          ${filters.addedDateBasis}::text = 'joined'
          AND (${filters.addedFrom}::date IS NULL OR m.join_date >= ${filters.addedFrom}::date)
          AND (${filters.addedTo}::date IS NULL OR m.join_date <= ${filters.addedTo}::date)
        )
      )
      AND (
        ${filterPlanRmAny}
        OR (${filterPlanRmNone} AND m.plan_rm_id IS NULL)
        OR (${planRmUuid}::uuid IS NOT NULL AND m.plan_rm_id = ${planRmUuid}::uuid)
      )
      AND (
        ${filters.salesRmStaffId}::uuid IS NULL
        OR (
          SELECT sp.assigned_to
          FROM sales.pipeline sp
          WHERE sp.mua_id = m.id
            AND sp.status = 'active'
            AND sp.stage <> 'Rejected'
          ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
          LIMIT 1
        ) = ${filters.salesRmStaffId}::uuid
      )
      AND (
        ${filters.dealClosedSalesRmStaffId}::uuid IS NULL
        OR COALESCE(
          (
            SELECT sp.sales_closed_by
            FROM sales.pipeline sp
            WHERE sp.mua_id = m.id
              AND sp.status = 'active'
              AND sp.stage <> 'Rejected'
            ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
            LIMIT 1
          ),
          m.sales_closed_by
        ) = ${filters.dealClosedSalesRmStaffId}::uuid
      )
      AND (
        ${filters.salesRm}::text = 'all'
        OR ${filters.salesRmStaffId}::uuid IS NOT NULL
        OR (
          ${filters.salesRm}::text = 'assigned'
          AND (
            SELECT sp.assigned_to IS NOT NULL
            FROM sales.pipeline sp
            WHERE sp.mua_id = m.id
              AND sp.status = 'active'
              AND sp.stage <> 'Rejected'
            ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
            LIMIT 1
          ) IS TRUE
        )
        OR (
          ${filters.salesRm}::text = 'unassigned'
          AND m.status = 'active'
          AND EXISTS (
            SELECT 1 FROM sales.pipeline sp
            WHERE sp.mua_id = m.id
              AND sp.status = 'active'
              AND sp.stage <> 'Rejected'
          )
          AND (
            SELECT sp.assigned_to
            FROM sales.pipeline sp
            WHERE sp.mua_id = m.id
              AND sp.status = 'active'
              AND sp.stage <> 'Rejected'
            ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
            LIMIT 1
          ) IS NULL
        )
      )
      AND (
        ${filters.pipeline}::text = 'all'
        OR (
          ${filters.pipeline}::text = 'has'
          AND EXISTS (
            SELECT 1 FROM sales.pipeline sp
            WHERE sp.mua_id = m.id
              AND sp.status = 'active'
          )
        )
        OR (
          ${filters.pipeline}::text = 'missing'
          AND m.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM sales.pipeline sp
            WHERE sp.mua_id = m.id
              AND sp.status = 'active'
          )
        )
      )
      AND (
        ${filters.teamId}::uuid IS NULL
        OR m.team_id = ${filters.teamId}::uuid
        OR (
          SELECT s.team_id
          FROM sales.pipeline sp
          JOIN staff s ON s.id = sp.assigned_to
          WHERE sp.mua_id = m.id
            AND sp.status = 'active'
            AND sp.stage <> 'Rejected'
          ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
          LIMIT 1
        ) = ${filters.teamId}::uuid
      )
      AND (
        ${filters.state}::text IS NULL
        OR ${filters.state} = ANY(m.plan_states)
        OR EXISTS (
          SELECT 1 FROM city_regions cr
          WHERE cr.city = m.city AND cr.state = ${filters.state}
        )
      )
      AND (
        ${pipelineStage}::text IS NULL
        OR (
          SELECT sp.stage::text
          FROM sales.pipeline sp
          WHERE sp.mua_id = m.id
            AND sp.status = 'active'
            AND sp.stage <> 'Rejected'
          ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
          LIMIT 1
        ) = ${pipelineStage}::text
      )
  `;

  const total = countRow?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize) || 1);

  const muas = await db<MuaRow[]>`
    SELECT
      m.*,
      COALESCE(p.weekly_cap, 0) AS plan_weekly_cap,
      COALESCE(m.weekly_cap_override, p.weekly_cap, 0) + COALESCE(m.weekly_cap_bonus, 0) AS weekly_cap,
      m.weekly_cap_override,
      COALESCE(m.weekly_cap_bonus, 0) AS weekly_cap_bonus,
      m.admin_plan_tag,
      m.lead_cap,
      m.lead_budget,
      m.plan_states,
      m.plan_cities,
      COALESCE(p.assured_bookings, 0) AS assured_bookings,
      COALESCE(p.monthly_push_target, 0) AS monthly_push_target,
      (
        SELECT sp.id
        FROM sales.pipeline sp
        WHERE sp.mua_id = m.id
          AND sp.status = 'active'
          AND sp.stage <> 'Rejected'
        ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
        LIMIT 1
      ) AS sales_pipeline_id,
      (
        SELECT s.name
        FROM sales.pipeline sp
        LEFT JOIN staff s ON s.id = sp.assigned_to
        WHERE sp.mua_id = m.id
          AND sp.status = 'active'
          AND sp.stage <> 'Rejected'
        ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
        LIMIT 1
      ) AS sales_rm_name,
      (
        SELECT sp.assigned_to
        FROM sales.pipeline sp
        WHERE sp.mua_id = m.id
          AND sp.status = 'active'
          AND sp.stage <> 'Rejected'
        ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
        LIMIT 1
      ) AS sales_rm_id,
      (
        SELECT sp.stage::text
        FROM sales.pipeline sp
        WHERE sp.mua_id = m.id
          AND sp.status = 'active'
          AND sp.stage <> 'Rejected'
        ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
        LIMIT 1
      ) AS sales_pipeline_stage,
      (
        SELECT sp.mua_type::text
        FROM sales.pipeline sp
        WHERE sp.mua_id = m.id
          AND sp.status = 'active'
          AND sp.stage <> 'Rejected'
        ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
        LIMIT 1
      ) AS sales_pipeline_mua_type,
      (
        SELECT CASE
          WHEN sp.assigned_to IS NULL THEN DATE_PART('day', NOW() - sp.created_at)::int
        END
        FROM sales.pipeline sp
        WHERE sp.mua_id = m.id
          AND sp.status = 'active'
          AND sp.stage <> 'Rejected'
        ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
        LIMIT 1
      ) AS days_unassigned,
      (
        SELECT DATE_PART('day', NOW() - sp.updated_at)::int
        FROM sales.pipeline sp
        WHERE sp.mua_id = m.id
          AND sp.status = 'active'
          AND sp.stage <> 'Rejected'
        ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
        LIMIT 1
      ) AS days_since_stage_update,
      arm.name AS assigned_rm_name,
      ${db.unsafe(MUA_PLAN_RM_NAME_SQL)} AS plan_rm_name,
      EXISTS (
        SELECT 1 FROM sales.pipeline sp
        WHERE sp.mua_id = m.id
          AND sp.status = 'active'
      ) AS has_active_sales_pipeline,
      EXISTS (
        SELECT 1 FROM sales.pipeline sp
        WHERE sp.mua_id = m.id
          AND sp.status = 'active'
          AND sp.stage = 'Rejected'
      ) AS has_rejected_sales_pipeline,
      (
        SELECT sp.id
        FROM sales.pipeline sp
        WHERE sp.mua_id = m.id
          AND sp.status = 'active'
          AND sp.stage = 'Rejected'
        ORDER BY sp.rejected_at DESC NULLS LAST, sp.updated_at DESC
        LIMIT 1
      ) AS rejected_pipeline_id,
      (
        SELECT sp.rejection_reason
        FROM sales.pipeline sp
        WHERE sp.mua_id = m.id
          AND sp.status = 'active'
          AND sp.stage = 'Rejected'
        ORDER BY sp.rejected_at DESC NULLS LAST, sp.updated_at DESC
        LIMIT 1
      ) AS rejection_reason,
      (
        SELECT sp.rejection_note
        FROM sales.pipeline sp
        WHERE sp.mua_id = m.id
          AND sp.status = 'active'
          AND sp.stage = 'Rejected'
        ORDER BY sp.rejected_at DESC NULLS LAST, sp.updated_at DESC
        LIMIT 1
      ) AS rejection_note,
      (
        SELECT COUNT(*)::int FROM mua_pushes mp
        WHERE mp.mua_id = m.id AND mp.created_at >= ${monday}
      ) AS weekly_used,
      COALESCE((
        SELECT SUM(b.booked_price) FROM bookings b
        WHERE b.mua_id = m.id AND NOT b.cancelled
      ), 0) AS total_booking_revenue,
      (
        SELECT COUNT(*)::int FROM bookings b
        WHERE b.mua_id = m.id AND NOT b.cancelled
      ) AS total_bookings,
      (
        SELECT COUNT(*)::int FROM mua_pushes mp
        WHERE mp.mua_id = m.id
      ) AS total_pushes,
      EXISTS (
        SELECT 1 FROM mua_plan_history mph WHERE mph.mua_id = m.id
      ) AS has_plan_history,
      (
        SELECT COUNT(*)::int FROM bookings b
        WHERE b.mua_id = m.id
          AND NOT b.cancelled
          AND b.booking_date >= COALESCE(
            (
              SELECT mph.assigned_at::date
              FROM mua_plan_history mph
              WHERE mph.mua_id = m.id
              ORDER BY mph.assigned_at DESC
              LIMIT 1
            ),
            m.created_at::date
          )
      ) AS bookings_since_plan_start,
      (
        SELECT COUNT(*)::int FROM mua_pushes mp
        WHERE mp.mua_id = m.id
          AND mp.created_at >= COALESCE(
            (
              SELECT mph.assigned_at
              FROM mua_plan_history mph
              WHERE mph.mua_id = m.id
              ORDER BY mph.assigned_at DESC
              LIMIT 1
            ),
            m.created_at
          )
      ) AS pushes_since_plan_start
    FROM muas m
    LEFT JOIN plan_tiers p ON p.tier = m.plan_tier
    LEFT JOIN staff arm ON arm.id = m.assigned_rm_id
    WHERE
      (${like}::text IS NULL OR (
        m.name ILIKE ${like}
        OR (${flexLike}::text IS NOT NULL AND m.name ILIKE ${flexLike})
        OR m.city ILIKE ${like}
        OR m.display_id ILIKE ${like}
        OR (
          ${phoneMatch}::text IS NOT NULL
          AND (
            m.phone ILIKE ${phoneMatch}
            OR m.whatsapp ILIKE ${phoneMatch}
            OR m.alternate_phone ILIKE ${phoneMatch}
          )
        )
        OR (m.admin_plan_tag = 'hold' AND 'hold' ILIKE ${like})
        OR (
          m.admin_plan_tag = 'high_priority'
          AND ('high' ILIKE ${like} OR 'priority' ILIKE ${like})
        )
        OR (
          m.admin_plan_tag = 'low_priority'
          AND ('low' ILIKE ${like} OR 'priority' ILIKE ${like})
        )
      ))
      AND (
        ${filters.segment}::text = 'all'
        OR (
          ${filters.segment}::text = 'plan_customer'
          AND m.plan_tier IS NOT NULL
          AND (m.plan_expiry IS NULL OR m.plan_expiry >= CURRENT_DATE)
        )
        OR (
          ${filters.segment}::text = 'customer'
          AND (
            m.plan_tier IS NOT NULL
            OR EXISTS (SELECT 1 FROM mua_plan_history mph WHERE mph.mua_id = m.id)
          )
        )
        OR (
          ${filters.segment}::text = 'potential'
          AND NOT EXISTS (SELECT 1 FROM mua_plan_history mph WHERE mph.mua_id = m.id)
          AND (m.plan_tier IS NULL OR m.plan_expiry < CURRENT_DATE)
        )
      )
      AND (
        ${filters.tag}::text = 'all'
        OR m.admin_plan_tag = ${filters.tag}::text
      )
      AND (
        ${filters.rosterStatus}::text = 'all'
        OR m.status = ${filters.rosterStatus}::text
      )
      AND (
        ${filters.winBack}::boolean IS FALSE
        OR ${db.unsafe(WIN_BACK_MUA_PREDICATE)}
      )
      AND (
        ${dbTiers.length === 0}
        OR m.plan_tier = ANY(${dbTiers}::plan_tier[])
      )
      AND (
        ${filters.expiryStatus}::text = 'all'
        OR (
          ${filters.expiryStatus}::text = 'active'
          AND m.plan_tier IS NOT NULL
          AND (m.plan_expiry IS NULL OR m.plan_expiry >= CURRENT_DATE)
        )
        OR (
          ${filters.expiryStatus}::text = 'expiring'
          AND m.plan_expiry IS NOT NULL
          AND m.plan_expiry >= CURRENT_DATE
          AND m.plan_expiry <= CURRENT_DATE + INTERVAL '30 days'
        )
        OR (
          ${filters.expiryStatus}::text = 'expired'
          AND m.plan_expiry IS NOT NULL
          AND m.plan_expiry < CURRENT_DATE
        )
        OR (
          ${filters.expiryStatus}::text = 'none'
          AND ${db.unsafe(muaNotOnPlanSql("m"))}
        )
      )
      AND (
        ${filters.regions.length === 0}
        OR EXISTS (
          SELECT 1 FROM mua_regions mr
          WHERE mr.mua_id = m.id
            AND mr.region = ANY(${filters.regions}::region[])
        )
        OR (
          NOT EXISTS (SELECT 1 FROM mua_regions mr WHERE mr.mua_id = m.id)
          AND m.city = ANY(${regionCities}::text[])
        )
      )
      AND (
        ${filters.addedDateBasis}::text IS NULL
        OR (
          ${filters.addedDateBasis}::text = 'created'
          AND (${filters.addedFrom}::date IS NULL OR m.created_at::date >= ${filters.addedFrom}::date)
          AND (${filters.addedTo}::date IS NULL OR m.created_at::date <= ${filters.addedTo}::date)
        )
        OR (
          ${filters.addedDateBasis}::text = 'joined'
          AND (${filters.addedFrom}::date IS NULL OR m.join_date >= ${filters.addedFrom}::date)
          AND (${filters.addedTo}::date IS NULL OR m.join_date <= ${filters.addedTo}::date)
        )
      )
      AND (
        ${filterPlanRmAny}
        OR (${filterPlanRmNone} AND m.plan_rm_id IS NULL)
        OR (${planRmUuid}::uuid IS NOT NULL AND m.plan_rm_id = ${planRmUuid}::uuid)
      )
      AND (
        ${filters.salesRmStaffId}::uuid IS NULL
        OR (
          SELECT sp.assigned_to
          FROM sales.pipeline sp
          WHERE sp.mua_id = m.id
            AND sp.status = 'active'
            AND sp.stage <> 'Rejected'
          ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
          LIMIT 1
        ) = ${filters.salesRmStaffId}::uuid
      )
      AND (
        ${filters.dealClosedSalesRmStaffId}::uuid IS NULL
        OR COALESCE(
          (
            SELECT sp.sales_closed_by
            FROM sales.pipeline sp
            WHERE sp.mua_id = m.id
              AND sp.status = 'active'
              AND sp.stage <> 'Rejected'
            ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
            LIMIT 1
          ),
          m.sales_closed_by
        ) = ${filters.dealClosedSalesRmStaffId}::uuid
      )
      AND (
        ${filters.salesRm}::text = 'all'
        OR ${filters.salesRmStaffId}::uuid IS NOT NULL
        OR (
          ${filters.salesRm}::text = 'assigned'
          AND (
            SELECT sp.assigned_to IS NOT NULL
            FROM sales.pipeline sp
            WHERE sp.mua_id = m.id
              AND sp.status = 'active'
              AND sp.stage <> 'Rejected'
            ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
            LIMIT 1
          ) IS TRUE
        )
        OR (
          ${filters.salesRm}::text = 'unassigned'
          AND m.status = 'active'
          AND EXISTS (
            SELECT 1 FROM sales.pipeline sp
            WHERE sp.mua_id = m.id
              AND sp.status = 'active'
              AND sp.stage <> 'Rejected'
          )
          AND (
            SELECT sp.assigned_to
            FROM sales.pipeline sp
            WHERE sp.mua_id = m.id
              AND sp.status = 'active'
              AND sp.stage <> 'Rejected'
            ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
            LIMIT 1
          ) IS NULL
        )
      )
      AND (
        ${filters.pipeline}::text = 'all'
        OR (
          ${filters.pipeline}::text = 'has'
          AND EXISTS (
            SELECT 1 FROM sales.pipeline sp
            WHERE sp.mua_id = m.id
              AND sp.status = 'active'
          )
        )
        OR (
          ${filters.pipeline}::text = 'missing'
          AND m.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM sales.pipeline sp
            WHERE sp.mua_id = m.id
              AND sp.status = 'active'
          )
        )
      )
      AND (
        ${filters.teamId}::uuid IS NULL
        OR m.team_id = ${filters.teamId}::uuid
        OR (
          SELECT s.team_id
          FROM sales.pipeline sp
          JOIN staff s ON s.id = sp.assigned_to
          WHERE sp.mua_id = m.id
            AND sp.status = 'active'
            AND sp.stage <> 'Rejected'
          ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
          LIMIT 1
        ) = ${filters.teamId}::uuid
      )
      AND (
        ${filters.state}::text IS NULL
        OR ${filters.state} = ANY(m.plan_states)
        OR EXISTS (
          SELECT 1 FROM city_regions cr
          WHERE cr.city = m.city AND cr.state = ${filters.state}
        )
      )
      AND (
        ${pipelineStage}::text IS NULL
        OR (
          SELECT sp.stage::text
          FROM sales.pipeline sp
          WHERE sp.mua_id = m.id
            AND sp.status = 'active'
            AND sp.stage <> 'Rejected'
          ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
          LIMIT 1
        ) = ${pipelineStage}::text
      )
    ORDER BY ${db.unsafe(adminMuaOrderBySql(filters.sortBy, filters.sortDir))}
    LIMIT ${filters.pageSize}
    OFFSET ${offset}
  `;

  const regionMap = await fetchRegionsByMuaIds(
    muas.map((m) => m.id),
    db,
  );

  const dedupedMuas = (() => {
    const seen = new Set<string>();
    return muas.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  })();

  return {
    items: mapRows(dedupedMuas, regionMap),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages,
    meta: {
      onPlan: statsRow?.onPlan ?? 0,
      expiring: statsRow?.expiring ?? 0,
      needsSalesRm: statsRow?.needsSalesRm ?? 0,
      missingPipeline: statsRow?.missingPipeline ?? 0,
    },
  };
}
