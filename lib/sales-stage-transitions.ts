import { PIPELINE_STAGE_ORDER, type PipelineStage } from "@/lib/types";

/** Set only via TL senior-call task completion — not manual stage change. */
export const MANUAL_STAGE_CHANGE_EXCLUDED: readonly PipelineStage[] = [
  "Senior Call Done",
  "Part Payment",
  "Onboarding",
];

export function isManualStageChangeTarget(stage: PipelineStage): boolean {
  return !MANUAL_STAGE_CHANGE_EXCLUDED.includes(stage);
}

/** Stages a user may pick when changing pipeline stage (UI + API). */
export function getManualStageChangeOptions(excludeStage?: PipelineStage): PipelineStage[] {
  return PIPELINE_STAGE_ORDER.filter((s) => isManualStageChangeTarget(s) && s !== excludeStage);
}

/** Kanban column / filter order only — not a required deal progression. */
export function isPipelineStage(stage: string): stage is PipelineStage {
  return PIPELINE_STAGE_ORDER.includes(stage as PipelineStage);
}

/** Any valid stage except the current one. Deal Closed is terminal. */
export function canPipelineTransition(fromStage: PipelineStage, toStage: PipelineStage): boolean {
  if (fromStage === toStage) return false;
  if (fromStage === "Deal Closed") return false;
  if (fromStage === "Onboarding") return toStage === "Rejected";
  if (!isManualStageChangeTarget(toStage)) return false;
  return isPipelineStage(toStage);
}

export function getPipelineAllowedNext(fromStage: PipelineStage): PipelineStage[] {
  return getManualStageChangeOptions(fromStage);
}
