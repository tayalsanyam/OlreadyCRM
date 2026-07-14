import type { TransactionSql } from "@/db/index";
import { ensureActivationTasksForPipeline } from "@/lib/sales-activation-tasks";
import { pipelineTaskRef } from "@/lib/sales-pipeline-assign-tasks";

const FOLLOW_UP_TITLE_MARKER = "Send-back follow-up";

/** If sales has not fixed training 1+ days after send-back, task activation to chase sales. */
export async function syncActivationSendBackFollowUps(
  tx: TransactionSql,
): Promise<number> {
  const rows = await tx<{ pipelineId: string; muaName: string }[]>`
    SELECT al.pipeline_id AS "pipelineId", m.name AS "muaName"
    FROM sales.activation_log al
    JOIN sales.pipeline p ON p.id = al.pipeline_id
    JOIN muas m ON m.id = p.mua_id
    JOIN sales.training tr ON tr.pipeline_id = al.pipeline_id
    WHERE al.sent_back_at IS NOT NULL
      AND al.activated_at IS NULL
      AND tr.complete = false
      AND al.sent_back_at < NOW() - INTERVAL '1 day'
  `;

  let count = 0;
  for (const row of rows) {
    const pipelineRef = pipelineTaskRef(row.pipelineId);
    const ref = `%${pipelineRef}%`;
    const followUpRef = `%${FOLLOW_UP_TITLE_MARKER}%`;

    const [existing] = await tx<{ id: string }[]>`
      SELECT id
      FROM rm_tasks
      WHERE status = 'pending'
        AND task_type = 'sales_activation'
        AND title LIKE ${ref}
        AND title LIKE ${followUpRef}
      LIMIT 1
    `;
    if (existing) continue;

    count += await ensureActivationTasksForPipeline(tx, {
      pipelineId: row.pipelineId,
      title: `${FOLLOW_UP_TITLE_MARKER} — contact sales (${row.muaName}) ${pipelineRef}`,
      dueDate: new Date().toISOString().slice(0, 10),
    });
  }
  return count;
}
