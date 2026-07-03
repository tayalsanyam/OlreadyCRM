import {
  mergeBudgetTierConfig,
  type BudgetTierLimitsConfig,
} from "@/lib/budget-tier";
import {
  DEFAULT_LEAD_SOURCES,
  type BudgetTier,
  type SlaConfig,
} from "@/lib/types";

export type UploadFormConfig = {
  ceremonyTypes: string[];
  budgetTierRanges: Record<BudgetTier, string>;
  budgetTierLimits: BudgetTierLimitsConfig;
  leadSources: string[];
};

/** Upload config is flat; admin config nests under `sla`. */
export function parseUploadFormConfig(json: {
  data?: SlaConfig & {
    sla?: SlaConfig;
    ceremonyTypes?: string[];
    budgetTierRanges?: Partial<Record<BudgetTier, string>>;
    leadSources?: string[];
  };
}): UploadFormConfig {
  const d = json.data;
  const sla = d?.sla ?? d;
  const ceremonyTypes =
    sla?.ceremonyTypes ??
    (Array.isArray(d?.ceremonyTypes) ? d.ceremonyTypes : null) ??
    ["Wedding"];
  const { limits, ranges } = mergeBudgetTierConfig({
    budgetTierLimits:
      sla?.budgetTierLimits ?? d?.budgetTierLimits ?? undefined,
    budgetTierRanges:
      sla?.budgetTierRanges ?? d?.budgetTierRanges ?? undefined,
  });
  const leadSources =
    sla?.leadSources?.length
      ? sla.leadSources
      : d?.leadSources?.length
        ? d.leadSources
        : DEFAULT_LEAD_SOURCES;
  return { ceremonyTypes, budgetTierRanges: ranges, budgetTierLimits: limits, leadSources };
}
