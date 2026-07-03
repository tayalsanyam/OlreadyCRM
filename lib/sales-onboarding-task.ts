import type { TransactionSql } from "@/db/index";
import { pipelineTaskRef } from "@/lib/sales-pipeline-assign-tasks";
import { DEAL_CLOSED_STAGE, ONBOARDING_STAGE } from "@/lib/sales-pipeline-stages";
import type { PipelineStage } from "@/lib/types";

export async function isSalesOnboardingPipelineReady(
  tx: TransactionSql,
  pipelineId: string,
): Promise<boolean> {
  const [row] = await tx<{
    checklist1Complete: boolean;
    checklist2Complete: boolean;
    trainingComplete: boolean;
  }[]>`
    SELECT
      COALESCE(o.checklist1_complete, false) AS "checklist1Complete",
      COALESCE(o.checklist2_complete, false) AS "checklist2Complete",
      COALESCE(t.complete, false) AS "trainingComplete"
    FROM sales.onboarding o
    LEFT JOIN sales.training t ON t.pipeline_id = o.pipeline_id
    WHERE o.pipeline_id = ${pipelineId}::uuid
    LIMIT 1
  `;
  if (!row) return false;
  return row.checklist1Complete && row.checklist2Complete && row.trainingComplete;
}

/** Mark pending onboarding CRM tasks done when checklists + training are complete. */
export async function completePendingSalesOnboardingTasks(
  tx: TransactionSql,
  pipelineId: string,
): Promise<number> {
  const ref = `%${pipelineTaskRef(pipelineId)}%`;
  const updated = await tx<{ id: string }[]>`
    UPDATE rm_tasks
    SET status = 'done', updated_at = NOW()
    WHERE status = 'pending'
      AND task_type = 'sales_onboarding'
      AND title LIKE ${ref}
    RETURNING id
  `;
  return updated.length;
}

/** After training, move pipeline from Onboarding → Deal Closed. */
export async function advancePipelineToDealClosedAfterOnboarding(
  tx: TransactionSql,
  pipelineId: string,
  actorId: string,
): Promise<boolean> {
  const [pipeline] = await tx<{ stage: PipelineStage }[]>`
    SELECT stage::text AS stage FROM sales.pipeline WHERE id = ${pipelineId}::uuid LIMIT 1
  `;
  if (!pipeline) return false;

  if (pipeline.stage === DEAL_CLOSED_STAGE) {
    await completePendingSalesOnboardingTasks(tx, pipelineId);
    return true;
  }

  if (pipeline.stage !== ONBOARDING_STAGE) {
    return false;
  }

  await completePendingSalesOnboardingTasks(tx, pipelineId);

  await tx`
    INSERT INTO sales.stage_log (pipeline_id, from_stage, to_stage, changed_by, note)
    VALUES (
      ${pipelineId}::uuid,
      ${ONBOARDING_STAGE},
      ${DEAL_CLOSED_STAGE},
      ${actorId}::uuid,
      'Training complete — deal closed and forwarded to activation'
    )
  `;
  const updated = await tx<{ id: string }[]>`
    UPDATE sales.pipeline
    SET stage = ${DEAL_CLOSED_STAGE}, updated_at = NOW()
    WHERE id = ${pipelineId}::uuid AND stage = ${ONBOARDING_STAGE}
    RETURNING id
  `;
  return updated.length > 0;
}
