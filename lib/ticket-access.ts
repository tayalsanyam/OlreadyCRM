import type { TransactionSql } from "@/db/index";
import type { SessionUser } from "@/lib/types";

const OPERATOR_ROLES = new Set(["careAgent", "admin", "owner"]);

export function isGrievanceOperator(role: string): boolean {
  return OPERATOR_ROLES.has(role);
}

export async function hasTicketViewAccess(
  tx: TransactionSql,
  session: SessionUser,
  ticketId: string
): Promise<boolean> {
  if (isGrievanceOperator(session.role)) return true;

  if (session.role === "feedbackRm") {
    const [created] = await tx<{ id: string }[]>`
      SELECT id FROM support.tickets
      WHERE id = ${ticketId}::uuid
        AND created_by = ${session.userId}::uuid
      LIMIT 1
    `;
    if (created) return true;
  }

  const [task] = await tx<{ id: string }[]>`
    SELECT id FROM support.ticket_tasks
    WHERE ticket_id = ${ticketId}::uuid
      AND assigned_to = ${session.userId}::uuid
      AND status IN ('pending', 'in_progress')
    LIMIT 1
  `;
  return Boolean(task);
}

export async function hasCareTaskAccess(
  tx: TransactionSql,
  session: SessionUser,
  taskId: string
): Promise<boolean> {
  if (isGrievanceOperator(session.role)) return true;

  const [task] = await tx<{ id: string }[]>`
    SELECT id FROM support.ticket_tasks
    WHERE id = ${taskId}::uuid
      AND assigned_to = ${session.userId}::uuid
    LIMIT 1
  `;
  return Boolean(task);
}
