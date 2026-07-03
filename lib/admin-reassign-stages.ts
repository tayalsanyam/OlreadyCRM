import { PIPELINE_STAGE_ORDER, type PipelineStage } from "@/lib/types";
import { isManualStageChangeTarget } from "@/lib/sales-stage-transitions";

const ADMIN_REASSIGN_STAGES = new Set<PipelineStage>(
  PIPELINE_STAGE_ORDER.filter(
    (s) => s !== "Deal Closed" && s !== "Rejected" && isManualStageChangeTarget(s),
  ),
);

export const ADMIN_REASSIGN_STAGE_OPTIONS = PIPELINE_STAGE_ORDER.filter(
  (s) => s !== "Deal Closed" && s !== "Rejected" && isManualStageChangeTarget(s),
);

export function parseAdminReassignStage(raw: string | null | undefined): PipelineStage | null {
  if (!raw) return null;
  return ADMIN_REASSIGN_STAGES.has(raw as PipelineStage) ? (raw as PipelineStage) : null;
}
