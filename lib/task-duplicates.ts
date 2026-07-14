import type { TransactionSql } from "@/db/index";
import { sql } from "@/db/index";
import type { MuaPush, Task } from "@/lib/types";

export interface MuaTaskConflict {
  taskId: string;
  displayId: string;
  title: string;
  dueDate: string | null;
  muaName: string | null;
}

type Db = typeof sql | TransactionSql;

export function formatMuaTaskConflictError(conflict: MuaTaskConflict): string {
  const mua = conflict.muaName ? ` for ${conflict.muaName}` : "";
  return `A pending task already exists${mua} on this lead (${conflict.displayId}). Complete or update that task first.`;
}

export async function findPendingMuaTaskConflict(
  db: Db,
  params: { leadId: string; pushId: string; excludeTaskId?: string }
): Promise<MuaTaskConflict | null> {
  const { leadId, pushId, excludeTaskId } = params;
  const [row] = await db<MuaTaskConflict[]>`
    SELECT
      t.id AS "taskId",
      t.display_id AS "displayId",
      t.title,
      t.due_date AS "dueDate",
      m.name AS "muaName"
    FROM rm_tasks t
    INNER JOIN mua_pushes mp ON mp.id = t.push_id
    INNER JOIN muas m ON m.id = mp.mua_id
    WHERE t.lead_id = ${leadId}::uuid
      AND t.status = 'pending'
      AND mp.mua_id = (SELECT mua_id FROM mua_pushes WHERE id = ${pushId}::uuid)
      ${excludeTaskId ? db`AND t.id != ${excludeTaskId}::uuid` : db``}
    LIMIT 1
  `;
  return row ?? null;
}

/** Cancel pending tasks for the same lead + MUA (any push row for that MUA). */
export async function cancelPendingMuaTasks(
  db: Db,
  params: { pushId: string; excludeTaskId?: string }
): Promise<void> {
  const { pushId, excludeTaskId } = params;
  await db`
    UPDATE rm_tasks t
    SET status = 'cancelled', updated_at = NOW()
    WHERE t.status = 'pending'
      AND t.lead_id = (SELECT lead_id FROM mua_pushes WHERE id = ${pushId}::uuid)
      AND EXISTS (
        SELECT 1
        FROM mua_pushes mp_task
        WHERE mp_task.id = t.push_id
          AND mp_task.mua_id = (SELECT mua_id FROM mua_pushes WHERE id = ${pushId}::uuid)
      )
      ${excludeTaskId ? db`AND t.id != ${excludeTaskId}::uuid` : db``}
  `;
}

/** Cancel all pending tasks for a lead owned by a specific staff member. */
export async function cancelPendingStaffTasksForLead(
  db: Db,
  params: { leadId: string; staffId: string },
): Promise<number> {
  const rows = await db<{ id: string }[]>`
    UPDATE rm_tasks
    SET status = 'cancelled', updated_at = NOW()
    WHERE lead_id = ${params.leadId}::uuid
      AND staff_id = ${params.staffId}::uuid
      AND status = 'pending'
    RETURNING id
  `;
  return rows.length;
}

/** Cancel all pending tasks tied to leads (e.g. after auto-expire). */
export async function cancelPendingTasksForLeads(
  db: Db,
  leadIds: string[],
): Promise<number> {
  if (leadIds.length === 0) return 0;
  const rows = await db<{ id: string }[]>`
    UPDATE rm_tasks
    SET status = 'cancelled', updated_at = NOW()
    WHERE lead_id = ANY(${leadIds}::uuid[])
      AND status = 'pending'
    RETURNING id
  `;
  return rows.length;
}

export function findPendingMuaTaskConflictMock(
  taskList: Task[],
  pushList: MuaPush[],
  params: { leadId: string; pushId: string; excludeTaskId?: string }
): MuaTaskConflict | null {
  const ref = pushList.find((p) => p.id === params.pushId);
  if (!ref) return null;

  const pending = taskList.find((t) => {
    if (t.status !== "pending" || !t.pushId || t.leadId !== params.leadId) return false;
    if (params.excludeTaskId && t.id === params.excludeTaskId) return false;
    const push = pushList.find((p) => p.id === t.pushId);
    return push?.muaId === ref.muaId;
  });

  if (!pending) return null;
  return {
    taskId: pending.id,
    displayId: pending.displayId,
    title: pending.title,
    dueDate: pending.dueDate,
    muaName: pending.muaName ?? null,
  };
}

export function cancelPendingMuaTasksMock(
  taskList: Task[],
  pushList: MuaPush[],
  params: { pushId: string; excludeTaskId?: string }
): void {
  const ref = pushList.find((p) => p.id === params.pushId);
  if (!ref) return;
  for (const t of taskList) {
    if (t.status !== "pending" || !t.pushId || t.leadId !== ref.leadId) continue;
    if (params.excludeTaskId && t.id === params.excludeTaskId) continue;
    const push = pushList.find((p) => p.id === t.pushId);
    if (push?.muaId === ref.muaId) t.status = "cancelled";
  }
}
