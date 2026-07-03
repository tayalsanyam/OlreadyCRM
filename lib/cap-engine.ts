import { sql, startOfWeekMonday } from "@/db/index";
import { effectiveWeeklyCap } from "@/lib/mua-weekly-cap";
import { DEFAULT_PER_LEAD_CAP, COMMISSION_NON_PLAN_WEEKLY_CAP } from "@/lib/sla-defaults";
import type { UrgencyBand } from "@/lib/types";

export interface CapCheckResult {
  allowed: boolean;
  requiresBypass: boolean;
  weeklyUsed: number;
  weeklyCap: number;
  leadActiveCount: number;
  perLeadCap: number;
  reason?: string;
}

export async function checkPushCaps(
  muaId: string,
  leadId: string,
  urgencyBand: UrgencyBand,
  options: { commissionPush?: boolean } = {}
): Promise<CapCheckResult> {
  const monday = startOfWeekMonday();

  const [sla] = await sql<
    { perLeadCap: number; capBypassDays: number }[]
  >`SELECT per_lead_cap, cap_bypass_days FROM sla_config WHERE id = 1`;

  const planRows = await sql<
    {
      planTier: string | null;
      weeklyCap: number;
      weeklyCapOverride: number | null;
      weeklyCapBonus: number;
    }[]
  >`
    SELECT
      m.plan_tier AS "planTier",
      COALESCE(p.weekly_cap, 0) AS "weeklyCap",
      m.weekly_cap_override AS "weeklyCapOverride",
      COALESCE(m.weekly_cap_bonus, 0) AS "weeklyCapBonus"
    FROM muas m
    LEFT JOIN plan_tiers p ON p.tier = m.plan_tier
    WHERE m.id = ${muaId}::uuid
  `;

  const row = planRows[0];
  let planTierCap = row?.weeklyCap ?? 0;
  if (
    options.commissionPush &&
    !row?.planTier &&
    planTierCap === 0 &&
    (row?.weeklyCapOverride == null || row.weeklyCapOverride < 0)
  ) {
    planTierCap = COMMISSION_NON_PLAN_WEEKLY_CAP;
  }
  const weeklyCap = effectiveWeeklyCap(
    planTierCap,
    row?.weeklyCapOverride,
    row?.weeklyCapBonus,
  );

  const [weeklyCount] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM mua_pushes
    WHERE mua_id = ${muaId}::uuid AND created_at >= ${monday}
  `;

  const [leadCount] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM mua_pushes
    WHERE lead_id = ${leadId}::uuid
      AND status NOT IN ('closed', 'booked')
  `;

  const perLeadCap = sla?.perLeadCap ?? DEFAULT_PER_LEAD_CAP;
  const weeklyUsed = weeklyCount?.count ?? 0;
  const leadActiveCount = leadCount?.count ?? 0;

  if (leadActiveCount >= perLeadCap) {
    return {
      allowed: false,
      requiresBypass: false,
      weeklyUsed,
      weeklyCap,
      leadActiveCount,
      perLeadCap,
      reason: `Per-lead cap reached (${perLeadCap} active conversations)`,
    };
  }

  if (weeklyUsed < weeklyCap) {
    return {
      allowed: true,
      requiresBypass: false,
      weeklyUsed,
      weeklyCap,
      leadActiveCount,
      perLeadCap,
    };
  }

  if (urgencyBand === "critical") {
    return {
      allowed: true,
      requiresBypass: true,
      weeklyUsed,
      weeklyCap,
      leadActiveCount,
      perLeadCap,
      reason: "MUA weekly cap exceeded — bypass required for Critical lead",
    };
  }

  return {
    allowed: false,
    requiresBypass: false,
    weeklyUsed,
    weeklyCap,
    leadActiveCount,
    perLeadCap,
    reason: `MUA weekly cap reached (${weeklyUsed}/${weeklyCap})`,
  };
}
