import { generateTaskDisplayId, type TransactionSql } from "@/db/index";
import { toDbTaskType } from "@/lib/db-mappers";
import { createNotification } from "@/lib/notifications";
import { pipelineTaskRef, cancelPendingSalesPipelineTasks } from "@/lib/sales-pipeline-assign-tasks";
import type { PipelineStage } from "@/lib/types";

export const SENIOR_CALL_DONE_STAGE = "Senior Call Done" as const satisfies PipelineStage;

export async function applySeniorCallDone(
  tx: TransactionSql,
  opts: {
    pipelineId: string;
    fromStage: PipelineStage;
    actorId: string;
    muaName: string;
    assignedRmId: string | null;
    seniorNote: string;
    rmNextFollowUpDate: string;
    source: "taskCompletion" | "stagePanel";
    taskId?: string;
  },
): Promise<{ rmTaskCreated: boolean }> {
  const pipelineRef = pipelineTaskRef(opts.pipelineId);
  const trimmedNote = opts.seniorNote.trim();

  await tx`
    INSERT INTO sales.stage_log (pipeline_id, from_stage, to_stage, changed_by, note, next_touch_point)
    VALUES (
      ${opts.pipelineId}::uuid,
      ${opts.fromStage},
      ${SENIOR_CALL_DONE_STAGE},
      ${opts.actorId}::uuid,
      ${trimmedNote},
      ${opts.rmNextFollowUpDate}::date
    )
  `;

  await tx`
    UPDATE sales.pipeline
    SET stage = ${SENIOR_CALL_DONE_STAGE}, updated_at = NOW()
    WHERE id = ${opts.pipelineId}::uuid
  `;

  await cancelPendingSalesPipelineTasks(tx, opts.pipelineId);

  await tx`
    INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
    VALUES (
      ${opts.pipelineId}::uuid,
      'stageChanged',
      ${`Stage moved: ${opts.fromStage} → ${SENIOR_CALL_DONE_STAGE}`},
      ${opts.actorId}::uuid,
      ${tx.json({
        fromStage: opts.fromStage,
        toStage: SENIOR_CALL_DONE_STAGE,
        note: trimmedNote,
        nextTouchPoint: opts.rmNextFollowUpDate,
        source: opts.source,
        taskId: opts.taskId ?? null,
      })}
    )
  `;

  await tx`
    INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
    VALUES (
      ${opts.pipelineId}::uuid,
      'noteAdded',
      ${`Senior call debrief: ${trimmedNote}`},
      ${opts.actorId}::uuid,
      ${tx.json({ source: opts.source, taskId: opts.taskId ?? null, forRm: true })}
    )
  `;

  if (!opts.assignedRmId) {
    return { rmTaskCreated: false };
  }

  const taskDisplayId = await generateTaskDisplayId(tx);
  await tx`
    INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
    VALUES (
      ${taskDisplayId},
      ${opts.assignedRmId}::uuid,
      NULL,
      NULL,
      ${toDbTaskType("salesFollowUp")}::task_type,
      ${`Senior call debrief — ${opts.muaName} ${pipelineRef}`},
      ${opts.rmNextFollowUpDate}::date,
      'pending'
    )
  `;

  await createNotification(tx, {
    userId: opts.assignedRmId,
    message: `Senior call debrief — follow up ${opts.rmNextFollowUpDate} · ${opts.muaName}`,
    link: `/sales/tasks`,
  });

  return { rmTaskCreated: true };
}
