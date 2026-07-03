"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";
import { TASK_TYPE_LABELS, type PipelineStage } from "@/lib/types";
import {
  stageRequiresNextTouchPoint,
  stageRequiresPlanPayload,
} from "@/lib/sales-stage-requirements";
import { getManualStageChangeOptions } from "@/lib/sales-stage-transitions";

export type TaskCompletePayload = {
  note: string;
  nextFollowUpDate?: string;
  stageChangeTo?: PipelineStage;
  stageChangeNote?: string;
};

export function SalesTaskCompleteModal({
  open,
  title,
  taskType,
  pipelineId,
  currentStage,
  muaName,
  muaPhone,
  muaWhatsapp,
  muaCity,
  locked,
  hideStageChange = false,
  onClose,
  onConfirm,
  onRequireStagePanel,
  initialNextFollowUpDate = "",
}: {
  open: boolean;
  title: string;
  taskType: string;
  pipelineId?: string | null;
  currentStage?: PipelineStage | null;
  muaName?: string | null;
  muaPhone?: string | null;
  muaWhatsapp?: string | null;
  muaCity?: string | null;
  locked?: boolean;
  hideStageChange?: boolean;
  onClose: () => void;
  onConfirm: (payload: TaskCompletePayload) => Promise<boolean>;
  /** Opens stage panel for Details Shared / Confirm / Deal Closed / Rejected */
  onRequireStagePanel: (payload: TaskCompletePayload) => void;
  initialNextFollowUpDate?: string;
}) {
  const [note, setNote] = useState("");
  const [nextFollowUpDate, setNextFollowUpDate] = useState("");
  const [changeStage, setChangeStage] = useState(false);
  const [stageChangeTo, setStageChangeTo] = useState<PipelineStage | "">("");
  const [stageChangeNote, setStageChangeNote] = useState("");
  const [busy, setBusy] = useState(false);
  const isSeniorCallTask = taskType === "salesSeniorCall";
  const isOnboardingTask = taskType === "salesOnboarding";
  const canScheduleNext = taskType === "salesFollowUp" || taskType === "salesSeniorCall";
  const canChangeStage = Boolean(pipelineId) && canScheduleNext && !isSeniorCallTask && !hideStageChange;
  const stageOptions = getManualStageChangeOptions(currentStage ?? undefined);
  const opensStagePanel =
    changeStage &&
    Boolean(stageChangeTo) &&
    stageChangeTo !== currentStage &&
    stageRequiresPlanPayload(stageChangeTo as PipelineStage);
  const singleNoteForStage =
    changeStage && Boolean(stageChangeTo) && stageChangeTo !== currentStage && !opensStagePanel;
  const stageChangeInvalid =
    changeStage &&
    (!stageChangeTo ||
      stageChangeTo === currentStage ||
      (singleNoteForStage && note.trim().length < 10));
  const nextFollowUpRequired =
    (canScheduleNext && !opensStagePanel && (!changeStage || !stageChangeTo || stageRequiresNextTouchPoint(stageChangeTo as PipelineStage))) ||
    isSeniorCallTask;
  const submitLabel = opensStagePanel
    ? "Continue to stage details"
    : isOnboardingTask
      ? "Complete & open checklist"
      : "Complete";

  useEffect(() => {
    if (!open) return;
    setNote("");
    setNextFollowUpDate(initialNextFollowUpDate);
    setChangeStage(false);
    setStageChangeTo("");
    setStageChangeNote("");
  }, [open, initialNextFollowUpDate]);

  async function submit() {
    if (locked || note.trim().length < 10) return;
    if (nextFollowUpRequired && !nextFollowUpDate) return;
    if (stageChangeInvalid) return;

    const payload: TaskCompletePayload = {
      note: note.trim(),
      nextFollowUpDate: canScheduleNext && nextFollowUpDate ? nextFollowUpDate : undefined,
      stageChangeTo: changeStage && stageChangeTo ? stageChangeTo : undefined,
      stageChangeNote:
        changeStage && stageChangeTo
          ? singleNoteForStage
            ? note.trim()
            : stageChangeNote.trim() || undefined
          : undefined,
    };

    if (payload.stageChangeTo && stageRequiresPlanPayload(payload.stageChangeTo)) {
      onRequireStagePanel(payload);
      return;
    }

    setBusy(true);
    const ok = await onConfirm(payload);
    setBusy(false);
    if (ok) {
      setNote("");
      setNextFollowUpDate("");
      setChangeStage(false);
      setStageChangeTo("");
      setStageChangeNote("");
      onClose();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Complete task"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={
              locked ||
              note.trim().length < 10 ||
              (nextFollowUpRequired && !nextFollowUpDate) ||
              stageChangeInvalid ||
              busy
            }
          >
            {busy ? "Saving…" : submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm font-medium text-text">{title}</p>
        <p className="text-xs text-slate-muted">{TASK_TYPE_LABELS[taskType as keyof typeof TASK_TYPE_LABELS] ?? taskType}</p>
        {locked ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
            Senior Call tasks can only be completed by your Team Lead.
          </p>
        ) : (
          <>
            {isOnboardingTask ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-950">
                Completing this opens the onboarding checklist for this MUA so you can fill plan details and training steps.
              </p>
            ) : null}
            {isSeniorCallTask ? (
              <p className="rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-sm text-indigo-950">
                Completing this moves the deal to <span className="font-semibold">Senior Call Done</span> and creates a
                follow-up task for the RM with your notes.
              </p>
            ) : null}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-text">
                {isSeniorCallTask
                  ? "Senior call notes for RM *"
                  : singleNoteForStage
                    ? "Task & stage update notes * (min 10 characters)"
                    : "Completion notes * (min 10 characters)"}
              </span>
              <textarea
                className="min-h-[96px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  isSeniorCallTask
                    ? "Summary, objections, pricing guidance, next steps for RM…"
                    : singleNoteForStage
                      ? "What you did on this task and why you are moving the stage…"
                      : "What you completed on this follow-up…"
                }
              />
            </label>
          </>
        )}
        {!locked && canScheduleNext && !opensStagePanel ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-text">
              {isSeniorCallTask ? "RM next follow-up date *" : `Next follow-up date ${nextFollowUpRequired ? "*" : "(optional)"}`}
            </span>
            <input
              type="date"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={nextFollowUpDate}
              onChange={(e) => setNextFollowUpDate(e.target.value)}
            />
          </label>
        ) : null}
        {!locked && opensStagePanel ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-muted">
            Next step: plan/payment fields and stage note on the following screen.
          </p>
        ) : null}
        {!locked && canChangeStage ? (
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={changeStage}
                onChange={(e) => setChangeStage(e.target.checked)}
              />
              Change stage in this task completion
            </label>
            {changeStage ? (
              <div className="space-y-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-text">Move to stage *</span>
                  <select
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={stageChangeTo}
                    onChange={(e) => setStageChangeTo(e.target.value as PipelineStage)}
                  >
                    <option value="">Select stage</option>
                    {stageOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                {opensStagePanel ? (
                  <p className="text-xs text-slate-muted">
                    Plan/payment details and stage note come on the next screen — click Continue when ready.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {!locked && pipelineId ? (
          <WhatsAppComposer
            audience="mua"
            phone={muaPhone}
            whatsapp={muaWhatsapp}
            pipelineId={pipelineId}
            pipelineStage={changeStage && stageChangeTo ? (stageChangeTo as PipelineStage) : currentStage}
            context={{ muaName, city: muaCity }}
            templatePool="sales"
            allowCustomMessage
          />
        ) : null}
      </div>
    </Modal>
  );
}
