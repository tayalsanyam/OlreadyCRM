"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface ImportWizardProps {
  steps: string[];
  currentStep: number;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  hideFooter?: boolean;
}

export function ImportWizard({
  steps,
  currentStep,
  children,
  onBack,
  onNext,
  nextLabel = "Next →",
  backLabel = "← Back",
  nextDisabled = false,
  hideFooter = false,
}: ImportWizardProps) {
  return (
    <div className="mx-auto w-full max-w-[900px] rounded-2xl bg-white shadow-lg">
      <div className="border-b border-slate-100 px-6 py-5">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
          {steps.map((label, i) => {
            const done = i < currentStep;
            const current = i === currentStep;
            return (
              <div key={label} className="flex items-center gap-2">
                {i > 0 && (
                  <span className="hidden h-px w-6 bg-slate-200 sm:block" />
                )}
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                    done && "bg-brand text-white",
                    current && "bg-accent text-white",
                    !done && !current && "bg-slate-100 text-slate-400"
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "text-xs font-medium sm:text-sm",
                    current ? "text-accent" : done ? "text-brand" : "text-slate-400"
                  )}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="max-h-[min(70vh,640px)] overflow-y-auto px-6 py-5">{children}</div>

      {!hideFooter && (
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          {onBack ? (
            <Button type="button" variant="ghost" onClick={onBack}>
              {backLabel}
            </Button>
          ) : (
            <span />
          )}
          {onNext && (
            <Button type="button" onClick={onNext} disabled={nextDisabled}>
              {nextLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
