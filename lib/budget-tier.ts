import type { BudgetTier, SlaConfig } from "@/lib/types";

export type BudgetTierLimit = { min: number; max: number | null };

export type BudgetTierLimitsConfig = Record<BudgetTier, BudgetTierLimit>;

export const BUDGET_TIER_ORDER: BudgetTier[] = ["tier1", "tier2", "tier3", "tier4"];

/** Default INR limits: tier1 0–25k, tier2 25,001–50k, tier3 50,001–100k, tier4 100,001+. */
export const DEFAULT_BUDGET_TIER_LIMITS: BudgetTierLimitsConfig = {
  tier1: { min: 0, max: 25000 },
  tier2: { min: 25001, max: 50000 },
  tier3: { min: 50001, max: 100000 },
  tier4: { min: 100001, max: null },
};

function parseLimitEntry(raw: unknown): BudgetTierLimit | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { min?: unknown; max?: unknown };
  const min = Number(o.min);
  if (!Number.isFinite(min) || min < 0) return null;
  if (o.max === null || o.max === undefined) return { min, max: null };
  const max = Number(o.max);
  if (!Number.isFinite(max) || max < min) return null;
  return { min, max };
}

export function normalizeBudgetTierLimits(
  raw: unknown
): BudgetTierLimitsConfig {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_BUDGET_TIER_LIMITS };
  }
  const src = raw as Record<string, unknown>;
  const out = { ...DEFAULT_BUDGET_TIER_LIMITS };
  for (const tier of BUDGET_TIER_ORDER) {
    const parsed = parseLimitEntry(src[tier]);
    if (parsed) out[tier] = parsed;
  }
  return out;
}

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function formatTierRangeLabel(limit: BudgetTierLimit): string {
  if (limit.max === null) {
    return `${formatInr(limit.min)}+`;
  }
  return `${formatInr(limit.min)} – ${formatInr(limit.max)}`;
}

export function deriveBudgetTierRangeLabels(
  limits: BudgetTierLimitsConfig
): Record<BudgetTier, string> {
  return Object.fromEntries(
    BUDGET_TIER_ORDER.map((tier) => [tier, formatTierRangeLabel(limits[tier])])
  ) as Record<BudgetTier, string>;
}

/** Coerce ceremony/lead budget values (Postgres numeric often arrives as string). */
export function coerceBudgetAmount(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Highest matching tier for a total event budget (INR). */
export function resolveBudgetTierFromAmount(
  amount: number,
  limits: BudgetTierLimitsConfig = DEFAULT_BUDGET_TIER_LIMITS
): BudgetTier {
  const n = coerceBudgetAmount(amount);
  if (n <= 0) return "tier1";
  for (let i = BUDGET_TIER_ORDER.length - 1; i >= 0; i--) {
    const tier = BUDGET_TIER_ORDER[i];
    const { min, max } = limits[tier];
    if (n >= min && (max === null || n <= max)) return tier;
  }
  return "tier1";
}

export function sumCeremonyBudgets(
  ceremonies: Array<{ budget?: number | string | null }>
): number {
  return ceremonies.reduce((sum, c) => sum + coerceBudgetAmount(c.budget), 0);
}

export function resolveLeadBudgetTier(
  ceremonies: Array<{ budget?: number | null }>,
  limits?: BudgetTierLimitsConfig
): { totalBudget: number; tier: BudgetTier } {
  const totalBudget = sumCeremonyBudgets(ceremonies);
  const tier = resolveBudgetTierFromAmount(totalBudget, limits);
  return { totalBudget, tier };
}

export type BudgetTierConfigBundle = {
  limits: BudgetTierLimitsConfig;
  ranges: Record<BudgetTier, string>;
};

export function mergeBudgetTierConfig(
  sla?: Pick<SlaConfig, "budgetTierLimits" | "budgetTierRanges"> | null
): BudgetTierConfigBundle {
  const limits = normalizeBudgetTierLimits(sla?.budgetTierLimits);
  const derived = deriveBudgetTierRangeLabels(limits);
  const ranges = {
    ...derived,
    ...(sla?.budgetTierRanges ?? {}),
  };
  return { limits, ranges };
}
