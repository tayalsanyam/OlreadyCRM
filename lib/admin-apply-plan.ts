import type { TransactionSql } from "@/db/index";
import { insertAuditLog } from "@/db/index";
import { toDbPlanTier } from "@/lib/db-mappers";
import {
  expandAdminPlanCoverage,
  type AdminPlanAssignPayload,
} from "@/lib/admin-plan-assign-shared";
import { syncMuaRegions } from "@/lib/mua-regions-db";
import { graduateAcquisitionPipelineOnAdminFirstPlan } from "@/lib/admin-plan-graduate-pipeline";
import { syncAdminPlanAssignSalesExtras } from "@/lib/admin-plan-assign-sales";
import { isMuaOnActivePlan } from "@/lib/mua-active-plan";
import { supersedeRenewalForAdminExtension } from "@/lib/sales-renewal-track";
import type { PlanTier } from "@/lib/types";

export type { AdminPlanAssignPayload } from "@/lib/admin-plan-assign-shared";
export {
  PLAN_TIER_TO_LABEL,
  expandAdminPlanCoverage,
  validateAdminPlanAssign,
} from "@/lib/admin-plan-assign-shared";

export async function applyAdminPlanToMua(
  tx: TransactionSql,
  muaId: string,
  actorId: string,
  rawPayload: AdminPlanAssignPayload,
  opts?: {
    priorExpiry?: string | null;
    /** Skip when plan is applied from activation (onboarding pipeline already in flight). */
    skipAcquisitionGraduation?: boolean;
  },
): Promise<void> {
  const payload = expandAdminPlanCoverage(rawPayload);
  const removing = payload.planTier === "__remove__" || payload.planTier === null;

  if (removing) {
    await tx`
      UPDATE muas
      SET
        plan_tier = NULL,
        plan_expiry = NULL,
        lead_cap = NULL,
        lead_budget = NULL,
        plan_states = '{}',
        plan_cities = '{}',
        updated_at = NOW()
      WHERE id = ${muaId}::uuid
    `;
    await insertAuditLog(tx, {
      tableName: "muas",
      recordId: muaId,
      action: "remove_plan",
      actorId,
      changes: payload as unknown as Record<string, unknown>,
    });
    return;
  }

  const tier = payload.planTier as PlanTier;
  const dbTier = toDbPlanTier(tier);
  const states = payload.states ?? [];
  const cities = payload.cities ?? [];
  const regions = payload.regions ?? [];

  const [priorRow] = await tx<{ planTier: string | null; planExpiry: string | null }[]>`
    SELECT plan_tier::text AS "planTier", plan_expiry::text AS "planExpiry"
    FROM muas WHERE id = ${muaId}::uuid
  `;
  const hadActivePlanBefore = isMuaOnActivePlan({
    planTier: priorRow?.planTier ?? null,
    planExpiry: priorRow?.planExpiry ?? null,
  });

  await tx`
    UPDATE muas
    SET
      plan_tier = ${dbTier}::plan_tier,
      plan_expiry = ${payload.planExpiry}::date,
      city = ${payload.city ?? null},
      instagram = ${payload.instagram ?? null},
      lead_cap = ${payload.leadCap ?? null},
      lead_budget = ${payload.leadBudget ?? null},
      plan_states = ${states},
      plan_cities = ${cities},
      status = 'active',
      updated_at = NOW()
    WHERE id = ${muaId}::uuid
  `;

  if (regions.length > 0) {
    await syncMuaRegions(tx, muaId, regions);
  }

  await syncAdminPlanAssignSalesExtras(tx, muaId, actorId, payload);

  await tx`
    INSERT INTO mua_plan_history (mua_id, plan_tier, assigned_by, expiry_at, notes)
    VALUES (
      ${muaId}::uuid,
      ${dbTier}::plan_tier,
      ${actorId}::uuid,
      ${payload.planExpiry ?? null}::date,
      ${payload.note ?? "Admin plan assignment"}
    )
  `;

  if (
    payload.planExpiry !== undefined &&
    payload.planExpiry !== (opts?.priorExpiry ?? null)
  ) {
    await supersedeRenewalForAdminExtension(tx, muaId, actorId);
  }

  const onActivePlanNow = isMuaOnActivePlan({
    planTier: dbTier,
    planExpiry: payload.planExpiry ?? null,
  });
  if (
    onActivePlanNow &&
    !hadActivePlanBefore &&
    !opts?.skipAcquisitionGraduation
  ) {
    await graduateAcquisitionPipelineOnAdminFirstPlan(tx, { muaId, actorId });
  }

  await insertAuditLog(tx, {
    tableName: "muas",
    recordId: muaId,
    action: "admin_assign_plan",
    actorId,
    changes: payload as unknown as Record<string, unknown>,
  });
}
