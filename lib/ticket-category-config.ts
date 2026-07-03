import type { TransactionSql } from "@/db/index";

export type CategoryConfigRow = {
  category: string;
  defaultUrgency: string;
  defaultApprovalTier: number;
  requiresLedger: boolean;
  slaHours: number;
  active: boolean;
};

export async function fetchCategoryConfig(
  tx: TransactionSql,
  category: string
): Promise<CategoryConfigRow | null> {
  const [row] = await tx<CategoryConfigRow[]>`
    SELECT
      category,
      default_urgency::text AS "defaultUrgency",
      default_approval_tier AS "defaultApprovalTier",
      requires_ledger AS "requiresLedger",
      sla_hours AS "slaHours",
      active
    FROM support.category_config
    WHERE category = ${category}
    LIMIT 1
  `;
  return row ?? null;
}

export async function categoriesRequireLedger(
  tx: TransactionSql,
  categories: string[]
): Promise<boolean> {
  if (!categories.length) return false;
  const rows = await tx<{ requiresLedger: boolean }[]>`
    SELECT requires_ledger AS "requiresLedger"
    FROM support.category_config
    WHERE category = ANY(${categories})
      AND requires_ledger = true
      AND active = true
  `;
  return rows.length > 0;
}
