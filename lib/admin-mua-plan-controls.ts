import type { TransactionSql } from "@/db/index";
import { sql } from "@/db/index";
import { latestPipelineIdForMua } from "@/lib/admin-mua-plan-controls-pipeline";
import { PLAN_TIER_TO_LABEL } from "@/lib/admin-plan-assign-shared";
import { bootstrapSalesPipelinesForMuas } from "@/lib/bootstrap-sales-pipeline";
import { fromDbPlanTier } from "@/lib/db-mappers";
import { fetchMuaRegions } from "@/lib/mua-regions-db";
import { MUA_PLAN_RM_NAME_SQL } from "@/lib/mua-contact-sql";
import { readStoredBoolean } from "@/lib/sales-plan-details";
import type { SalesPlanDetailsInput } from "@/lib/sales-plan-details";
import { ensureOnboardingForPipeline } from "@/lib/sales-onboarding-upsert";
import { assertValidPlanRm, fetchPlanRmOptionsForRegions } from "@/lib/plan-rm";
import type { PlanTier, Region } from "@/lib/types";

export type AdminMuaPlanControlsDetail = {
  planRmId: string | null;
  planRmName: string | null;
  assignedRmId: string | null;
  assignedRmName: string | null;
  rmSupport: boolean | null;
  leadReversal: boolean | null;
  pipelineId: string | null;
  regions: Region[];
  planRmOptions: { id: string; name: string; region: string }[];
};

export async function fetchAdminMuaPlanControlsDetail(
  muaId: string,
): Promise<AdminMuaPlanControlsDetail | null> {
  const [mua] = await sql<
    {
      planRmId: string | null;
      planRmName: string | null;
      assignedRmId: string | null;
      assignedRmName: string | null;
    }[]
  >`
    SELECT
      m.plan_rm_id AS "planRmId",
      ${sql.unsafe(MUA_PLAN_RM_NAME_SQL)} AS "planRmName",
      m.assigned_rm_id AS "assignedRmId",
      arm.name AS "assignedRmName"
    FROM muas m
    LEFT JOIN staff arm ON arm.id = m.assigned_rm_id
    WHERE m.id = ${muaId}::uuid
    LIMIT 1
  `;
  if (!mua) return null;

  const regions = await fetchMuaRegions(muaId);
  const pipelineId = await latestPipelineIdForMua(sql, muaId);

  let rmSupport: boolean | null = null;
  let leadReversal: boolean | null = null;
  if (pipelineId) {
    const [onb] = await sql<
      { rmSupport: boolean | string | null; leadReversal: boolean | string | null }[]
    >`
      SELECT rm_support AS "rmSupport", lead_reversal_offered AS "leadReversal"
      FROM sales.onboarding
      WHERE pipeline_id = ${pipelineId}::uuid
      LIMIT 1
    `;
    if (onb) {
      rmSupport = readStoredBoolean(onb.rmSupport);
      leadReversal = readStoredBoolean(onb.leadReversal);
    }
  }

  const planRmOptions = await fetchPlanRmOptionsForRegions(sql, regions);

  return {
    planRmId: mua.planRmId,
    planRmName: mua.planRmName,
    assignedRmId: mua.assignedRmId,
    assignedRmName: mua.assignedRmName,
    rmSupport,
    leadReversal,
    pipelineId,
    regions,
    planRmOptions,
  };
}

async function onboardingSeedFromMua(
  tx: TransactionSql,
  muaId: string,
): Promise<SalesPlanDetailsInput | undefined> {
  const [mua] = await tx<
    {
      planTier: string | null;
      planExpiry: string | null;
      leadCap: number | null;
      leadBudget: string | null;
      planStates: string[];
      planCities: string[];
      instagram: string | null;
    }[]
  >`
    SELECT
      plan_tier::text AS "planTier",
      plan_expiry::text AS "planExpiry",
      lead_cap AS "leadCap",
      lead_budget AS "leadBudget",
      plan_states AS "planStates",
      plan_cities AS "planCities",
      instagram
    FROM muas
    WHERE id = ${muaId}::uuid
  `;
  if (!mua?.planTier) return undefined;

  const appTier = fromDbPlanTier(mua.planTier) as PlanTier;
  const regions = await fetchMuaRegions(muaId);

  return {
    plan: PLAN_TIER_TO_LABEL[appTier],
    leadCap: mua.leadCap,
    leadBudget: mua.leadBudget ?? undefined,
    states: mua.planStates ?? [],
    regions,
    cities: mua.planCities ?? [],
    socialMedia: mua.instagram ?? "",
    durationStart: new Date().toISOString().slice(0, 10),
    durationEnd: mua.planExpiry ?? undefined,
  };
}

export type AdminMuaPlanControlsPatch = {
  planExpiry?: string | null;
  weeklyCapOverride?: number | null;
  weeklyCapBonus?: number | null;
  adminPlanTag?: string | null;
  note?: string | null;
  planRmId?: string | null;
  rmSupport?: boolean | null;
  leadReversal?: boolean | null;
};

export async function applyAdminMuaPlanControlsPatch(
  tx: TransactionSql,
  muaId: string,
  actorId: string,
  body: AdminMuaPlanControlsPatch,
): Promise<void> {
  if (body.planRmId !== undefined) {
    const trimmed = body.planRmId?.trim() ?? "";
    if (!trimmed) {
      await tx`UPDATE muas SET plan_rm_id = NULL WHERE id = ${muaId}::uuid`;
    } else {
      const regions = await fetchMuaRegions(muaId);
      await assertValidPlanRm(tx, trimmed, regions);
      await tx`UPDATE muas SET plan_rm_id = ${trimmed}::uuid WHERE id = ${muaId}::uuid`;
    }
  }

  if (body.rmSupport !== undefined || body.leadReversal !== undefined) {
    let pipelineId = await latestPipelineIdForMua(tx, muaId);
    if (!pipelineId) {
      const boot = await bootstrapSalesPipelinesForMuas(tx, [muaId], { actorId });
      pipelineId =
        boot.created[0]?.pipelineId ?? (await latestPipelineIdForMua(tx, muaId));
    }
    if (!pipelineId) {
      throw new Error("No sales pipeline linked — cannot update RM Support or Lead Reversal");
    }

    const seed = await onboardingSeedFromMua(tx, muaId);
    await ensureOnboardingForPipeline(tx, pipelineId, seed);

    if (body.rmSupport !== undefined) {
      await tx`
        UPDATE sales.onboarding
        SET rm_support = ${body.rmSupport}, updated_at = NOW()
        WHERE pipeline_id = ${pipelineId}::uuid
      `;
    }
    if (body.leadReversal !== undefined) {
      await tx`
        UPDATE sales.onboarding
        SET lead_reversal_offered = ${body.leadReversal}, updated_at = NOW()
        WHERE pipeline_id = ${pipelineId}::uuid
      `;
    }
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
}
