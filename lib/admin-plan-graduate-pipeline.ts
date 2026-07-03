import type { TransactionSql } from "@/db/index";
import { cancelPendingSalesPipelineTasks } from "@/lib/sales-pipeline-assign-tasks";
import { DEAL_CLOSED_STAGE } from "@/lib/sales-pipeline-stages";

/**
 * First admin plan on an acquisition MUA: move the open candidate/re_engage pipeline to
 * Deal Closed (same end state as a normal sales close), keep it active for Manage MUAs
 * and T-30 renewal conversion, credit assignee, cancel pending sales tasks.
 */
export async function graduateAcquisitionPipelineOnAdminFirstPlan(
  tx: TransactionSql,
  opts: { muaId: string; actorId: string },
): Promise<{ pipelineId: string } | null> {
  const [pipe] = await tx<{
    id: string;
    stage: string;
    assignedTo: string | null;
    salesClosedBy: string | null;
    muaName: string;
  }[]>`
    SELECT
      p.id,
      p.stage::text AS stage,
      p.assigned_to AS "assignedTo",
      p.sales_closed_by AS "salesClosedBy",
      m.name AS "muaName"
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    WHERE p.mua_id = ${opts.muaId}::uuid
      AND p.status = 'active'
      AND p.stage <> 'Rejected'
      AND p.mua_type IN ('candidate', 're_engage')
      AND p.stage NOT IN ('Onboarding', 'Deal Closed', 'Part Payment')
    ORDER BY p.updated_at DESC
    LIMIT 1
  `;

  if (!pipe) return null;

  const closerId = pipe.salesClosedBy ?? pipe.assignedTo;

  await cancelPendingSalesPipelineTasks(tx, pipe.id);

  await tx`
    UPDATE sales.pipeline
    SET
      stage = ${DEAL_CLOSED_STAGE},
      sales_closed_by = COALESCE(sales_closed_by, ${closerId}::uuid),
      updated_at = NOW()
    WHERE id = ${pipe.id}::uuid
  `;

  if (closerId) {
    await tx`
      UPDATE muas
      SET
        sales_closed_by = COALESCE(sales_closed_by, ${closerId}::uuid),
        updated_at = NOW()
      WHERE id = ${opts.muaId}::uuid
    `;
  }

  await tx`
    INSERT INTO sales.stage_log (pipeline_id, from_stage, to_stage, changed_by, note)
    VALUES (
      ${pipe.id}::uuid,
      ${pipe.stage},
      ${DEAL_CLOSED_STAGE},
      ${opts.actorId}::uuid,
      'Plan assigned by admin — pipeline moved to Deal Closed'
    )
  `;

  await tx`
    INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
    VALUES (
      ${pipe.id}::uuid,
      'stageChanged',
      ${`Moved to ${DEAL_CLOSED_STAGE} — plan assigned by admin`},
      ${opts.actorId}::uuid,
      ${tx.json({ adminPlanGraduation: true, muaName: pipe.muaName })}
    )
  `;

  return { pipelineId: pipe.id };
}

/** Repair admin-graduated pipelines wrongly set to Onboarding or status=closed. */
export async function repairAdminGraduatedPipelines(
  tx: TransactionSql,
): Promise<string[]> {
  const rows = await tx<{ id: string }[]>`
    UPDATE sales.pipeline p
    SET
      status = 'active',
      stage = 'Deal Closed',
      updated_at = NOW()
    WHERE (
        p.status = 'closed'
        OR p.stage = 'Onboarding'
      )
      AND EXISTS (
        SELECT 1 FROM sales.comms_log cl
        WHERE cl.pipeline_id = p.id
          AND cl.metadata @> '{"adminPlanGraduation": true}'::jsonb
      )
    RETURNING p.id::text AS id
  `;
  return rows.map((r: { id: string }) => r.id);
}
