import type { TransactionSql } from "@/db/index";
import { createNotification } from "@/lib/notifications";

export type OpsTaskEndRate =
  | "resolved"
  | "partial"
  | "no_response"
  | "not_applicable"
  | "escalated"
  | "cancelled";

export const OPS_TASK_END_RATE_LABELS: Record<OpsTaskEndRate, string> = {
  resolved: "Resolved",
  partial: "Partially resolved",
  no_response: "No response",
  not_applicable: "Not applicable",
  escalated: "Escalated",
  cancelled: "Cancelled",
};

export type CreateOpsTaskInput = {
  title: string;
  description?: string | null;
  assignedTo: string;
  assignedBy: string;
  muaId?: string | null;
  leadId?: string | null;
  dueAt?: string | null;
  parentTaskId?: string | null;
};

export async function generateOpsTaskDisplayId(tx: TransactionSql): Promise<string> {
  const [row] = await tx<{ n: number }[]>`
    SELECT COALESCE(
      MAX((regexp_match(display_id, '^OT-([0-9]+)$'))[1]::int),
      0
    ) + 1 AS n
    FROM rm.ops_tasks
    WHERE display_id ~ '^OT-[0-9]+$'
  `;
  return `OT-${String(row?.n ?? 1).padStart(4, "0")}`;
}

export function opsTaskLink(taskId: string): string {
  return `/tasks/ops/${taskId}`;
}

export function opsTaskAssignerLink(taskId: string): string {
  return `/tasks/ops/${taskId}?view=assigned`;
}

export async function createOpsTask(
  tx: TransactionSql,
  input: CreateOpsTaskInput,
): Promise<{ id: string; displayId: string }> {
  const displayId = await generateOpsTaskDisplayId(tx);

  const [row] = await tx<{ id: string }[]>`
    INSERT INTO rm.ops_tasks (
      display_id,
      title,
      description,
      assigned_to,
      assigned_by,
      created_by,
      mua_id,
      lead_id,
      due_at,
      parent_task_id
    )
    VALUES (
      ${displayId},
      ${input.title.trim()},
      ${input.description?.trim() || null},
      ${input.assignedTo}::uuid,
      ${input.assignedBy}::uuid,
      ${input.assignedBy}::uuid,
      ${input.muaId ?? null}::uuid,
      ${input.leadId ?? null}::uuid,
      ${input.dueAt ?? null},
      ${input.parentTaskId ?? null}::uuid
    )
    RETURNING id
  `;

  await createNotification(tx, {
    userId: input.assignedTo,
    message: `New task ${displayId}: ${input.title.trim()}`,
    link: opsTaskLink(row.id),
  });

  return { id: row.id, displayId };
}

export async function completeOpsTask(
  tx: TransactionSql,
  opts: {
    taskId: string;
    completedBy: string;
    summary: string;
    outcome?: string | null;
    endRate?: OpsTaskEndRate | null;
    nextFollowUpAt?: string | null;
    followUpAssignedTo?: string | null;
    followUpTitle?: string | null;
  },
): Promise<{ followUp?: { id: string; displayId: string } } | null> {
  const [task] = await tx<
    {
      id: string;
      displayId: string;
      title: string;
      assignedBy: string;
      createdBy: string;
      muaId: string | null;
      leadId: string | null;
      assignedTo: string;
    }[]
  >`
    SELECT
      id,
      display_id AS "displayId",
      title,
      assigned_by AS "assignedBy",
      created_by AS "createdBy",
      mua_id AS "muaId",
      lead_id AS "leadId",
      assigned_to AS "assignedTo"
    FROM rm.ops_tasks
    WHERE id = ${opts.taskId}::uuid
  `;
  if (!task) return null;

  await tx`
    UPDATE rm.ops_tasks
    SET
      status = 'done'::rm.task_status,
      completion_notes = ${opts.summary.trim()},
      completion_outcome = ${opts.outcome?.trim() || null},
      end_rate = ${opts.endRate ?? null},
      completed_at = NOW(),
      completed_by = ${opts.completedBy}::uuid,
      updated_at = NOW()
    WHERE id = ${opts.taskId}::uuid
  `;

  const notifyIds = new Set([task.assignedBy, task.createdBy]);
  notifyIds.delete(opts.completedBy);

  for (const userId of notifyIds) {
    await createNotification(tx, {
      userId,
      message: `${task.displayId} completed — ${task.title}`,
      link: opsTaskAssignerLink(task.id),
    });
  }

  let followUp: { id: string; displayId: string } | undefined;
  if (opts.nextFollowUpAt) {
    const created = await createOpsTask(tx, {
      title: opts.followUpTitle?.trim() || `Follow-up — ${task.title}`,
      description: `Follow-up after ${task.displayId}:\n${opts.summary.trim().slice(0, 500)}`,
      assignedTo: opts.followUpAssignedTo ?? task.assignedTo,
      assignedBy: opts.completedBy,
      muaId: task.muaId,
      leadId: task.leadId,
      dueAt: opts.nextFollowUpAt,
      parentTaskId: task.id,
    });
    followUp = created;
  }

  return { followUp };
}

export async function searchMuasForOpsTask(
  tx: TransactionSql,
  query: string,
  limit = 8,
): Promise<{ id: string; displayId: string; name: string; phone: string | null; city: string | null }[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const like = `%${q.replace(/%/g, "")}%`;
  const digits = q.replace(/\D/g, "");
  const phoneMatch = digits.length >= 4 ? `%${digits.slice(-10)}` : null;

  return tx`
    SELECT id, display_id AS "displayId", name, phone, city
    FROM muas
    WHERE status <> 'junk'
      AND (
        name ILIKE ${like}
        OR display_id ILIKE ${like}
        OR (${phoneMatch}::text IS NOT NULL AND phone ILIKE ${phoneMatch})
      )
    ORDER BY name
    LIMIT ${limit}
  `;
}

export async function searchBrideLeadsForOpsTask(
  tx: TransactionSql,
  query: string,
  limit = 8,
): Promise<{ id: string; displayId: string; brideName: string; phone: string | null; city: string | null }[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const like = `%${q.replace(/%/g, "")}%`;
  const digits = q.replace(/\D/g, "");
  const phoneMatch = digits.length >= 4 ? `%${digits.slice(-10)}` : null;

  return tx`
    SELECT id, display_id AS "displayId", bride_name AS "brideName", phone, city
    FROM bride_leads
    WHERE
      bride_name ILIKE ${like}
      OR display_id ILIKE ${like}
      OR (${phoneMatch}::text IS NOT NULL AND phone ILIKE ${phoneMatch})
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}
