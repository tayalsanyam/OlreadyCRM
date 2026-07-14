import type { TransactionSql } from "@/db/index";
import { latestPipelineIdForMua } from "@/lib/admin-mua-plan-controls-pipeline";
import type { AdminPlanAssignPayload } from "@/lib/admin-plan-assign-shared";
import { PLAN_TIER_TO_LABEL } from "@/lib/admin-plan-assign-shared";
import { bootstrapSalesPipelinesForMuas } from "@/lib/bootstrap-sales-pipeline";
import { assertValidPlanRm } from "@/lib/plan-rm";
import { loadActiveSalesPipelineAssignee } from "@/lib/sales-pipeline-assignee";
import { upsertOnboardingPlanDetails, ensureOnboardingForPipeline } from "@/lib/sales-onboarding-upsert";
import type { SalesPlanDetailsInput } from "@/lib/sales-plan-details";

export async function syncAdminPlanAssignSalesExtras(
  tx: TransactionSql,
  muaId: string,
  actorId: string,
  payload: AdminPlanAssignPayload,
): Promise<void> {
  const needsPipeline =
    payload.rmSupport !== undefined ||
    payload.leadReversal !== undefined ||
    payload.hasSocialMedia !== undefined ||
    payload.planRmId !== undefined ||
    payload.salesRmId !== undefined ||
    payload.invoiceNumber !== undefined;

  if (!needsPipeline) return;

  let pipelineId = await latestPipelineIdForMua(tx, muaId);
  if (!pipelineId) {
    const boot = await bootstrapSalesPipelinesForMuas(tx, [muaId], { actorId });
    pipelineId = boot.created[0]?.pipelineId ?? (await latestPipelineIdForMua(tx, muaId));
  }
  if (!pipelineId) {
    throw new Error("Could not link a sales pipeline for deal terms");
  }

  const tier = payload.planTier;
  if (tier && tier !== "__remove__" && tier !== null) {
    const details: SalesPlanDetailsInput = {
      plan: PLAN_TIER_TO_LABEL[tier],
      leadCap: payload.leadCap ?? null,
      leadBudget: payload.leadBudget ?? undefined,
      states: payload.states ?? [],
      regions: payload.regions ?? [],
      cities: payload.cities ?? [],
      socialMedia: payload.instagram ?? "",
      hasSocialMedia: payload.hasSocialMedia,
      rmSupport: payload.rmSupport ?? undefined,
      leadReversal: payload.leadReversal ?? undefined,
      durationStart: new Date().toISOString().slice(0, 10),
      durationEnd: payload.planExpiry ?? undefined,
    };
    await upsertOnboardingPlanDetails(tx, pipelineId, details);
  } else if (
    payload.rmSupport !== undefined ||
    payload.leadReversal !== undefined ||
    payload.hasSocialMedia !== undefined
  ) {
    await ensureOnboardingForPipeline(tx, pipelineId, {
      rmSupport: payload.rmSupport ?? undefined,
      leadReversal: payload.leadReversal ?? undefined,
      hasSocialMedia: payload.hasSocialMedia,
      socialMedia: payload.instagram ?? "",
    });
  }

  if (payload.planRmId !== undefined) {
    const trimmed = payload.planRmId?.trim() ?? "";
    if (!trimmed) {
      await tx`UPDATE muas SET plan_rm_id = NULL WHERE id = ${muaId}::uuid`;
    } else {
      const regions = payload.regions ?? [];
      await assertValidPlanRm(tx, trimmed, regions);
      await tx`UPDATE muas SET plan_rm_id = ${trimmed}::uuid WHERE id = ${muaId}::uuid`;
    }
  }

  if (payload.salesRmId !== undefined) {
    const trimmed = payload.salesRmId?.trim() ?? "";
    if (!trimmed) {
      await tx`
        UPDATE sales.pipeline
        SET sales_closed_by = NULL, updated_at = NOW()
        WHERE id = ${pipelineId}::uuid
      `;
      await tx`UPDATE muas SET sales_closed_by = NULL, updated_at = NOW() WHERE id = ${muaId}::uuid`;
    } else {
      const assignee = await loadActiveSalesPipelineAssignee(tx, trimmed);
      if (!assignee) {
        throw new Error("Selected Sales RM is not an active salesperson");
      }
      await tx`
        UPDATE sales.pipeline
        SET
          sales_closed_by = ${trimmed}::uuid,
          assigned_to = COALESCE(assigned_to, ${trimmed}::uuid),
          updated_at = NOW()
        WHERE id = ${pipelineId}::uuid
      `;
      await tx`
        UPDATE muas
        SET sales_closed_by = ${trimmed}::uuid, updated_at = NOW()
        WHERE id = ${muaId}::uuid
      `;
    }
  }

  if (payload.invoiceNumber !== undefined) {
    const invoiceNumber = payload.invoiceNumber?.trim() || null;
    await tx`
      INSERT INTO sales.activation_log (pipeline_id)
      VALUES (${pipelineId}::uuid)
      ON CONFLICT (pipeline_id) DO NOTHING
    `;
    await tx`
      UPDATE sales.activation_log
      SET
        invoice_number = ${invoiceNumber},
        invoice_generated = ${Boolean(invoiceNumber)},
        invoice_generated_at = CASE WHEN ${Boolean(invoiceNumber)} THEN NOW() ELSE NULL END
      WHERE pipeline_id = ${pipelineId}::uuid
    `;
  }
}
