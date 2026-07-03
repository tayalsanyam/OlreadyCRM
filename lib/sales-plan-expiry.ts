import type { TransactionSql } from "@/db/index";
import { generateTaskDisplayId } from "@/db/index";
import { toDbTaskType } from "@/lib/db-mappers";
import { createNotification } from "@/lib/notifications";

export async function processExpiredSalesPlans(tx: TransactionSql): Promise<number> {
  const expired = await tx<{
    muaId: string;
    muaName: string;
    salesClosedBy: string | null;
    salespersonActive: boolean;
  }[]>`
    SELECT
      m.id AS "muaId",
      m.name AS "muaName",
      m.sales_closed_by AS "salesClosedBy",
      COALESCE(s.active, false) AS "salespersonActive"
    FROM muas m
    LEFT JOIN staff s ON s.id = m.sales_closed_by
    WHERE m.status != 'inactive'
      AND (
        (m.plan_expiry IS NOT NULL AND m.plan_expiry < CURRENT_DATE)
        OR (m.plan_tier IS NULL AND EXISTS (SELECT 1 FROM mua_plan_history h WHERE h.mua_id = m.id))
      )
      AND NOT EXISTS (
        SELECT 1 FROM sales.pipeline p
        WHERE p.mua_id = m.id AND p.status = 'active'
      )
  `;

  let created = 0;
  for (const row of expired) {
    const assignTo = row.salesClosedBy && row.salespersonActive ? row.salesClosedBy : null;
    const [pipeline] = await tx<{ id: string }[]>`
      INSERT INTO sales.pipeline (mua_id, mua_type, stage, status, assigned_to)
      VALUES (${row.muaId}::uuid, 're_engage', 'Untouched', 'active', ${assignTo}::uuid)
      RETURNING id
    `;
    if (!pipeline) continue;
    created++;

    const pipelineRef = `[PIPE:${pipeline.id}]`;
    if (assignTo) {
      const taskDisplayId = await generateTaskDisplayId(tx);
      await tx`
        INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
        VALUES (
          ${taskDisplayId},
          ${assignTo}::uuid,
          NULL,
          NULL,
          ${toDbTaskType("salesFollowUp")}::task_type,
          ${`Re-activation follow-up — ${row.muaName} ${pipelineRef}`},
          CURRENT_DATE,
          'pending'
        )
      `;
    } else {
      const admins = await tx<{ id: string }[]>`
        SELECT id FROM staff WHERE role = 'admin' AND active = true
      `;
      const tls = await tx<{ id: string }[]>`
        SELECT id FROM staff WHERE role = 'sales_tl' AND active = true
      `;
      const assignees = [...admins, ...tls];
      for (const user of assignees) {
        const taskDisplayId = await generateTaskDisplayId(tx);
        await tx`
          INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
          VALUES (
            ${taskDisplayId},
            ${user.id}::uuid,
            NULL,
            NULL,
            ${toDbTaskType("salesAssignRm")}::task_type,
            ${`Assign salesperson for ${row.muaName} — original salesperson inactive ${pipelineRef}`},
            CURRENT_DATE,
            'pending'
          )
        `;
        await createNotification(tx, {
          userId: user.id,
          message: `${row.muaName} re-entered sales pipeline (unassigned). Assign a salesperson.`,
          link: "/admin/muas/unassigned",
        });
      }
    }
  }

  return created;
}
