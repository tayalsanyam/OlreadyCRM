import type { PipelineStage } from "@/lib/types";

/** Paid deal — RM completing onboarding checklists / training. */
export const ONBOARDING_STAGE: PipelineStage = "Onboarding";

/** Final sales stage after onboarding is complete. */
export const DEAL_CLOSED_STAGE: PipelineStage = "Deal Closed";

/** Stages that count as a closed deal for targets and reporting. */
export const CLOSED_DEAL_STAGES: PipelineStage[] = ["Onboarding", "Deal Closed"];

export function isClosedDealStage(stage: PipelineStage | string): boolean {
  return CLOSED_DEAL_STAGES.includes(stage as PipelineStage);
}
