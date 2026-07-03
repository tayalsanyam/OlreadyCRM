import { sql, startOfWeekMonday } from "@/db/index";
import { FEEDBACK_BOOKING_LEAD_PREDICATE } from "@/lib/bookings-filter-sql";
import { fromDbPlanTier } from "@/lib/db-mappers";
import { MUA_PLAN_RM_NAME_SQL } from "@/lib/mua-contact-sql";
import { normalizeServiceOfferings } from "@/lib/mua-service-catalog";
import { fetchMuaRegions } from "@/lib/mua-regions-db";
import type {
  MuaDetailProfile,
  MuaPlanHistoryRow,
  MuaPushLeadRow,
  Region,
} from "@/lib/types";

export async function fetchMuaDetail(muaId: string): Promise<MuaDetailProfile | null> {
  const monday = startOfWeekMonday();
  const rows = await sql<MuaDetailProfile[]>`
    SELECT
      m.id,
      m.display_id,
      m.name,
      m.phone,
      m.city,
      m.plan_tier,
      m.plan_expiry,
      m.status,
      m.whatsapp,
      m.instagram,
      m.specialties,
      m.bio,
      m.services,
      m.service_offerings AS "serviceOfferings",
      m.business_name AS "businessName",
      m.official_address AS "officialAddress",
      m.gst_number AS "gstNumber",
      COALESCE(
        NULLIF(BTRIM(m.email), ''),
        (
          SELECT NULLIF(BTRIM(o.email), '')
          FROM sales.onboarding o
          JOIN sales.pipeline p ON p.id = o.pipeline_id
          WHERE p.mua_id = m.id
          ORDER BY o.updated_at DESC NULLS LAST
          LIMIT 1
        )
      ) AS email,
      m.alternate_phone AS "alternatePhone",
      m.business_manager_phone AS "businessManagerPhone",
      m.avg_revenue_target AS "avgRevenueTarget",
      m.preferred_contact_channel AS "preferredContactChannel",
      m.source,
      m.assigned_rm_id,
      m.plan_rm_id,
      m.join_date,
      m.created_at,
      m.updated_at,
      COALESCE(m.weekly_cap_override, pt.weekly_cap, 0) + COALESCE(m.weekly_cap_bonus, 0) AS weekly_cap,
      pt.monthly_push_target,
      pt.assured_bookings,
      pt.name AS plan_tier_name,
      s.name AS assigned_rm_name,
      ${sql.unsafe(MUA_PLAN_RM_NAME_SQL)} AS plan_rm_name,
      (SELECT COUNT(*)::int FROM mua_pushes mp WHERE mp.mua_id = m.id) AS total_pushes,
      (SELECT COUNT(*)::int FROM mua_pushes mp
        WHERE mp.mua_id = m.id AND mp.status = 'active') AS active_pushes,
      (SELECT COUNT(*)::int FROM bookings b WHERE b.mua_id = m.id AND NOT b.cancelled) AS "formalBookings",
      (
        SELECT COUNT(*)::int
        FROM lead_feedback lf
        WHERE lf.olready_mua_id = m.id
          AND ${sql.unsafe(FEEDBACK_BOOKING_LEAD_PREDICATE)}
      ) AS "feedbackBookings",
      COALESCE((
        SELECT SUM(b.booked_price) FROM bookings b
        WHERE b.mua_id = m.id AND NOT b.cancelled
      ), 0) AS total_booking_revenue,
      (SELECT COUNT(*)::int FROM mua_pushes mp
        WHERE mp.mua_id = m.id AND mp.created_at >= ${monday}) AS weekly_used,
      CASE WHEN (SELECT COUNT(*) FROM mua_pushes WHERE mua_id = m.id) = 0 THEN 0
      ELSE ROUND(
        (
          (SELECT COUNT(*)::numeric FROM bookings WHERE mua_id = m.id AND NOT cancelled)
          + (
            SELECT COUNT(*)::numeric
            FROM lead_feedback lf
            WHERE lf.olready_mua_id = m.id
              AND ${sql.unsafe(FEEDBACK_BOOKING_LEAD_PREDICATE)}
          )
        ) /
        (SELECT COUNT(*)::numeric FROM mua_pushes WHERE mua_id = m.id) * 100, 1
      ) END AS conversion_pct
    FROM muas m
    LEFT JOIN plan_tiers pt ON pt.tier = m.plan_tier
    LEFT JOIN staff s ON s.id = m.assigned_rm_id
    WHERE m.id = ${muaId}::uuid
  `;
  const row = rows[0];
  if (!row) return null;
  const formalBookings = row.formalBookings ?? 0;
  const feedbackBookings = row.feedbackBookings ?? 0;
  const regions = await fetchMuaRegions(muaId);
  const [callSummary] = await sql<
    {
      totalCalls: number;
      callyzerCalls: number;
      lastCallAt: string | null;
      lastCallOutcome: string | null;
    }[]
  >`
    WITH mua_calls AS (
      SELECT cl.called_at, cl.outcome, cl.callyzer_call_id
      FROM call_logs cl
      WHERE cl.mua_id = ${muaId}::uuid
      UNION ALL
      SELECT cl.called_at, cl.outcome, cl.callyzer_call_id
      FROM sales.call_logs cl
      JOIN sales.pipeline p ON p.id = cl.pipeline_id
      WHERE p.mua_id = ${muaId}::uuid
    )
    SELECT
      COUNT(*)::int AS "totalCalls",
      COUNT(*)::int AS "callyzerCalls",
      MAX(called_at) AS "lastCallAt",
      (
        SELECT outcome FROM mua_calls
        ORDER BY called_at DESC NULLS LAST
        LIMIT 1
      ) AS "lastCallOutcome"
    FROM mua_calls
  `;
  return {
    ...row,
    formalBookings,
    feedbackBookings,
    totalBookings: formalBookings + feedbackBookings,
    planTier: fromDbPlanTier(row.planTier as unknown as string),
    specialties: row.specialties ?? [],
    services: row.services ?? [],
    serviceOfferings: normalizeServiceOfferings(row.serviceOfferings),
    regions,
    salesCallSummary: callSummary ?? { totalCalls: 0, callyzerCalls: 0, lastCallAt: null, lastCallOutcome: null },
  };
}

export async function fetchMuaPushes(
  muaId: string,
  opts: {
    page: number;
    pageSize: number;
    stage?: string | null;
    tier?: string | null;
    region?: Region | null;
  }
): Promise<{ rows: MuaPushLeadRow[]; total: number }> {
  const offset = (opts.page - 1) * opts.pageSize;

  let rows: MuaPushLeadRow[] = [...(await sql<MuaPushLeadRow[]>`
    SELECT
      mp.id,
      mp.stage,
      mp.status,
      mp.created_at,
      mp.updated_at,
      lf.id AS lead_id,
      lf.display_id,
      lf.bride_name,
      lf.budget_tier,
      lf.urgency_band,
      lf.event_date,
      lf.assigned_rm_name AS rm_name
    FROM mua_pushes mp
    JOIN leads_full lf ON lf.id = mp.lead_id
    WHERE mp.mua_id = ${muaId}::uuid
    ORDER BY mp.updated_at DESC
  `)];

  if (opts.stage) {
    rows = rows.filter((r) => String(r.stage) === opts.stage);
  }
  if (opts.tier) {
    rows = rows.filter((r) => r.budgetTier === opts.tier);
  }
  if (opts.region) {
    const regionRows = await sql<{ leadId: string; region: Region }[]>`
      SELECT bl.id AS lead_id, bl.region
      FROM bride_leads bl
      WHERE bl.id IN (
        SELECT lead_id FROM mua_pushes WHERE mua_id = ${muaId}::uuid
      )
    `;
    const regionSet = new Set(
      regionRows.filter((r) => r.region === opts.region).map((r) => r.leadId)
    );
    rows = rows.filter((r) => regionSet.has(r.leadId));
  }

  const total = rows.length;
  return { rows: rows.slice(offset, offset + opts.pageSize), total };
}

function planDateKey(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export async function fetchMuaPlanHistory(
  muaId: string
): Promise<MuaPlanHistoryRow[]> {
  const [muaRow] = await sql<{ planTier: string | null; planExpiry: string | null }[]>`
    SELECT plan_tier::text AS "planTier", plan_expiry::text AS "planExpiry"
    FROM muas
    WHERE id = ${muaId}::uuid
  `;
  if (!muaRow) return [];

  const rows = await sql<
    (MuaPlanHistoryRow & {
      planTierRaw: string | null;
    })[]
  >`
    SELECT
      mph.id,
      mph.mua_id,
      mph.plan_tier AS plan_tier_raw,
      mph.plan_tier,
      mph.assigned_by,
      mph.assigned_at,
      mph.expiry_at,
      mph.notes,
      s.name AS assigned_by_name
    FROM mua_plan_history mph
    LEFT JOIN staff s ON s.id = mph.assigned_by
    WHERE mph.mua_id = ${muaId}::uuid
    ORDER BY mph.assigned_at DESC
  `;

  const today = new Date().toISOString().slice(0, 10);
  const liveTier = muaRow.planTier;
  const liveExpiry = planDateKey(muaRow.planExpiry);

  const mapped = rows.map((r) => {
    const planTier = fromDbPlanTier(r.planTier as unknown as string);
    const expiryAt = planDateKey(r.expiryAt);
    const matchesLive =
      liveTier != null &&
      r.planTierRaw === liveTier &&
      (expiryAt ?? null) === (liveExpiry ?? null);
    return {
      id: r.id,
      muaId: r.muaId,
      planTier,
      assignedBy: r.assignedBy,
      assignedAt: r.assignedAt,
      expiryAt: r.expiryAt,
      notes: r.notes,
      assignedByName: r.assignedByName,
      matchesLive,
    };
  });

  let currentId: string | null = null;
  if (liveTier != null) {
    const liveMatches = mapped.filter((r) => r.matchesLive);
    if (liveMatches.length > 0) {
      currentId = liveMatches[0]!.id;
    }
  }

  const result: MuaPlanHistoryRow[] = mapped.map(({ matchesLive, ...r }) => {
    const expiryAt = planDateKey(r.expiryAt);
    const isCurrent = r.id === currentId;
    let planStatus: MuaPlanHistoryRow["planStatus"] = "past";
    if (isCurrent) {
      planStatus = expiryAt != null && expiryAt < today ? "expired" : "current";
    } else if (expiryAt != null && expiryAt < today) {
      planStatus = "expired";
    }
    return { ...r, isCurrent, planStatus };
  });

  if (liveTier != null && currentId == null) {
    result.unshift({
      id: `live:${muaId}`,
      muaId,
      planTier: fromDbPlanTier(liveTier),
      assignedBy: null,
      assignedAt: new Date().toISOString(),
      expiryAt: liveExpiry,
      notes: "Current plan on roster (not logged in plan history)",
      assignedByName: null,
      isCurrent: true,
      planStatus:
        liveExpiry != null && liveExpiry < today ? "expired" : "current",
    });
  }

  return result;
}
