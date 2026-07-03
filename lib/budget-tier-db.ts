import { sql, type TransactionSql } from "@/db/index";
import {
  mergeBudgetTierConfig,
  type BudgetTierConfigBundle,
} from "@/lib/budget-tier";
import type { SlaConfig } from "@/lib/types";

/** Server-only: load tier limits from sla_config. */
export async function loadBudgetTierConfig(
  tx?: TransactionSql
): Promise<BudgetTierConfigBundle> {
  const client = tx ?? sql;
  const [row] = await client<
    { budgetTierLimits?: unknown; budgetTierRanges?: unknown }[]
  >`
    SELECT budget_tier_limits, budget_tier_ranges FROM sla_config WHERE id = 1
  `;
  return mergeBudgetTierConfig({
    budgetTierLimits: row?.budgetTierLimits,
    budgetTierRanges: row?.budgetTierRanges as SlaConfig["budgetTierRanges"],
  });
}
