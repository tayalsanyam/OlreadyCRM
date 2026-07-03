import type { TransactionSql } from "@/db/index";
import type { UserRole } from "@/lib/types";

export type OpsTaskAccessRole = "assignee" | "assigner" | "admin" | null;

export async function getOpsTaskAccess(
  tx: TransactionSql,
  taskId: string,
  userId: string,
  role: UserRole,
): Promise<OpsTaskAccessRole> {
  const [row] = await tx<
    { assignedTo: string; assignedBy: string; createdBy: string }[]
  >`
    SELECT
      assigned_to AS "assignedTo",
      assigned_by AS "assignedBy",
      created_by AS "createdBy"
    FROM rm.ops_tasks
    WHERE id = ${taskId}::uuid
  `;
  if (!row) return null;
  if (row.assignedTo === userId) return "assignee";
  if (role === "admin" || role === "owner") return "admin";
  if (row.assignedBy === userId || row.createdBy === userId) return "assigner";
  return null;
}
