"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";
import {
  MUA_PUSH_STAGE_LABELS,
  TASK_TYPE_LABELS,
  type BrideConfirmationOutcome,
  type MuaPushStage,
  type Task,
  type TaskCloseOutcome,
} from "@/lib/types";
import { taskRequiresPushCompletion, isFinancialFollowUpTask } from "@/lib/task-utils";
import { INTAKE_MIN_PROFILES } from "@/lib/lead-intake-config";
import type { NotInterestedIntakeMode } from "@/lib/lead-intake-config";
import {
  IntakeConfirmationFields,
} from "@/components/tasks/IntakeConfirmationFields";
import {
  FinancialFollowUpFields,
  type TaskFinancialBookingUpdate,
} from "@/components/tasks/FinancialFollowUpFields";
import type { IntakeConfirmationDraft } from "@/lib/lead-intake-config";
import { normalizePhoneDigits } from "@/lib/validation";

const STAGE_OPTIONS = (Object.keys(MUA_PUSH_STAGE_LABELS) as MuaPushStage[]).map(
  (value) => ({
    value,
    label: MUA_PUSH_STAGE_LABELS[value],
  })
);

const CLOSE_OUTCOMES: { value: TaskCloseOutcome; label: string }[] = [
  { value: "booked", label: "Booked with this MUA" },
  { value: "notSelected", label: "Not selected" },
  { value: "withdrew", label: "Bride withdrew" },
  { value: "notInterested", label: "Not interested in MUA" },
];

export type TaskCompletePayload = {
  note: string;
  completionMode?: "followingUp" | "closing";
  closeOutcome?: TaskCloseOutcome;
  stage?: MuaPushStage;
  nextFollowUpDate?: string;
  prospectInsta?: string;
  prospectPhone?: string;
  prospectCity?: string;
  referralName?: string;
  referralPhone?: string;
  intakeOutcome?: BrideConfirmationOutcome;
  commissionRmId?: string;
  notInterestedMode?: NotInterestedIntakeMode;
  intakeConfirmation?: IntakeConfirmationDraft | null;
  financialUpdates?: TaskFinancialBookingUpdate[];
};

interface TaskCompleteModalProps {
  task: Task;
  onConfirm: (payload: TaskCompletePayload) => Promise<boolean>;
  onClose: () => void;
}

function defaultFollowUpDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function TaskCompleteModal({ task, onConfirm, onClose }: TaskCompleteModalProps) {
  const financialFollowUp = isFinancialFollowUpTask({
    taskType: task.taskType,
    title: task.title,
  });
  const pushFlow = taskRequiresPushCompletion(
    task.taskType,
    task.pushId,
    task.title
  );
  const prospectFlow = task.taskType === "collectMuaProspect";
  const feedbackFollowUp = task.taskType === "feedbackFollowUp";
  const referralFollowUp = task.taskType === "feedbackReferralFollowUp";
  const feedbackTaskFlow = feedbackFollowUp || referralFollowUp;
  const brideConfirmationFlow = task.taskType === "brideConfirmation";
  const shareProfilesFlow = task.taskType === "shareProfiles";
  const leadProgressFlow = task.taskType === "leadProgressFollowUp";
  const intakeTaskFlow =
    brideConfirmationFlow || shareProfilesFlow || leadProgressFlow;

  const [note, setNote] = useState("");
  const [intakeOutcome, setIntakeOutcome] =
    useState<BrideConfirmationOutcome>("confirmed");
  const [notInterestedMode, setNotInterestedMode] =
    useState<NotInterestedIntakeMode>("commission");
  const [commissionRmId, setCommissionRmId] = useState("");
  const [confirmationDraft, setConfirmationDraft] =
    useState<IntakeConfirmationDraft | null>(null);
  const [commissionRms, setCommissionRms] = useState<{ id: string; name: string }[]>(
    []
  );
  const [userRole, setUserRole] = useState<string | null>(null);
  const [completionMode, setCompletionMode] = useState<"followingUp" | "closing">(
    "followingUp"
  );
  const [closeOutcome, setCloseOutcome] = useState<TaskCloseOutcome>("notSelected");
  const [stage, setStage] = useState<MuaPushStage>(
    task.pushStage ?? "followUpDone"
  );
  const [nextFollowUpDate, setNextFollowUpDate] = useState(defaultFollowUpDate);
  const [prospectInsta, setProspectInsta] = useState("");
  const [prospectPhone, setProspectPhone] = useState("");
  const [prospectCity, setProspectCity] = useState("");
  const [referralName, setReferralName] = useState("");
  const [referralPhone, setReferralPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [financialUpdates, setFinancialUpdates] = useState<
    TaskFinancialBookingUpdate[]
  >([]);
  const [financialFormValid, setFinancialFormValid] = useState(true);

  useEffect(() => {
    void fetch("/api/auth/session")
      .then((r) => r.json())
      .then((json: { data?: { role?: string } }) => setUserRole(json.data?.role ?? null));
  }, []);

  const isCommissionRm = userRole === "commissionRm";

  useEffect(() => {
    if (isCommissionRm) setNotInterestedMode("archive");
  }, [isCommissionRm]);

  useEffect(() => {
    if (!brideConfirmationFlow || intakeOutcome !== "not_interested") return;
    if (notInterestedMode !== "commission") return;
    void fetch("/api/staff/commission-rms")
      .then((r) => r.json())
      .then((json: { data: { id: string; name: string }[] }) =>
        setCommissionRms(json.data ?? [])
      );
  }, [brideConfirmationFlow, intakeOutcome, notInterestedMode]);

  const profilesShared = task.activeDistinctMuas ?? 0;

  const noteOk = note.trim().length >= 10;
  const referralCollected =
    referralFollowUp &&
    referralName.trim().length > 0 &&
    referralPhone.replace(/\D/g, "").length >= 10;
  const prospectOk =
    !prospectFlow ||
    (prospectCity.trim().length > 0 &&
      (prospectInsta.trim().length > 0 || prospectPhone.trim().length > 0));
  const pushOk =
    !pushFlow ||
    (completionMode === "closing"
      ? Boolean(closeOutcome)
      : Boolean(stage) && Boolean(nextFollowUpDate));
  const feedbackOk =
    !feedbackTaskFlow ||
    referralCollected ||
    (completionMode === "followingUp" && Boolean(nextFollowUpDate)) ||
    completionMode === "closing";
  const intakeOk =
    !brideConfirmationFlow ||
    (intakeOutcome === "no_answer"
      ? Boolean(nextFollowUpDate)
      : intakeOutcome === "not_interested"
        ? notInterestedMode === "archive" ||
          (notInterestedMode === "commission" &&
            (commissionRms.length === 0 || Boolean(commissionRmId)))
        : true);
  const shareOk =
    !shareProfilesFlow || profilesShared >= INTAKE_MIN_PROFILES;
  const financialOk = !financialFollowUp || (noteOk && financialFormValid);
  const canSubmit =
    (feedbackTaskFlow ? note.trim().length >= 3 : noteOk) &&
    prospectOk &&
    pushOk &&
    feedbackOk &&
    intakeOk &&
    shareOk &&
    financialOk;

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const ok = await onConfirm({
        note: note.trim(),
        ...(pushFlow
          ? completionMode === "closing"
            ? { completionMode: "closing", closeOutcome }
            : { completionMode: "followingUp", stage, nextFollowUpDate }
          : {}),
        ...(prospectFlow
          ? {
              prospectInsta: prospectInsta.trim() || undefined,
              prospectPhone: prospectPhone.trim()
                ? normalizePhoneDigits(prospectPhone)
                : undefined,
              prospectCity: prospectCity.trim(),
            }
          : {}),
        ...(feedbackTaskFlow
          ? {
              completionMode: referralCollected ? undefined : completionMode,
              nextFollowUpDate:
                completionMode === "followingUp" && !referralCollected
                  ? nextFollowUpDate
                  : undefined,
            }
          : {}),
        ...(referralCollected
          ? {
              referralName: referralName.trim(),
              referralPhone: normalizePhoneDigits(referralPhone),
            }
          : {}),
        ...(brideConfirmationFlow
          ? {
              intakeOutcome,
              commissionRmId: commissionRmId || undefined,
              notInterestedMode:
                intakeOutcome === "not_interested" ? notInterestedMode : undefined,
              nextFollowUpDate:
                intakeOutcome === "no_answer" ? nextFollowUpDate : undefined,
              intakeConfirmation:
                intakeOutcome === "confirmed" ? confirmationDraft : undefined,
            }
          : {}),
        ...(financialFollowUp
          ? {
              financialUpdates,
              ...(nextFollowUpDate ? { nextFollowUpDate } : {}),
            }
          : {}),
      });
      if (ok) onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Complete task"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={busy || !canSubmit}>
            Mark done
          </Button>
        </>
      }
    >
      <div className="mb-4 rounded-lg bg-light-bg px-3 py-2 text-sm">
        <p className="font-medium text-text">{task.title}</p>
        <p className="mt-1 text-slate-muted">
          {TASK_TYPE_LABELS[task.taskType] ?? task.taskType}
          {task.muaName ? ` · ${task.muaName}` : ""}
          {task.leadName ? ` · ${task.leadName}` : ""}
          {task.brideDisplayId ? ` (${task.brideDisplayId})` : ""}
        </p>
        {pushFlow && task.pushStage && (
          <p className="mt-1 text-xs text-slate-muted">
            Current stage: {MUA_PUSH_STAGE_LABELS[task.pushStage]}
          </p>
        )}
      </div>

      {prospectFlow && (
        <>
          <Input
            label="Instagram handle *"
            value={prospectInsta}
            onChange={(e) => setProspectInsta(e.target.value)}
            placeholder="@mua_handle"
            className="mb-4"
          />
          <Input
            label="Phone (if no Insta)"
            value={prospectPhone}
            onChange={(e) => setProspectPhone(e.target.value)}
            className="mb-4"
          />
          <Input
            label="City *"
            value={prospectCity}
            onChange={(e) => setProspectCity(e.target.value)}
            className="mb-4"
          />
        </>
      )}

      {brideConfirmationFlow && (
        <>
          <p className="mb-2 text-sm font-medium text-text">Call outcome</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {(
              [
                ["confirmed", "Requirements confirmed"],
                ["no_answer", "No answer — call back"],
                ["not_interested", "Not interested"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setIntakeOutcome(value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  intakeOutcome === value
                    ? "border-brand bg-brand text-white"
                    : "border-slate-200 text-slate-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {intakeOutcome === "no_answer" && (
            <>
              <p className="mb-3 text-xs text-amber-800">
                Log each no-answer on a different day. After 2 attempts the lead is
                marked not answering and sent to uploader review.
              </p>
              <Input
                label="Call back date *"
                type="date"
                value={nextFollowUpDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setNextFollowUpDate(e.target.value)}
                className="mb-4"
              />
            </>
          )}
          {intakeOutcome === "confirmed" && task.leadId && (
            <IntakeConfirmationFields
              leadId={task.leadId}
              onChange={setConfirmationDraft}
            />
          )}
          {intakeOutcome === "not_interested" && (
            <>
              <p className="mb-2 text-sm font-medium text-text">Close as</p>
              <div className="mb-4 flex flex-wrap gap-2">
                {!isCommissionRm && (
                  <button
                    type="button"
                    onClick={() => setNotInterestedMode("commission")}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      notInterestedMode === "commission"
                        ? "border-brand bg-brand text-white"
                        : "border-slate-200 text-slate-muted"
                    }`}
                  >
                    Shift to Commission RM
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setNotInterestedMode("archive")}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    notInterestedMode === "archive"
                      ? "border-accent bg-accent text-white"
                      : "border-slate-200 text-slate-muted"
                  }`}
                >
                  Closed / not interested
                </button>
              </div>
              {notInterestedMode === "commission" && commissionRms.length > 0 && (
                <label className="mb-4 flex flex-col gap-1 text-sm">
                  <span className="text-slate-muted">Commission RM *</span>
                  <select
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={commissionRmId}
                    onChange={(e) => setCommissionRmId(e.target.value)}
                  >
                    <option value="">Select Commission RM…</option>
                    {commissionRms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </>
      )}

      {shareProfilesFlow && (
        <div className="mb-4 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-sm">
          <p className="font-medium text-brand">
            Profiles shared: {profilesShared} / {INTAKE_MIN_PROFILES}
          </p>
          <p className="mt-1 text-slate-muted">
            Push active MUA profiles on the lead. This task auto-completes at{" "}
            {INTAKE_MIN_PROFILES} distinct MUAs.
          </p>
        </div>
      )}

      {leadProgressFlow && (
        <p className="mb-4 text-sm text-slate-muted">
          Update the bride on progress across MUAs and next steps.
        </p>
      )}

      {financialFollowUp && (
        <>
          <FinancialFollowUpFields
            task={task}
            onChange={setFinancialUpdates}
            onValidChange={setFinancialFormValid}
          />
          <Input
            label="Next task follow-up date (optional)"
            type="date"
            value={nextFollowUpDate}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setNextFollowUpDate(e.target.value)}
            className="mb-4"
          />
        </>
      )}

      {referralFollowUp && task.referralIntakeNote && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <p className="font-medium text-brand">Friends / family note</p>
          <p className="mt-1 whitespace-pre-wrap text-slate-700">{task.referralIntakeNote}</p>
        </div>
      )}

      {feedbackTaskFlow && (
        <>
          <p className="mb-2 text-sm font-medium text-text">Outcome</p>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCompletionMode("followingUp")}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                completionMode === "followingUp"
                  ? "border-brand bg-brand text-white"
                  : "border-slate-200 text-slate-muted"
              }`}
            >
              Couldn&apos;t reach — call again
            </button>
            <button
              type="button"
              onClick={() => setCompletionMode("closing")}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                completionMode === "closing"
                  ? "border-accent bg-accent text-white"
                  : "border-slate-200 text-slate-muted"
              }`}
            >
              {referralFollowUp
                ? "No referral / close"
                : feedbackFollowUp
                  ? "Closed — no contact"
                  : "Done — no further call"}
            </button>
          </div>
          {completionMode === "followingUp" && !referralCollected && (
            <Input
              label="Next follow-up date *"
              type="date"
              value={nextFollowUpDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setNextFollowUpDate(e.target.value)}
              className="mb-4"
            />
          )}
        </>
      )}

      {referralFollowUp && (
        <div className="mb-4 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
          <p className="text-sm font-medium text-emerald-950">
            Got referral contact? (sends to upload queue)
          </p>
          <Input
            label="Referral name"
            value={referralName}
            onChange={(e) => setReferralName(e.target.value)}
          />
          <Input
            label="Referral phone"
            value={referralPhone}
            onChange={(e) => setReferralPhone(e.target.value)}
          />
        </div>
      )}

      {pushFlow && (
        <>
          <p className="mb-2 text-sm font-medium text-text">Outcome</p>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCompletionMode("followingUp")}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                completionMode === "followingUp"
                  ? "border-brand bg-brand text-white"
                  : "border-slate-200 text-slate-muted"
              }`}
            >
              Following up
            </button>
            <button
              type="button"
              onClick={() => setCompletionMode("closing")}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                completionMode === "closing"
                  ? "border-accent bg-accent text-white"
                  : "border-slate-200 text-slate-muted"
              }`}
            >
              Closing conversation
            </button>
          </div>
          {completionMode === "followingUp" ? (
            <>
              <Select
                label="Update MUA push stage *"
                options={STAGE_OPTIONS}
                value={stage}
                onChange={(e) => setStage(e.target.value as MuaPushStage)}
                className="mb-4"
              />
              <Input
                label="Next follow-up date *"
                type="date"
                value={nextFollowUpDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setNextFollowUpDate(e.target.value)}
                className="mb-4"
              />
            </>
          ) : (
            <Select
              label="Close reason *"
              options={CLOSE_OUTCOMES.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              value={closeOutcome}
              onChange={(e) =>
                setCloseOutcome(e.target.value as TaskCloseOutcome)
              }
              className="mb-4"
            />
          )}
        </>
      )}

      {pushFlow ? (
        <WhatsAppComposer
          dualAudience
          defaultAudience="mua"
          phone={task.muaPhone}
          whatsapp={task.muaWhatsapp}
          bridePhone={task.leadPhone}
          leadId={task.leadId ?? undefined}
          muaId={task.muaId ?? undefined}
          pushStage={
            completionMode === "followingUp"
              ? stage
              : (task.pushStage ?? stage)
          }
          context={{
            muaName: task.muaName,
            brideName: task.leadName,
            city: task.leadCity,
          }}
          templatePool="rmMua"
          allowCustomMessage
          className="mb-4"
        />
      ) : financialFollowUp && (task.muaPhone || task.leadPhone) ? (
        <WhatsAppComposer
          dualAudience
          defaultAudience="mua"
          phone={task.muaPhone}
          whatsapp={task.muaWhatsapp}
          bridePhone={task.leadPhone}
          leadId={task.leadId ?? undefined}
          muaId={task.muaId ?? undefined}
          context={{
            muaName: task.muaName,
            brideName: task.leadName,
            city: task.leadCity,
          }}
          templatePool="rmMua"
          allowCustomMessage
          className="mb-4"
        />
      ) : feedbackTaskFlow && task.leadPhone ? (
        <WhatsAppComposer
          audience="bride"
          bridePhone={task.leadPhone}
          leadId={task.leadId ?? undefined}
          context={{ brideName: task.leadName }}
          templatePool="feedback"
          allowCustomMessage
          className="mb-4"
        />
      ) : intakeTaskFlow && task.leadPhone ? (
        <WhatsAppComposer
          audience="bride"
          bridePhone={task.leadPhone}
          leadId={task.leadId ?? undefined}
          context={{ brideName: task.leadName }}
          templatePool="rmBride"
          preferredTemplateId={
            brideConfirmationFlow
              ? "rm-bride-confirm-req"
              : shareProfilesFlow
                ? "rm-bride-profiles"
                : "rm-bride-no-response"
          }
          allowCustomMessage
          className="mb-4"
        />
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-text">
          {pushFlow || prospectFlow || financialFollowUp
            ? "What happened? *"
            : feedbackTaskFlow
              ? "Call notes *"
              : "Completion notes *"}
        </span>
        <textarea
          className="min-h-[100px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder={
            feedbackTaskFlow ? "Min 3 characters" : "Min 10 characters"
          }
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {note.length > 0 &&
          note.length < (feedbackTaskFlow ? 3 : 10) && (
          <span className="mt-1 text-xs text-red-600">
            Min {feedbackTaskFlow ? 3 : 10} characters
          </span>
        )}
      </label>
    </Modal>
  );
}
