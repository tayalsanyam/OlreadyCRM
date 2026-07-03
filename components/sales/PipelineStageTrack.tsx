"use client";

import { cn } from "@/lib/utils";
import { PIPELINE_STAGE_ORDER, type PipelineStage } from "@/lib/types";

export function PipelineStageTrack({ current }: { current: PipelineStage }) {
  const currentIdx = PIPELINE_STAGE_ORDER.indexOf(current);

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max items-center">
        {PIPELINE_STAGE_ORDER.map((stage, i) => {
          const isCurrent = stage === current;
          const isPast = currentIdx >= 0 && i < currentIdx;

          return (
            <div key={stage} className="flex items-center">
              <div
                className={cn(
                  "whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-medium transition",
                  isCurrent && "bg-brand text-white shadow-sm",
                  isPast && !isCurrent && "bg-brand/10 text-brand",
                  !isCurrent && !isPast && "border border-slate-200 bg-slate-50 text-slate-500"
                )}
                title={stage}
              >
                {isCurrent ? stage : stage.split(" ")[0]}
              </div>
              {i < PIPELINE_STAGE_ORDER.length - 1 ? (
                <div
                  className={cn("h-px w-2 shrink-0 sm:w-3", isPast ? "bg-brand/30" : "bg-slate-200")}
                  aria-hidden
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
