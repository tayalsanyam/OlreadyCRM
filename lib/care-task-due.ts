import type { TransactionSql } from "@/db/index";
import { fromDbRole } from "@/lib/db-mappers";

const CROSS_TEAM_ROLES = new Set([
  "regionalRm",
  "commissionRm",
  "feedbackRm",
  "salesRm",
  "salesTl",
  "salesActivation",
]);

/** End of local calendar day — same-day SLA for care-assigned cross-team tasks. */
export function careTaskSameDayDueAt(now = new Date()): string {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export function isCrossTeamCareAssignee(appRole: string): boolean {
  return CROSS_TEAM_ROLES.has(appRole);
}

export async function resolveCareTaskDueAt(
  tx: TransactionSql,
  opts: { assigneeId?: string | null; explicitDueAt?: string | null }
): Promise<string | null> {
  if (opts.explicitDueAt) return opts.explicitDueAt;
  if (!opts.assigneeId) return null;

  const [staff] = await tx<{ role: string }[]>`
    SELECT role::text AS role FROM staff WHERE id = ${opts.assigneeId}::uuid
  `;
  if (!staff) return null;

  const appRole = fromDbRole(staff.role);
  if (isCrossTeamCareAssignee(appRole)) {
    return careTaskSameDayDueAt();
  }
  return null;
}
