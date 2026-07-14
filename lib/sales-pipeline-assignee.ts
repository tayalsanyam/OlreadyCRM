import type { TransactionSql } from "@/db/index";

/** Staff who may own an active sales pipeline (RM or TL). */
export function isSalesPipelineAssigneeAppRole(role: string): boolean {
  return role === "salesRm" || role === "salesTl";
}

export function formatSalesPipelineAssigneeLabel(name: string, role: string): string {
  return role === "salesTl" ? `${name} (TL)` : name;
}

/** Map `/api/sales/assignable-rms` rows for assign / reassign dropdowns. */
export function mapAssignableStaffFromApi(
  users: Array<{ id: string; name: string; role: string }>,
): Array<{ id: string; name: string }> {
  return users
    .filter((u) => isSalesPipelineAssigneeAppRole(u.role))
    .map((u) => ({ id: u.id, name: formatSalesPipelineAssigneeLabel(u.name, u.role) }));
}

export async function loadActiveSalesPipelineAssignee(
  tx: TransactionSql,
  staffId: string,
): Promise<{ id: string; name: string; teamId: string | null; role: string } | null> {
  const [row] = await tx<{ id: string; name: string; teamId: string | null; role: string }[]>`
    SELECT id, name, team_id AS "teamId", role::text AS role
    FROM staff
    WHERE id = ${staffId}::uuid
      AND active = true
      AND role IN ('sales_rm', 'sales_tl')
  `;
  return row ?? null;
}

export function assertSalesTlCanAssignTo(memberIds: string[], assigneeId: string): void {
  if (!memberIds.includes(assigneeId)) {
    throw Object.assign(new Error("Assignee not on your team"), { status: 403 });
  }
}
