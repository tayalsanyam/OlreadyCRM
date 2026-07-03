import type { PipelineStage } from "@/lib/types";

export const PLAN_OPTIONS = ["Privy", "Phoenix 2", "Phoenix", "Pro", "Prime"] as const;

export const PLAN_DEFAULT_CAP: Record<string, number> = {
  Privy: 120,
  "Phoenix 2": 90,
  Phoenix: 70,
  Pro: 40,
  Prime: 20,
};

export const LEAD_BUDGET_OPTIONS = ["Tier 1", "Tier 2", "Tier 3", "Tier 4"] as const;

export type LeadBudgetTier = (typeof LEAD_BUDGET_OPTIONS)[number];

export function parseLeadBudgetTiers(raw?: string | null): LeadBudgetTier[] {
  if (!raw?.trim()) return [];
  const parts = raw.split(/[,;/|]+/).map((p) => p.trim());
  return LEAD_BUDGET_OPTIONS.filter((t) =>
    parts.some((p) => p.toLowerCase() === t.toLowerCase()),
  );
}

export function formatLeadBudgetTiers(tiers: string[]): string {
  const set = new Set(tiers.map((t) => t.trim()).filter(Boolean));
  return LEAD_BUDGET_OPTIONS.filter((t) => set.has(t)).join(", ");
}

export type PlanSharedRow = { plan: string; amount: number };

export type SalesPlanDetailsInput = {
  plan?: string;
  leadCap?: number | null;
  leadBudget?: string;
  states?: string[];
  regions?: string[];
  cities?: string[];
  socialMedia?: string;
  hasSocialMedia?: boolean | null;
  rmSupport?: boolean | null;
  leadReversal?: boolean | null;
  durationStart?: string;
  durationEnd?: string;
  assuredBookings?: number | null;
  avgRevenueTarget?: number | null;
};

function isCompletePlanCore(d: SalesPlanDetailsInput | undefined | null): boolean {
  if (!d) return false;
  if (!d.plan?.trim()) return false;
  if (!d.leadCap || d.leadCap <= 0) return false;
  if (!parseLeadBudgetTiers(d.leadBudget).length) return false;
  if (!d.states?.length) return false;
  if (!d.regions?.length) return false;
  if (!d.cities?.length) return false;
  if (!d.durationStart || !d.durationEnd) return false;
  if (new Date(d.durationStart) > new Date(d.durationEnd)) return false;
  return true;
}

export function readStoredBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "t" || value === "true") return true;
  if (value === "f" || value === "false") return false;
  return null;
}

export function formatYesNo(value: boolean | null | undefined): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

export function formatSocialMediaDealLabel(input: {
  socialMedia?: string | null;
  hasSocialMedia?: boolean | null;
}): string {
  const sm = input.socialMedia?.trim() ?? "";
  if (sm) return `Yes — ${sm}`;
  if (input.hasSocialMedia === false || input.socialMedia === "") return "No";
  if (input.hasSocialMedia === true) return "Yes (handle not recorded)";
  return "—";
}

export function isDealConfirmFieldsComplete(d: SalesPlanDetailsInput | undefined | null): boolean {
  if (!d) return false;
  if (typeof d.rmSupport !== "boolean") return false;
  if (typeof d.leadReversal !== "boolean") return false;
  if (typeof d.hasSocialMedia !== "boolean") return false;
  if (d.hasSocialMedia && !d.socialMedia?.trim()) return false;
  return true;
}

export function normalizePlanDetailsForStorage(d: SalesPlanDetailsInput): SalesPlanDetailsInput {
  const next = { ...d };
  if (next.hasSocialMedia === false) {
    next.socialMedia = "";
  }
  return next;
}

export function normalizePlansShared(raw: unknown): PlanSharedRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const plan = String((row as PlanSharedRow).plan ?? "").trim();
      const amount = Number((row as PlanSharedRow).amount);
      if (!plan || !Number.isFinite(amount) || amount <= 0) return null;
      return { plan, amount };
    })
    .filter((r): r is PlanSharedRow => r !== null);
}

/** Details Shared → Confirm: prefill plan + default lead cap only (nothing else). */
export function prefillConfirmPlanFromShared(
  planDetails: SalesPlanDetailsInput,
  plansShared: PlanSharedRow[],
): SalesPlanDetailsInput {
  if (planDetails.plan?.trim() || !plansShared.length) return planDetails;
  const row = plansShared[0];
  return {
    ...planDetails,
    plan: row.plan,
    leadCap: planDetails.leadCap ?? PLAN_DEFAULT_CAP[row.plan] ?? null,
  };
}

/** Deal price at Confirm — match selected plan to amount shared at Details Shared. */
export function resolveQuotedAmountFromPlansShared(
  plan: string | undefined,
  plansShared: PlanSharedRow[],
  storedQuoted?: number | null,
): number {
  const stored = Number(storedQuoted ?? 0);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const key = plan?.trim();
  if (!key) return 0;
  const row = plansShared.find((r) => r.plan === key);
  const amount = Number(row?.amount ?? 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function isCompletePlanDetails(d: SalesPlanDetailsInput | undefined | null): boolean {
  if (!isCompletePlanCore(d)) return false;
  if (!d!.socialMedia?.trim()) return false;
  return true;
}

export function isCompleteConfirmPlanDetails(d: SalesPlanDetailsInput | undefined | null): boolean {
  if (!isCompletePlanCore(d)) return false;
  return isDealConfirmFieldsComplete(d);
}

export function validateStagePlanPayload(
  toStage: PipelineStage,
  payload: {
    plansShared?: PlanSharedRow[];
    planDetails?: SalesPlanDetailsInput;
    quotedAmount?: number;
    paymentDetails?: { amount?: number; paymentDate?: string; paymentMode?: string };
  },
): string | null {
  if (toStage === "Details Shared") {
    const rows = payload.plansShared ?? [];
    if (!rows.length) return "Select at least one plan with amount shared";
    return null;
  }
  if (toStage === "Confirm") {
    if (!isCompleteConfirmPlanDetails(payload.planDetails)) {
      return "Complete all plan details plus RM Support, Lead Reversal, and Social Media";
    }
    if (!payload.quotedAmount || payload.quotedAmount <= 0) {
      return "Quoted / deal amount is required at Confirm";
    }
    return null;
  }
  if (toStage === "Deal Closed") {
    if (!isCompleteConfirmPlanDetails(payload.planDetails)) {
      return "Complete all plan details plus RM Support, Lead Reversal, and Social Media before closing the deal";
    }
    const p = payload.paymentDetails;
    if (!p?.amount || p.amount <= 0 || !p.paymentDate || !p.paymentMode) {
      return "Payment amount, date, and mode are required";
    }
    return null;
  }
  return null;
}

export function mapOnboardingRow(raw: Record<string, unknown> | null | undefined) {
  if (!raw) return null;
  return {
    ...raw,
    plan: raw.plan,
    muaName: raw.mua_name ?? raw.muaName,
    businessName: raw.business_name ?? raw.businessName,
    leadCap: raw.lead_cap ?? raw.leadCap,
    leadBudget: raw.lead_budget ?? raw.leadBudget,
    states: (raw.states as string[]) ?? [],
    regions: (raw.regions as string[]) ?? [],
    cities: (raw.cities as string[]) ?? [],
    socialMedia: raw.social_media ?? raw.socialMedia,
    hasSocialMedia: (() => {
      const sm = raw.social_media ?? raw.socialMedia;
      if (sm === "") return false;
      if (sm) return true;
      if (raw.has_social_media != null) return Boolean(raw.has_social_media);
      if (raw.hasSocialMedia != null) return Boolean(raw.hasSocialMedia);
      return null;
    })(),
    rmSupport: readStoredBoolean(raw.rm_support ?? raw.rmSupport),
    leadReversal: readStoredBoolean(raw.lead_reversal_offered ?? raw.leadReversal),
    durationStart: raw.duration_start ?? raw.durationStart,
    durationEnd: raw.duration_end ?? raw.durationEnd,
    assuredBookings: raw.assured_bookings ?? raw.assuredBookings,
    avgRevenueTarget: raw.avg_revenue_target ?? raw.avgRevenueTarget,
    plansShared: normalizePlansShared(raw.plans_shared ?? raw.plansShared),
    quotedAmount: raw.quoted_amount ?? raw.quotedAmount,
    checklist1Complete: raw.checklist1_complete ?? raw.checklist1Complete,
    checklist2Complete: raw.checklist2_complete ?? raw.checklist2Complete,
  };
}

export function planDetailsFromOnboarding(onboarding: ReturnType<typeof mapOnboardingRow>): SalesPlanDetailsInput {
  if (!onboarding) return {};
  return {
    plan: (onboarding.plan as string) ?? "",
    leadCap: onboarding.leadCap != null ? Number(onboarding.leadCap) : null,
    leadBudget: (onboarding.leadBudget as string) ?? "",
    states: (onboarding.states as string[]) ?? [],
    regions: (onboarding.regions as string[]) ?? [],
    cities: (onboarding.cities as string[]) ?? [],
    socialMedia: (onboarding.socialMedia as string) ?? "",
    hasSocialMedia:
      onboarding.socialMedia === ""
        ? false
        : onboarding.socialMedia
          ? true
          : onboarding.hasSocialMedia != null
            ? Boolean(onboarding.hasSocialMedia)
            : null,
    rmSupport: readStoredBoolean(onboarding.rmSupport ?? (onboarding as { rm_support?: unknown }).rm_support),
    leadReversal: readStoredBoolean(
      onboarding.leadReversal ?? (onboarding as { lead_reversal_offered?: unknown }).lead_reversal_offered,
    ),
    durationStart: onboarding.durationStart ? String(onboarding.durationStart).slice(0, 10) : "",
    durationEnd: onboarding.durationEnd ? String(onboarding.durationEnd).slice(0, 10) : "",
    assuredBookings: onboarding.assuredBookings != null ? Number(onboarding.assuredBookings) : null,
    avgRevenueTarget: onboarding.avgRevenueTarget != null ? Number(onboarding.avgRevenueTarget) : null,
  };
}
