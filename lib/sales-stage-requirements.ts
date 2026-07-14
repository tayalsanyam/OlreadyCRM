import type { PipelineStage } from "@/lib/types";

/** Stages that need plan/payment fields in the stage change panel. */
export const STAGES_WITH_PLAN_PAYLOAD: PipelineStage[] = [
  "Details Shared",
  "Confirm",
  "Deal Closed",
  "Rejected",
];

export function stageRequiresPlanPayload(stage: PipelineStage): boolean {
  return STAGES_WITH_PLAN_PAYLOAD.includes(stage);
}

export function stageRequiresNextTouchPoint(stage: PipelineStage): boolean {
  return stage !== "Rejected" && stage !== "Deal Closed" && stage !== "Onboarding";
}
