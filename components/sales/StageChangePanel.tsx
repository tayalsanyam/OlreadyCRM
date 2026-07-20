"use client";

import { useEffect, useMemo, useState } from "react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { PipelineStage, Region } from "@/lib/types";
import { resolveMuaRegions } from "@/lib/mua-region";
import { canPipelineTransition, getManualStageChangeOptions } from "@/lib/sales-stage-transitions";
import { stageRequiresNextTouchPoint } from "@/lib/sales-stage-requirements";
import {
  mapOnboardingRow,
  planDetailsFromOnboarding,
  prefillConfirmPlanFromShared,
  resolveQuotedAmountFromPlansShared,
  type PlanSharedRow,
  type SalesPlanDetailsInput,
  validateStagePlanPayload,
} from "@/lib/sales-plan-details";
import { PlanDetailsFields } from "@/components/sales/PlanDetailsFields";
import { PlansSharedEditor } from "@/components/sales/PlansSharedEditor";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";
import { paymentBalanceLabel } from "@/lib/sales-deal-payment";

type PaymentPayload = {
  amount: number;
  paymentDate: string;
  paymentMode: "UPI" | "Cash" | "Bank Transfer" | "Card" | "Other";
  notes?: string;
};

const EMPTY_PLAN: SalesPlanDetailsInput = {
  plan: "",
  leadCap: null,
  leadBudget: "",
  states: [],
  regions: [],
  cities: [],
  socialMedia: "",
  hasSocialMedia: null,
  rmSupport: null,
  leadReversal: null,
  durationStart: "",
  durationEnd: "",
  assuredBookings: null,
  avgRevenueTarget: null,
};

export type StageChangeResult = {
  toStage: PipelineStage;
  onboardingTaskCreated?: boolean;
  totalPaid?: number;
  quotedAmount?: number;
  pendingDiscountApproval?: boolean;
  stageLogId?: string;
};

export function StageChangePanel({
  open,
  onClose,
  pipelineId,
  currentStage,
  onDone,
  prefill,
  lockStage = false,
  initialNote = "",
  initialNextTouch = "",
  panelTitle = "Change Stage",
  submitLabel = "Update stage",
  rescheduleOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  pipelineId: string;
  currentStage: PipelineStage;
  onDone: (result?: StageChangeResult) => void;
  prefill?: PipelineStage;
  lockStage?: boolean;
  initialNote?: string;
  initialNextTouch?: string;
  panelTitle?: string;
  submitLabel?: string;
  rescheduleOnly?: boolean;
}) {
  const [toStage, setToStage] = useState<PipelineStage>(prefill ?? currentStage);
  const [nextTouchPoint, setNextTouchPoint] = useState("");
  const [note, setNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [plansShared, setPlansShared] = useState<PlanSharedRow[]>([]);
  const [planDetails, setPlanDetails] = useState<SalesPlanDetailsInput>(EMPTY_PLAN);
  const [quotedAmount, setQuotedAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState<PaymentPayload["paymentMode"]>("UPI");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [pendingDiscount, setPendingDiscount] = useState<{
    discountAmount: number;
    listPrice: number;
    netQuoted: number;
    reason: string;
  } | null>(null);
  const [muaName, setMuaName] = useState("");
  const [muaPhone, setMuaPhone] = useState<string | null>(null);
  const [muaWhatsapp, setMuaWhatsapp] = useState<string | null>(null);
  const [muaCity, setMuaCity] = useState<string | null>(null);
  const [artistRegions, setArtistRegions] = useState<Region[]>([]);
  const [priorPaid, setPriorPaid] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTerminal = currentStage === "Deal Closed";

  useEffect(() => {
    if (!open) return;
    setToStage(rescheduleOnly ? currentStage : (prefill ?? currentStage));
    setNextTouchPoint(initialNextTouch);
    setNote(initialNote);
    setRejectionReason("");
    setError(null);
    setQuotedAmount("");
    setPaymentAmount("");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMode("UPI");
    setPaymentNotes("");
    setDiscountAmount("");
    setDiscountReason("");
    setPendingDiscount(null);

    (async () => {
      const res = await fetch(`/api/sales/pipeline/${pipelineId}`);
      const json = await res.json().catch(() => ({}));
      const pipeline = json?.data?.pipeline as {
        muaName?: string;
        muaPhone?: string | null;
        whatsapp?: string | null;
        muaCity?: string;
      } | undefined;
      const paymentSummary = json?.data?.paymentSummary as { totalPaid?: number; quotedAmount?: number } | undefined;
      setPriorPaid(Number(paymentSummary?.totalPaid ?? 0));
      const pending = json?.data?.pendingDiscount as
        | {
            discountAmount?: number;
            listPrice?: number;
            netQuoted?: number;
            reason?: string;
          }
        | null
        | undefined;
      setPendingDiscount(
        pending
          ? {
              discountAmount: Number(pending.discountAmount ?? 0),
              listPrice: Number(pending.listPrice ?? 0),
              netQuoted: Number(pending.netQuoted ?? 0),
              reason: String(pending.reason ?? ""),
            }
          : null,
      );
      const muaRegions = (json?.data?.muaRegions ?? []) as Region[];
      setMuaName(pipeline?.muaName ?? "");
      setMuaPhone(pipeline?.muaPhone ?? null);
      setMuaWhatsapp(pipeline?.whatsapp ?? null);
      setMuaCity(pipeline?.muaCity ?? null);
      setArtistRegions(resolveMuaRegions(muaRegions, pipeline?.muaCity ?? ""));
      const onboarding = mapOnboardingRow(json?.data?.onboarding);
      const shared = onboarding?.plansShared ?? [];
      const targetStage = rescheduleOnly ? currentStage : (prefill ?? currentStage);
      let details = planDetailsFromOnboarding(onboarding);
      if (targetStage === "Confirm") {
        details = prefillConfirmPlanFromShared(details, shared);
      }
      setPlansShared(shared);
      setPlanDetails(details);
      const quoted = resolveQuotedAmountFromPlansShared(
        details.plan,
        shared,
        onboarding?.quotedAmount as number | null | undefined,
      );
      if (quoted > 0) {
        setQuotedAmount(String(quoted));
      }
    })();
  }, [open, currentStage, prefill, pipelineId, initialNote, initialNextTouch, rescheduleOnly]);

  useEffect(() => {
    if (!open || toStage !== "Confirm" || planDetails.plan?.trim() || !plansShared.length) return;
    const details = prefillConfirmPlanFromShared(planDetails, plansShared);
    setPlanDetails(details);
    const quoted = resolveQuotedAmountFromPlansShared(details.plan, plansShared);
    if (quoted > 0) setQuotedAmount(String(quoted));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefill when user picks Confirm with empty plan
  }, [open, toStage, plansShared]);

  const validTarget = rescheduleOnly || canPipelineTransition(currentStage, toStage);
  const trimmedNote = note.trim();
  const noteTooShort = trimmedNote.length < 10;

  const planValidationError = useMemo(() => {
    if (!validTarget) return null;
    return validateStagePlanPayload(toStage, {
      plansShared,
      planDetails,
      quotedAmount: Number(quotedAmount) || undefined,
      paymentDetails: {
        amount: Number(paymentAmount) || undefined,
        paymentDate,
        paymentMode,
      },
    });
  }, [validTarget, toStage, plansShared, planDetails, quotedAmount, paymentAmount, paymentDate, paymentMode]);

  const needsPlanExtras =
    !rescheduleOnly &&
    (toStage === "Details Shared" || toStage === "Confirm" || toStage === "Deal Closed");

  const dealPrice = Number(quotedAmount) || 0;
  const discountValue = Number(discountAmount) || 0;
  const netDealPrice = Math.max(0, dealPrice - discountValue);
  const receivedNow = Number(paymentAmount) || 0;
  const cumulativePaid = priorPaid + receivedNow;
  const partialPaymentClose =
    toStage === "Deal Closed" &&
    (discountValue > 0 ? netDealPrice : dealPrice) > 0 &&
    receivedNow > 0 &&
    cumulativePaid + 0.009 < (discountValue > 0 ? netDealPrice : dealPrice);

  const needsNextTouch =
    rescheduleOnly ||
    stageRequiresNextTouchPoint(toStage) ||
    partialPaymentClose;

  const missingRequirements = useMemo(() => {
    const missing: string[] = [];
    if (!validTarget) missing.push("Pick a stage different from the current one");
    if (noteTooShort) missing.push("Note (minimum 10 characters)");
    if (needsNextTouch && !nextTouchPoint) missing.push("Next touch point date");
    if (toStage === "Rejected" && !rejectionReason.trim()) missing.push("Rejection reason");
    if (planValidationError) missing.push(planValidationError);
    if (toStage === "Deal Closed" && pendingDiscount) {
      missing.push("A discount approval is already pending for this deal");
    }
    if (toStage === "Deal Closed" && discountValue > 0 && discountReason.trim().length < 10) {
      missing.push("Discount reason (minimum 10 characters)");
    }
    if (toStage === "Deal Closed" && discountValue > 0 && netDealPrice + 0.009 < priorPaid) {
      missing.push("Net deal price cannot be below amount already received");
    }
    return missing;
  }, [
    validTarget,
    noteTooShort,
    needsNextTouch,
    nextTouchPoint,
    toStage,
    rejectionReason,
    planValidationError,
    pendingDiscount,
    discountValue,
    discountReason,
    netDealPrice,
    priorPaid,
  ]);

  async function submit() {
    if (missingRequirements.length) return;
    setSubmitting(true);
    setError(null);

    const body: Record<string, unknown> = {
      toStage,
      nextTouchPoint: nextTouchPoint || null,
      note,
      rejectionReason: rejectionReason || null,
      rescheduleOnly,
    };

    if (toStage === "Details Shared") {
      body.plansShared = plansShared;
    }
    if (toStage === "Confirm" || toStage === "Deal Closed") {
      body.planDetails = planDetails;
    }
    if (toStage === "Confirm") {
      body.quotedAmount = Number(quotedAmount) || resolveQuotedAmountFromPlansShared(planDetails.plan, plansShared);
    }
    if (toStage === "Deal Closed") {
      body.quotedAmount = dealPrice;
      body.paymentDetails = {
        amount: Number(paymentAmount),
        paymentDate,
        paymentMode,
        notes: paymentNotes.trim() || undefined,
      };
      if (discountValue > 0) {
        body.discountAmount = discountValue;
        body.discountReason = discountReason.trim();
      }
    }

    const res = await fetch(`/api/sales/pipeline/${pipelineId}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) {
      setError(json?.error ?? "Stage update failed");
      return;
    }
    const result = (json?.data ?? null) as StageChangeResult | null;
    if (result?.pendingDiscountApproval) {
      onDone(result);
      onClose();
      return;
    }
    onDone(
      result?.toStage
        ? result
        : { toStage, onboardingTaskCreated: false },
    );
    onClose();
  }

  if (isTerminal) {
    return (
      <SlideOver open={open} onClose={onClose} title="Change Stage">
        <p className="text-sm text-slate-700">
          This deal is closed. Stage cannot be changed. Update plan or payment details from the Checklists tab if needed.
        </p>
      </SlideOver>
    );
  }

  const canSubmit = missingRequirements.length === 0;

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={panelTitle}
      wide={needsPlanExtras}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canSubmit || submitting} onClick={() => void submit()}>
            {submitting ? "Saving…" : submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {rescheduleOnly ? (
          <p className="text-xs text-slate-muted">
            Update the next touch date for <span className="font-medium text-slate-800">{currentStage}</span> without changing stage.
          </p>
        ) : (
          <p className="text-xs text-slate-muted">
            Current: <span className="font-medium text-slate-800">{currentStage}</span>. Stages can move forward or back
            (except from Deal Closed).
          </p>
        )}
        {!rescheduleOnly ? (
        <div className="flex flex-wrap gap-2">
          {getManualStageChangeOptions(currentStage).map((s) => {
            const isCurrent = s === currentStage;
            const disabled = isCurrent || (lockStage && s !== prefill);
            return (
              <button
                key={s}
                type="button"
                disabled={disabled}
                onClick={() => setToStage(s)}
                className={`rounded-full px-3 py-1 text-xs ${
                  toStage === s ? "bg-brand text-white" : "bg-slate-100 text-slate-700"
                } ${disabled ? "cursor-not-allowed opacity-40" : "hover:bg-slate-200"}`}
              >
                {s}
              </button>
            );
          })}
        </div>
        ) : null}

        {toStage === "Details Shared" ? (
          <PlansSharedEditor value={plansShared} onChange={setPlansShared} />
        ) : null}

        {toStage === "Confirm" ? (
          <>
            <PlanDetailsFields
              artistCity={muaCity ?? undefined}
              artistRegions={artistRegions}
              value={planDetails}
              showDealConfirmFields
              onChange={(next) => {
                const prevPlan = planDetails.plan;
                setPlanDetails(next);
                if (next.plan !== prevPlan) {
                  const amount = resolveQuotedAmountFromPlansShared(next.plan, plansShared);
                  if (amount > 0) setQuotedAmount(String(amount));
                }
              }}
            />
            <Input
              label="Quoted / deal amount (INR) *"
              type="number"
              value={quotedAmount}
              onChange={(e) => setQuotedAmount(e.target.value)}
            />
          </>
        ) : null}

        {toStage === "Deal Closed" ? (
          <>
            {pendingDiscount ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Discount approval pending — ₹{pendingDiscount.discountAmount.toLocaleString("en-IN")} off list price
                (net ₹{pendingDiscount.netQuoted.toLocaleString("en-IN")}). Wait for admin approval before closing.
              </p>
            ) : null}
            <PlanDetailsFields
              artistCity={muaCity ?? undefined}
              artistRegions={artistRegions}
              value={planDetails}
              showDealConfirmFields
              onChange={setPlanDetails}
            />
            {dealPrice > 0 ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                List price: ₹{dealPrice.toLocaleString("en-IN")}
                {discountValue > 0 ? (
                  <>
                    {" "}
                    · Discount: ₹{discountValue.toLocaleString("en-IN")} · Net: ₹
                    {netDealPrice.toLocaleString("en-IN")}
                  </>
                ) : null}
                {priorPaid > 0 ? (
                  <>
                    {" "}
                    · Prior receipts: ₹{priorPaid.toLocaleString("en-IN")}
                  </>
                ) : null}
                {receivedNow > 0 ? (
                  <>
                    {" "}
                    · {paymentBalanceLabel(discountValue > 0 ? netDealPrice : dealPrice, cumulativePaid)}
                  </>
                ) : priorPaid > 0 ? (
                  <> · {paymentBalanceLabel(discountValue > 0 ? netDealPrice : dealPrice, priorPaid)}</>
                ) : null}
                {partialPaymentClose
                  ? " — balance remaining will move this MUA to Part Payment automatically."
                  : receivedNow > 0
                    ? " — full payment will close the deal and open onboarding."
                    : currentStage === "Part Payment"
                      ? " — record the next payment to continue closing the deal."
                      : null}
              </p>
            ) : null}
            {!pendingDiscount ? (
              <div className="space-y-3 rounded-lg border border-dashed border-slate-200 p-3">
                <p className="text-sm font-semibold text-brand">Discount (optional)</p>
                <Input
                  label="Discount amount (INR)"
                  type="number"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                />
                {discountValue > 0 ? (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">Discount reason *</label>
                      <textarea
                        className="min-h-16 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={discountReason}
                        onChange={(e) => setDiscountReason(e.target.value)}
                        placeholder="Why is this discount being offered?"
                      />
                    </div>
                    <p className="text-xs text-slate-muted">
                      Sales RM/TL discounts require admin approval before the deal closes.
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-3 rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold text-brand">Payment *</p>
              <Input
                label="Amount received (INR)"
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
              <Input label="Payment date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              <div>
                <label className="mb-1 block text-sm font-medium text-text">Payment mode</label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentPayload["paymentMode"])}
                >
                  {["UPI", "Cash", "Bank Transfer", "Card", "Other"].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-text">Payment notes (optional)</label>
                <textarea
                  className="min-h-16 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                />
              </div>
            </div>
          </>
        ) : null}

        {toStage !== "Rejected" && needsNextTouch ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-text">Next touch point *</label>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={nextTouchPoint}
              onChange={(e) => setNextTouchPoint(e.target.value)}
            />
          </div>
        ) : null}

        {toStage === "Rejected" ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-text">Rejection reason *</label>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            >
              <option value="">Select reason</option>
              <option>Not Interested</option>
              <option>Too Expensive</option>
              <option>Using Competitor</option>
              <option>No Response</option>
              <option>Other</option>
            </select>
          </div>
        ) : null}

        <div>
          <label className="mb-1 block text-sm font-medium text-text">Note *</label>
          <textarea
            className="min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {noteTooShort ? <p className="mt-1 text-xs text-danger">Note must be at least 10 characters.</p> : null}
        </div>

        {missingRequirements.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-semibold">Complete these to update stage:</p>
            <ul className="mt-1 list-inside list-disc">
              {missingRequirements.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {planValidationError ? <p className="text-xs text-danger">{planValidationError}</p> : null}
        {error ? <p className="text-xs text-danger">{error}</p> : null}

        <WhatsAppComposer
          audience="mua"
          phone={muaPhone}
          whatsapp={muaWhatsapp}
          pipelineId={pipelineId}
          pipelineStage={toStage}
          context={{ muaName, city: muaCity, scheduledTime: nextTouchPoint || undefined }}
          templatePool="sales"
          allowCustomMessage
        />
      </div>
    </SlideOver>
  );
}
