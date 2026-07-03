import type { TransactionSql } from "@/db/index";
import type { PlanSharedRow, SalesPlanDetailsInput } from "@/lib/sales-plan-details";
import { normalizePlanDetailsForStorage } from "@/lib/sales-plan-details";
import { normalizeOnboardingCities } from "@/lib/onboarding-cities";

export async function upsertOnboardingPlansShared(
  tx: TransactionSql,
  pipelineId: string,
  plansShared: PlanSharedRow[],
): Promise<void> {
  await tx`
    INSERT INTO sales.onboarding (pipeline_id, plans_shared, updated_at)
    VALUES (${pipelineId}::uuid, ${tx.json(plansShared)}, NOW())
    ON CONFLICT (pipeline_id)
    DO UPDATE SET plans_shared = EXCLUDED.plans_shared, updated_at = NOW()
  `;
}

/** Create onboarding row when pipeline exists but deal terms were never captured. */
export async function ensureOnboardingForPipeline(
  tx: TransactionSql,
  pipelineId: string,
  seed?: SalesPlanDetailsInput,
): Promise<void> {
  const [exists] = await tx<{ id: string }[]>`
    SELECT id FROM sales.onboarding WHERE pipeline_id = ${pipelineId}::uuid LIMIT 1
  `;
  if (exists) return;

  if (seed) {
    await upsertOnboardingPlanDetails(tx, pipelineId, seed);
    return;
  }

  await upsertOnboardingPlansShared(tx, pipelineId, []);
}

export async function upsertOnboardingPlanDetails(
  tx: TransactionSql,
  pipelineId: string,
  details: SalesPlanDetailsInput,
  opts?: { quotedAmount?: number; plansShared?: PlanSharedRow[] },
): Promise<void> {
  details = normalizePlanDetailsForStorage(details);
  const states = details.states ?? [];
  const regions = details.regions ?? [];
  const cities = normalizeOnboardingCities(details.cities ?? [], states);

  if (cities.length > 0 && regions.length > 0) {
    if (states.length === 0) {
      throw new Error("States are required when cities are selected");
    }
    const allowed =
      states.length > 0
        ? await tx<{ city: string }[]>`
            SELECT city FROM city_regions
            WHERE city = ANY(${cities})
              AND region::text = ANY(${regions})
              AND state = ANY(${states})
          `
        : await tx<{ city: string }[]>`
            SELECT city FROM city_regions
            WHERE city = ANY(${cities})
              AND region::text = ANY(${regions})
          `;
    const allowedSet = new Set(allowed.map((r: { city: string }) => r.city.toLowerCase()));
    const invalid = cities.filter((c) => !allowedSet.has(c.toLowerCase()));
    if (invalid.length > 0) {
      throw new Error(`Invalid cities for selected states/regions: ${invalid.join(", ")}`);
    }
  }

  const socialMediaValue =
    details.hasSocialMedia === false
      ? ""
      : details.socialMedia?.trim()
        ? details.socialMedia.trim()
        : null;

  await tx`
    INSERT INTO sales.onboarding (
      pipeline_id, plan, lead_cap, lead_budget, states, regions, cities, social_media,
      rm_support, lead_reversal_offered,
      duration_start, duration_end, assured_bookings, avg_revenue_target,
      plans_shared, quoted_amount, updated_at
    ) VALUES (
      ${pipelineId}::uuid,
      ${details.plan ?? null},
      ${details.leadCap ?? null},
      ${details.leadBudget ?? null},
      ${states},
      ${regions},
      ${cities},
      ${socialMediaValue},
      ${details.rmSupport === undefined ? null : details.rmSupport},
      ${details.leadReversal === undefined ? null : details.leadReversal},
      ${details.durationStart ?? null},
      ${details.durationEnd ?? null},
      ${details.assuredBookings ?? null},
      ${details.avgRevenueTarget ?? null},
      ${opts?.plansShared ? tx.json(opts.plansShared) : tx.json([])},
      ${opts?.quotedAmount ?? null},
      NOW()
    )
    ON CONFLICT (pipeline_id)
    DO UPDATE SET
      plan = COALESCE(EXCLUDED.plan, sales.onboarding.plan),
      lead_cap = COALESCE(EXCLUDED.lead_cap, sales.onboarding.lead_cap),
      lead_budget = COALESCE(EXCLUDED.lead_budget, sales.onboarding.lead_budget),
      states = CASE WHEN array_length(EXCLUDED.states, 1) IS NULL THEN sales.onboarding.states ELSE EXCLUDED.states END,
      regions = CASE WHEN array_length(EXCLUDED.regions, 1) IS NULL THEN sales.onboarding.regions ELSE EXCLUDED.regions END,
      cities = CASE WHEN array_length(EXCLUDED.cities, 1) IS NULL THEN sales.onboarding.cities ELSE EXCLUDED.cities END,
      social_media = CASE
        WHEN ${details.hasSocialMedia === false} THEN ''
        WHEN ${details.hasSocialMedia === true} THEN COALESCE(EXCLUDED.social_media, sales.onboarding.social_media)
        ELSE COALESCE(EXCLUDED.social_media, sales.onboarding.social_media)
      END,
      rm_support = CASE
        WHEN ${details.rmSupport !== undefined} THEN EXCLUDED.rm_support
        ELSE sales.onboarding.rm_support
      END,
      lead_reversal_offered = CASE
        WHEN ${details.leadReversal !== undefined} THEN EXCLUDED.lead_reversal_offered
        ELSE sales.onboarding.lead_reversal_offered
      END,
      duration_start = COALESCE(EXCLUDED.duration_start, sales.onboarding.duration_start),
      duration_end = COALESCE(EXCLUDED.duration_end, sales.onboarding.duration_end),
      assured_bookings = COALESCE(EXCLUDED.assured_bookings, sales.onboarding.assured_bookings),
      avg_revenue_target = COALESCE(EXCLUDED.avg_revenue_target, sales.onboarding.avg_revenue_target),
      plans_shared = CASE
        WHEN ${opts?.plansShared !== undefined} THEN EXCLUDED.plans_shared
        ELSE sales.onboarding.plans_shared
      END,
      quoted_amount = COALESCE(EXCLUDED.quoted_amount, sales.onboarding.quoted_amount),
      updated_at = NOW()
  `;

  await tx`
    UPDATE sales.onboarding
    SET checklist2_complete = (
      plan IS NOT NULL AND lead_cap IS NOT NULL AND lead_budget IS NOT NULL
      AND array_length(states, 1) IS NOT NULL AND array_length(regions, 1) IS NOT NULL
      AND rm_support IS NOT NULL AND lead_reversal_offered IS NOT NULL
      AND social_media IS NOT NULL
      AND (social_media = '' OR BTRIM(social_media) <> '')
      AND array_length(cities, 1) IS NOT NULL
      AND duration_start IS NOT NULL AND duration_end IS NOT NULL
    )
    WHERE pipeline_id = ${pipelineId}::uuid
  `;
}
