import type { TransactionSql } from "@/db/index";
import { ensureActivationTasksForPipeline } from "@/lib/sales-activation-tasks";

/** Create activation tasks for pipelines missing contract upload 2+ days after generation. */
export async function syncActivationContractReminders(
  tx: TransactionSql,
): Promise<number> {
  const rows = await tx<{ pipelineId: string; muaName: string }[]>`
    SELECT al.pipeline_id AS "pipelineId", m.name AS "muaName"
    FROM sales.activation_log al
    JOIN sales.pipeline p ON p.id = al.pipeline_id
    JOIN muas m ON m.id = p.mua_id
    WHERE al.contract_generated = true
      AND (al.contract_url IS NULL OR al.contract_url = '')
      AND al.contract_generated_at < NOW() - INTERVAL '2 days'
      AND al.activated_at IS NULL
  `;

  let count = 0;
  for (const row of rows) {
    const pipelineRef = `[PIPE:${row.pipelineId}]`;
    count += await ensureActivationTasksForPipeline(tx, {
      pipelineId: row.pipelineId,
      title: `Contract upload reminder — ${row.muaName} ${pipelineRef}`,
      dueDate: new Date().toISOString().slice(0, 10),
    });
  }
  return count;
}
