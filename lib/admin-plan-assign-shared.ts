import { resolveCityAlias } from "@/lib/city-aliases";
import { deriveLegalStatesFromCities, expandBundleIntoCities } from "@/lib/geo-bundles";
import { isCompleteConfirmPlanDetails, isCompletePlanDetails, type SalesPlanDetailsInput } from "@/lib/sales-plan-details";
import type { PlanTier, Region } from "@/lib/types";

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export type AdminPlanAssignPayload = {
  planTier?: PlanTier | null | "__remove__";
  planExpiry?: string | null;
  city?: string | null;
  instagram?: string | null;
  leadCap?: number | null;
  leadBudget?: string | null;
  states?: string[];
  regions?: Region[];
  cities?: string[];
  note?: string | null;
  rmSupport?: boolean | null;
  leadReversal?: boolean | null;
  hasSocialMedia?: boolean | null;
  planRmId?: string | null;
  salesRmId?: string | null;
  invoiceNumber?: string | null;
};

export const PLAN_TIER_TO_LABEL: Record<PlanTier, string> = {
  highestPrivy: "Privy",
  phoenix2: "Phoenix 2",
  phoenix: "Phoenix",
  pro: "Pro",
  prime: "Prime",
};

/** Expand metro bundles (e.g. Delhi NCR) into cities + legal states for those cities. */
export function expandAdminPlanCoverage(
  payload: AdminPlanAssignPayload,
): AdminPlanAssignPayload {
  const rawCities = payload.city
    ? expandBundleIntoCities([payload.city, ...(payload.cities ?? [])])
    : (payload.cities ?? []);
  const cities = unique(rawCities);
  const alias = payload.city ? resolveCityAlias(payload.city) : null;
  const regions = alias
    ? unique([...(payload.regions ?? []), alias.region]) as Region[]
    : payload.regions;
  const states = unique([
    ...(payload.states ?? []),
    ...deriveLegalStatesFromCities([], cities),
    ...(alias?.states ?? []),
  ]);
  if (!alias && !cities.length) return payload;
  return {
    ...payload,
    states,
    regions,
    cities: cities.length ? cities : payload.cities,
  };
}

export function validateAdminPlanAssign(payload: AdminPlanAssignPayload): string | null {
  const expanded = expandAdminPlanCoverage(payload);
  const removing = expanded.planTier === "__remove__" || expanded.planTier === null;
  if (removing) return null;
  if (!expanded.planTier) return "Select a plan tier";
  if (!expanded.planExpiry?.trim()) return "Plan expiry is required";

  const tier = expanded.planTier as PlanTier;
  const requiresDealTerms =
    payload.rmSupport !== undefined ||
    payload.leadReversal !== undefined ||
    payload.hasSocialMedia !== undefined;

  const details: SalesPlanDetailsInput = {
    plan: PLAN_TIER_TO_LABEL[tier],
    leadCap: expanded.leadCap ?? null,
    leadBudget: expanded.leadBudget ?? undefined,
    states: expanded.states ?? [],
    regions: expanded.regions ?? [],
    cities: expanded.cities ?? [],
    socialMedia: expanded.instagram ?? "",
    hasSocialMedia: expanded.hasSocialMedia,
    rmSupport: expanded.rmSupport ?? undefined,
    leadReversal: expanded.leadReversal ?? undefined,
    durationStart: new Date().toISOString().slice(0, 10),
    durationEnd: expanded.planExpiry,
  };
  if (requiresDealTerms) {
    if (!isCompleteConfirmPlanDetails(details)) {
      return "Complete plan coverage plus RM Support, Lead Reversal, and Social Media";
    }
    if (expanded.rmSupport === true && !expanded.planRmId?.trim()) {
      return "Select a Plan RM when RM Support is Yes";
    }
  } else if (!isCompletePlanDetails(details)) {
    return "Complete plan coverage: lead cap, lead budget, states, regions, cities, and social handle";
  }
  if (!expanded.city?.trim()) {
    return "Primary city is required";
  }
  return null;
}
