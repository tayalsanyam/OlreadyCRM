"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { OnboardingChecklist1 } from "@/components/sales/checklists/OnboardingChecklist1";
import { OnboardingChecklist2 } from "@/components/sales/checklists/OnboardingChecklist2";
import { TrainingChecklist } from "@/components/sales/checklists/TrainingChecklist";
import type { Region } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "checklist1", label: "Checklist 1", subtitle: "Profile info" },
  { key: "checklist2", label: "Checklist 2", subtitle: "Plan details" },
  { key: "training", label: "Training", subtitle: "MUA walkthrough" },
] as const;

function nextIncompleteStep(
  checklist1Complete: boolean,
  checklist2Complete: boolean,
  trainingComplete: boolean,
): number {
  if (!checklist1Complete) return 0;
  if (!checklist2Complete) return 1;
  if (!trainingComplete) return 2;
  return 0;
}

export function OnboardingChecklistFlow({
  pipelineId,
  onboarding,
  training,
  activation,
  artistCity,
  artistRegions,
  pipelineStage,
  onSaved,
}: {
  pipelineId: string;
  onboarding?: Record<string, unknown> | null;
  training?: Record<string, unknown> | null;
  activation?: Record<string, unknown> | null;
  artistCity?: string;
  artistRegions?: Region[];
  pipelineStage?: string;
  onSaved: () => void;
}) {
  const checklist1Complete = Boolean(onboarding?.checklist1Complete);
  const checklist2Complete = Boolean(onboarding?.checklist2Complete);
  const trainingComplete = Boolean(training?.complete);
  const allComplete = checklist1Complete && checklist2Complete && trainingComplete;
  const sentBackNote = String(activation?.sentBackNote ?? activation?.sent_back_note ?? "").trim();
  const sentBackAt = activation?.sentBackAt ?? activation?.sent_back_at;
  const showSendBackBanner = Boolean(sentBackAt) && !trainingComplete && Boolean(sentBackNote);

  const suggestedStep = useMemo(
    () => nextIncompleteStep(checklist1Complete, checklist2Complete, trainingComplete),
    [checklist1Complete, checklist2Complete, trainingComplete],
  );

  const [selectedStep, setSelectedStep] = useState(suggestedStep);
  const prevSuggested = useRef(suggestedStep);

  useEffect(() => {
    setSelectedStep(suggestedStep);
    prevSuggested.current = suggestedStep;
  }, [pipelineId]);

  useEffect(() => {
    if (suggestedStep > prevSuggested.current) {
      setSelectedStep(suggestedStep);
    }
    prevSuggested.current = suggestedStep;
  }, [suggestedStep]);

  const trainingReady = checklist1Complete && checklist2Complete;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-muted">
        Tap any step to open and cross-check — completed steps stay editable.
      </p>

      {showSendBackBanner ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Activation issues — fix training</p>
          <p className="mt-1 text-xs">
            {sentBackAt ? `On ${new Date(String(sentBackAt)).toLocaleString("en-IN")}. ` : ""}
            Fix the training checklist below, then save to return this MUA to activation.
          </p>
          <p className="mt-2 rounded-md border border-amber-200 bg-white px-2 py-1.5 text-xs">
            <span className="font-medium">Reason:</span> {sentBackNote}
          </p>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        {STEPS.map((step, index) => {
          const done =
            index === 0 ? checklist1Complete : index === 1 ? checklist2Complete : trainingComplete;
          const selected = selectedStep === index;
          return (
            <button
              key={step.key}
              type="button"
              onClick={() => setSelectedStep(index)}
              className={cn(
                "rounded-lg border px-3 py-2 text-left text-xs transition",
                selected
                  ? "border-violet-400 bg-violet-50 text-violet-950 ring-1 ring-violet-200"
                  : done
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-300"
                    : "border-slate-200 bg-slate-50 text-slate-muted hover:border-slate-300",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                    done
                      ? "bg-emerald-600 text-white"
                      : selected
                        ? "bg-violet-600 text-white"
                        : "bg-slate-200 text-slate-600",
                  )}
                >
                  {done ? "✓" : index + 1}
                </span>
                <div>
                  <p className="font-semibold">{step.label}</p>
                  <p className="text-[11px] opacity-80">
                    {done ? "Complete — tap to review" : step.subtitle}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {allComplete ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-semibold">All onboarding steps complete</p>
          <p className="mt-1 text-xs">
            {pipelineStage === "Onboarding"
              ? "The deal should move to Deal Closed automatically. Refresh if the stage has not updated yet."
              : pipelineStage === "Deal Closed"
                ? "Deal closed — forwarded to activation."
                : "Training and checklists are done."}
          </p>
        </div>
      ) : null}

      <div className={selectedStep === 0 ? "" : "hidden"}>
        <OnboardingChecklist1 pipelineId={pipelineId} initial={onboarding} onSaved={onSaved} />
      </div>

      <div className={selectedStep === 1 ? "" : "hidden"}>
        <OnboardingChecklist2
          pipelineId={pipelineId}
          initial={onboarding}
          artistCity={artistCity}
          artistRegions={artistRegions}
          onSaved={onSaved}
        />
      </div>

      <div className={selectedStep === 2 ? "" : "hidden"}>
        <TrainingChecklist
          pipelineId={pipelineId}
          initial={training}
          checklistReady={trainingReady || trainingComplete}
          sendBackNote={showSendBackBanner ? sentBackNote : null}
          onSaved={onSaved}
        />
      </div>
    </div>
  );
}
