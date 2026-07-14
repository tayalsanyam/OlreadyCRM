import type { PipelineStage } from "@/lib/types";
import {
  normalizePlansShared,
  type PlanSharedRow,
  type SalesPlanDetailsInput,
} from "@/lib/sales-plan-details";

export type StageLogMetadata = {
  plansShared?: PlanSharedRow[];
  plan?: string | null;
  quotedAmount?: number | null;
  paymentAmount?: number | null;
  leadCap?: number | null;
};

export function buildStageLogMetadata(
  toStage: PipelineStage,
  payload: {
    plansShared?: PlanSharedRow[];
    planDetails?: SalesPlanDetailsInput;
    quotedAmount?: number;
    paymentDetails?: { amount?: number };
  },
): StageLogMetadata | null {
  if (toStage === "Details Shared") {
    const plansShared = normalizePlansShared(payload.plansShared);
    if (!plansShared.length) return null;
    return { plansShared };
  }
  if (toStage === "Confirm" || toStage === "Deal Closed" || toStage === "Onboarding" || toStage === "Part Payment") {
    const plan = payload.planDetails?.plan?.trim() || null;
    const quotedAmount = Number(payload.quotedAmount ?? 0) || null;
    const leadCap = payload.planDetails?.leadCap ?? null;
    if (!plan && !quotedAmount) return null;
    const paymentAmount =
      toStage === "Deal Closed" || toStage === "Onboarding" || toStage === "Part Payment"
        ? Number(payload.paymentDetails?.amount ?? 0) || null
        : null;
    return {
      plan,
      quotedAmount,
      paymentAmount,
      leadCap,
    };
  }
  return null;
}

export function formatStageLogPlanSummary(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = metadata as StageLogMetadata;
  const plansShared = normalizePlansShared(raw.plansShared);
  if (plansShared.length) {
    return plansShared
      .map((p) => `${p.plan}: ₹${p.amount.toLocaleString("en-IN")}`)
      .join(" · ");
  }
  const plan = raw.plan?.trim();
  const amount = Number(raw.quotedAmount ?? raw.paymentAmount ?? 0);
  if (plan && amount > 0) return `${plan} · ₹${amount.toLocaleString("en-IN")}`;
  if (amount > 0) return `₹${amount.toLocaleString("en-IN")}`;
  if (plan) return plan;
  return null;
}
