import type { Sql, TransactionSql } from "@/db/index";

export type CommissionRmOption = { id: string; name: string };

export async function listActiveCommissionRms(
  db: Sql | TransactionSql
): Promise<CommissionRmOption[]> {
  return db<CommissionRmOption[]>`
    SELECT id, name FROM staff
    WHERE role = 'commission_rm'::user_role AND active = true
    ORDER BY name
  `;
}

export async function requireActiveCommissionRm(
  db: Sql | TransactionSql,
  commissionRmId: string
): Promise<CommissionRmOption> {
  const [rm] = await db<CommissionRmOption[]>`
    SELECT id, name FROM staff
    WHERE id = ${commissionRmId}::uuid
      AND role = 'commission_rm'::user_role
      AND active = true
  `;
  if (!rm) {
    throw new Error("Commission RM not found or inactive");
  }
  return rm;
}

/** Pick commission RM with fewest active commission leads (auto-shift). */
export async function pickCommissionRmForAssignment(
  tx: TransactionSql
): Promise<CommissionRmOption | null> {
  const [rm] = await tx<CommissionRmOption[]>`
    SELECT s.id, s.name, COUNT(bl.id)::int AS load
    FROM staff s
    LEFT JOIN bride_leads bl ON bl.assigned_rm_id = s.id
      AND bl.status = 'commission_rm'
    WHERE s.role = 'commission_rm'::user_role AND s.active = true
    GROUP BY s.id, s.name
    ORDER BY load ASC, s.name
    LIMIT 1
  `;
  return rm ?? null;
}
