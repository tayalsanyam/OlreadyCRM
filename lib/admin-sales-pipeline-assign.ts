import { insertAuditLog, type TransactionSql } from "@/db/index";
import { parseAdminReassignStage } from "@/lib/admin-reassign-stages";
import { completeSalesAssignRmTasks, createAssignFollowUpTask } from "@/lib/sales-pipeline-assign-tasks";
import type { PipelineStage } from "@/lib/types";

export async function adminAssignPipeline(
  tx: TransactionSql,
  opts: {
    pipelineId: string;
    salesRmId: string;
    actorId: string;
    assigneeName: string;
    wasUnassigned: boolean;
  }
) {
  const { pipelineId, salesRmId, actorId, assigneeName, wasUnassigned } = opts;

  const [pipe] = await tx<{ muaType: string; muaName: string }[]>`
    SELECT p.mua_type AS "muaType", m.name AS "muaName"
    FROM sales.pipeline p
    JOIN rm.muas m ON m.id = p.mua_id
    WHERE p.id = ${pipelineId}::uuid
  `;
  if (!pipe) return;

  await tx`
    UPDATE sales.pipeline
    SET assigned_to = ${salesRmId}::uuid, updated_at = NOW()
    WHERE id = ${pipelineId}::uuid
  `;

  await tx`
    INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id)
    VALUES (
      ${pipelineId}::uuid,
      'stageChanged',
      ${wasUnassigned ? `Assigned to ${assigneeName} by admin` : `Reassigned to ${assigneeName} by admin`},
      ${actorId}::uuid
    )
  `;

  if (wasUnassigned) {
    await completeSalesAssignRmTasks(tx, pipelineId);
  }

  await createAssignFollowUpTask(tx, {
    pipelineId,
    salesRmId,
    wasUnassigned,
    muaType: pipe.muaType,
    muaName: pipe.muaName,
  });
}

export async function adminReassignPipeline(
  tx: TransactionSql,
  opts: {
    pipelineId: string;
    salesRmId: string;
    actorId: string;
    assigneeName: string;
    fromStaffId: string | null;
    currentStage: string;
    stage?: PipelineStage | null;
  },
) {
  const { pipelineId, salesRmId, actorId, assigneeName, fromStaffId, currentStage } = opts;
  const parsedStage = opts.stage ? parseAdminReassignStage(opts.stage) : null;
  const stageToSet = parsedStage && parsedStage !== currentStage ? parsedStage : null;

  const [pipe] = await tx<{ muaType: string; muaName: string }[]>`
    SELECT p.mua_type AS "muaType", m.name AS "muaName"
    FROM sales.pipeline p
    JOIN rm.muas m ON m.id = p.mua_id
    WHERE p.id = ${pipelineId}::uuid
  `;
  if (!pipe) return;

  if (stageToSet) {
    await tx`
      UPDATE sales.pipeline
      SET assigned_to = ${salesRmId}::uuid, stage = ${stageToSet}, updated_at = NOW()
      WHERE id = ${pipelineId}::uuid
    `;
    await tx`
      INSERT INTO sales.stage_log (pipeline_id, from_stage, to_stage, changed_by, note)
      VALUES (
        ${pipelineId}::uuid,
        ${currentStage},
        ${stageToSet},
        ${actorId}::uuid,
        ${"Stage set during admin reassignment"}
      )
    `;
  } else {
    await tx`
      UPDATE sales.pipeline
      SET assigned_to = ${salesRmId}::uuid, updated_at = NOW()
      WHERE id = ${pipelineId}::uuid
    `;
  }

  await tx`
    INSERT INTO sales.assignment_log (pipeline_id, from_staff_id, to_staff_id, changed_by, reason)
    VALUES (
      ${pipelineId}::uuid,
      ${fromStaffId ?? null}::uuid,
      ${salesRmId}::uuid,
      ${actorId}::uuid,
      ${stageToSet ? "Admin reassignment with stage update" : "Admin reassignment"}
    )
  `;

  await insertAuditLog(tx, {
    tableName: "sales_pipeline",
    recordId: pipelineId,
    action: "reassign",
    actorId,
    changes: { from: fromStaffId, to: salesRmId, stage: stageToSet ?? undefined },
  });

  const description = stageToSet
    ? `Reassigned to ${assigneeName} by admin (stage → ${stageToSet})`
    : `Reassigned to ${assigneeName} by admin`;

  await tx`
    INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id)
    VALUES (${pipelineId}::uuid, 'stageChanged', ${description}, ${actorId}::uuid)
  `;

  await createAssignFollowUpTask(tx, {
    pipelineId,
    salesRmId,
    wasUnassigned: false,
    muaType: pipe.muaType,
    muaName: pipe.muaName,
  });
}
