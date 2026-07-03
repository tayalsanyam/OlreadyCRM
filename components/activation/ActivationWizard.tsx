"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { formatSocialMediaDealLabel, formatYesNo } from "@/lib/sales-plan-details";
import { formatInr } from "@/lib/sales-deal-payment";
import { Select } from "@/components/ui/Select";

function formatPlanDate(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
  if (!match) return String(value).slice(0, 10);
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatPlanDuration(start?: string | null, end?: string | null): string {
  if (!start && !end) return "—";
  if (start && end) return `${formatPlanDate(start)} – ${formatPlanDate(end)}`;
  return formatPlanDate(start ?? end);
}

async function readJsonSafe<T>(res: Response): Promise<T | null> {
  const raw = await res.text();
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

type WizardStep = {
  id: number;
  label: string;
  done: boolean;
  current: boolean;
};

export function ActivationWizard({ open, onClose, pipelineId, onDone }: { open: boolean; onClose: () => void; pipelineId: string; onDone: () => void }) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [sendBackNote, setSendBackNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [activationState, setActivationState] = useState<any>(null);
  const [ledger, setLedger] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showReference, setShowReference] = useState(false);
  const [selectedPlanRmId, setSelectedPlanRmId] = useState("");

  const loadState = useCallback(async () => {
    if (!pipelineId) return;
    const res = await fetch(`/api/activation/${pipelineId}`);
    const json = (await readJsonSafe<{ data?: any; error?: string | null }>(res)) ?? {};
    if (!res.ok) {
      setError(json.error ?? "Unable to load activation state");
      return;
    }
    if (!json.data && res.ok) {
      setError("Activation response was empty or invalid");
      return;
    }
    setError(null);
    setActivationState(json.data ?? null);
    const act = json.data?.activation;
    setInvoiceNumber(act?.invoiceNumber ?? "");
    const commsRes = await fetch(`/api/sales/pipeline/${pipelineId}/comms?limit=10`);
    const commsJson = (await readJsonSafe<{ data?: { sales?: any[]; prior?: any[] } }>(commsRes)) ?? {};
    const sales = (commsJson.data?.sales ?? []).map((e: any) => ({ ...e, ledgerSource: "Sales" }));
    const prior = (commsJson.data?.prior ?? []).map((e: any) => ({ ...e, ledgerSource: "RM / Commission" }));
    setLedger(
      [...sales, ...prior].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    );
  }, [pipelineId]);

  useEffect(() => {
    if (open) void loadState();
  }, [loadState, open]);

  async function step(stepName: string, value?: any, note?: string, planRmId?: string) {
    setBusy(true);
    const res = await fetch(`/api/activation/${pipelineId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: stepName, value, note, planRmId }),
    });
    setBusy(false);
    if (res.ok) {
      await loadState();
      if (stepName === "activate" || stepName === "sendBack") onDone();
    } else {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? "Action failed");
    }
  }

  async function uploadContract() {
    if (!contractFile) return;
    setBusy(true);
    const form = new FormData();
    form.append("contractFile", contractFile);
    const res = await fetch(`/api/activation/${pipelineId}`, { method: "POST", body: form });
    setBusy(false);
    if (res.ok) {
      setError(null);
      setContractFile(null);
      await loadState();
    } else {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? "Contract upload failed");
    }
  }

  const trainingComplete = Boolean(activationState?.training?.complete);
  const profileVerified = Boolean(activationState?.activation?.profileLinkVerified);
  const invoiceReady = Boolean(activationState?.activation?.invoiceGenerated);
  const hasInvoiceNo = Boolean((activationState?.activation?.invoiceNumber ?? "").trim());
  const contractGenerated = Boolean(activationState?.activation?.contractGenerated);
  const hasContractFile = Boolean((activationState?.activation?.contractUrl ?? "").trim());
  const isActivated = Boolean(activationState?.activation?.activatedAt);
  const sentBack = Boolean(activationState?.activation?.sentBackAt);
  const readOnly = isActivated;
  const resumingActivation =
    trainingComplete &&
    !isActivated &&
    (profileVerified || invoiceReady || hasInvoiceNo || contractGenerated || hasContractFile);
  const rmSupport = Boolean(activationState?.onboarding?.rmSupport);
  const planRmOptions: { id: string; name: string; region: string }[] =
    activationState?.planRmOptions ?? [];
  const activationReady =
    !readOnly &&
    trainingComplete &&
    profileVerified &&
    invoiceReady &&
    hasInvoiceNo &&
    contractGenerated &&
    hasContractFile;
  const canActivate = activationReady && (!rmSupport || Boolean(selectedPlanRmId.trim()));

  const currentStepIndex = useMemo(() => {
    if (!trainingComplete) return 0;
    if (!profileVerified) return 1;
    if (!invoiceReady || !hasInvoiceNo) return 2;
    if (!contractGenerated || !hasContractFile) return 3;
    return 4;
  }, [contractGenerated, hasContractFile, hasInvoiceNo, invoiceReady, profileVerified, trainingComplete]);

  const wizardSteps: WizardStep[] = useMemo(
    () => [
      { id: 1, label: "Verify profile", done: profileVerified, current: currentStepIndex === 1 },
      { id: 2, label: "Invoice", done: invoiceReady && hasInvoiceNo, current: currentStepIndex === 2 },
      { id: 3, label: "Contract", done: contractGenerated && hasContractFile, current: currentStepIndex === 3 },
      { id: 4, label: "Activate", done: isActivated, current: currentStepIndex === 4 && !isActivated },
    ],
    [contractGenerated, currentStepIndex, hasContractFile, hasInvoiceNo, invoiceReady, isActivated, profileVerified],
  );

  const statusLabel = useMemo(() => {
    if (isActivated) return "Activated";
    if (sentBack) return "Sent back to sales";
    if (!trainingComplete) return "Training incomplete";
    if (!profileVerified) return "Profile verification pending";
    if (!invoiceReady || !hasInvoiceNo) return "Invoice details pending";
    if (contractGenerated && !hasContractFile) return "Awaiting signature upload";
    if (!contractGenerated) return "Contract generation pending";
    if (!hasContractFile) return "Contract upload pending";
    return "Ready to activate";
  }, [contractGenerated, hasContractFile, hasInvoiceNo, invoiceReady, isActivated, profileVerified, sentBack, trainingComplete]);

  return (
    <SlideOver open={open} onClose={onClose} title="Activation Wizard" wide>
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-brand">{activationState?.pipeline?.muaName ?? "MUA"}</p>
            <Badge>{statusLabel}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-muted">
            {[activationState?.pipeline?.muaCity, activationState?.pipeline?.assignedSalesName ? `Sales: ${activationState.pipeline.assignedSalesName}` : null]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
          {isActivated ? (
            <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">
              Plan activated on{" "}
              {new Date(activationState.activation.activatedAt).toLocaleString("en-IN")}. This record is read-only.
            </p>
          ) : null}
          {sentBack && !trainingComplete ? (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
              Sent back to sales — waiting for training to be fixed.
              {activationState?.activation?.sentBackNote
                ? ` Reason: ${activationState.activation.sentBackNote}`
                : ""}
            </p>
          ) : null}
          {resumingActivation ? (
            <p className="mt-2 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-xs text-indigo-900">
              Resuming activation — invoice, contract, and verification steps you already completed are kept.
            </p>
          ) : null}
          {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
        </div>

        {!readOnly && trainingComplete ? (
          <>
            <ol className="grid gap-2 sm:grid-cols-4">
              {wizardSteps.map((s) => (
                <li
                  key={s.id}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    s.done
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : s.current
                        ? "border-brand bg-brand/5 text-brand"
                        : "border-slate-200 bg-white text-slate-muted"
                  }`}
                >
                  <span className="font-semibold">{s.done ? "✓" : s.id}.</span> {s.label}
                </li>
              ))}
            </ol>

            {(currentStepIndex === 1 || profileVerified) ? (
              <div className={`rounded-lg border p-3 ${currentStepIndex === 1 ? "border-brand/30 bg-brand/5" : "border-slate-200"}`}>
                <p className="mb-2 text-sm font-semibold text-brand">Step 1 — Verify profile link</p>
                <p className="mb-2 text-xs text-slate-muted break-all">{activationState?.training?.profileLink ?? "Not available"}</p>
                {profileVerified ? (
                  <p className="text-xs text-emerald-700">Profile link verified.</p>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => step("profileLinkVerified", true)} disabled={busy}>
                      Mark verified
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => step("profileLinkVerified", false)} disabled={busy}>
                      Mark invalid
                    </Button>
                  </div>
                )}
              </div>
            ) : null}

            {(currentStepIndex === 2 || (invoiceReady && hasInvoiceNo)) && profileVerified ? (
              <div className={`rounded-lg border p-3 ${currentStepIndex === 2 ? "border-brand/30 bg-brand/5" : "border-slate-200"}`}>
                <p className="mb-2 text-sm font-semibold text-brand">Step 2 — Invoice</p>
                {invoiceReady && hasInvoiceNo ? (
                  <p className="text-xs text-emerald-700">Invoice #{activationState?.activation?.invoiceNumber}</p>
                ) : (
                  <>
                    <Button size="sm" onClick={() => step("invoiceGenerated", true)} disabled={!profileVerified || busy}>
                      Mark invoice generated
                    </Button>
                    <div className="mt-2">
                      <Input label="Invoice number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                      <Button
                        size="sm"
                        className="mt-2"
                        onClick={() => step("invoiceNumber", invoiceNumber)}
                        disabled={!invoiceReady || !invoiceNumber.trim() || busy}
                      >
                        Save invoice number
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {(currentStepIndex === 3 || (contractGenerated && hasContractFile)) && hasInvoiceNo ? (
              <div className={`rounded-lg border p-3 ${currentStepIndex === 3 ? "border-brand/30 bg-brand/5" : "border-slate-200"}`}>
                <p className="mb-2 text-sm font-semibold text-brand">Step 3 — Contract</p>
                {contractGenerated && hasContractFile ? (
                  <p className="text-xs text-emerald-700">Contract uploaded.</p>
                ) : (
                  <>
                    <Button size="sm" onClick={() => step("contractGenerated", true)} disabled={!hasInvoiceNo || busy}>
                      Mark contract generated
                    </Button>
                    <div className="mt-2">
                      <label className="mb-1 block text-sm font-medium text-text">Signed contract (PDF/DOCX/JPG/PNG)</label>
                      <input
                        type="file"
                        accept=".pdf,.docx,.jpg,.jpeg,.png"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        onChange={(e) => setContractFile(e.target.files?.[0] ?? null)}
                      />
                      <Button size="sm" className="mt-2" onClick={() => void uploadContract()} disabled={!contractGenerated || !contractFile || busy}>
                        Upload contract
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {currentStepIndex === 4 && activationReady ? (
              <div className="rounded-lg border border-brand/30 bg-brand/5 p-3">
                <p className="mb-2 text-sm font-semibold text-brand">Step 4 — Activate plan on MUA</p>
                <p className="mb-3 text-xs text-slate-muted">
                  This applies the deal terms from sales onboarding to the MUA record and marks activation complete.
                </p>
                {rmSupport ? (
                  <div className="mb-3 max-w-md">
                    <Select
                      label="Plan RM"
                      value={selectedPlanRmId}
                      onChange={(e) => setSelectedPlanRmId(e.target.value)}
                      options={[
                        { value: "", label: "Select regional RM…", disabled: true },
                        ...planRmOptions.map((rm) => ({
                          value: rm.id,
                          label: `${rm.name} (${rm.region})`,
                        })),
                      ]}
                    />
                    {planRmOptions.length === 0 ? (
                      <p className="mt-2 text-xs text-amber-700">
                        No regional RMs match this deal&apos;s regions. Update onboarding regions or staff coverage.
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-slate-muted">
                      This RM becomes the Plan RM on the MUA profile (separate from lead Assigned RM).
                    </p>
                  </div>
                ) : null}
                <Button
                  onClick={() => step("activate", true, undefined, selectedPlanRmId.trim() || undefined)}
                  disabled={!canActivate || busy}
                >
                  Activate plan
                </Button>
              </div>
            ) : null}

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-sm font-semibold text-amber-900">Send back to salesperson</p>
              <Input label="Reason" value={sendBackNote} onChange={(e) => setSendBackNote(e.target.value)} />
              <Button
                variant="secondary"
                className="mt-2"
                onClick={() => step("sendBack", true, sendBackNote)}
                disabled={!sendBackNote.trim() || busy}
              >
                Send back
              </Button>
            </div>
          </>
        ) : !readOnly && !trainingComplete ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Training is not complete yet. Sales must finish the training checklist before you can activate.
            {sentBack && activationState?.activation?.sentBackNote ? (
              <p className="mt-2 text-xs">
                <span className="font-medium">Send-back reason:</span> {activationState.activation.sentBackNote}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-lg border border-slate-200">
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-brand"
            onClick={() => setShowReference((v) => !v)}
          >
            Deal & reference details
            <span className="text-xs text-slate-muted">{showReference ? "Hide" : "Show"}</span>
          </button>
          {showReference ? (
            <div className="space-y-3 border-t border-slate-200 p-3">
              <div className="grid gap-2 text-xs text-slate-muted md:grid-cols-2">
                <p><span className="font-medium text-text">Closed by:</span> {activationState?.pipeline?.salesClosedByName ?? "—"}</p>
                <p><span className="font-medium text-text">Stage:</span> {activationState?.pipeline?.stage ?? "—"}</p>
                <p><span className="font-medium text-text">Business:</span> {activationState?.onboarding?.businessName ?? "—"}</p>
                <p><span className="font-medium text-text">Email:</span> {activationState?.onboarding?.email ?? "—"}</p>
                <p className="md:col-span-2"><span className="font-medium text-text">Address:</span> {activationState?.onboarding?.officialAddress ?? "—"}</p>
              </div>
              <div className="grid gap-2 text-xs text-slate-muted md:grid-cols-2">
                <p><span className="font-medium text-text">Plan:</span> {activationState?.onboarding?.plan ?? "—"}</p>
                <p><span className="font-medium text-text">Lead cap:</span> {activationState?.onboarding?.leadCap ?? "—"}</p>
                <p><span className="font-medium text-text">Lead budget:</span> {activationState?.onboarding?.leadBudget ?? "—"}</p>
                <p>
                  <span className="font-medium text-text">Duration:</span>{" "}
                  {formatPlanDuration(activationState?.onboarding?.durationStart, activationState?.onboarding?.durationEnd)}
                </p>
                <p><span className="font-medium text-text">States:</span> {(activationState?.onboarding?.states ?? []).join(", ") || "—"}</p>
                <p><span className="font-medium text-text">Regions:</span> {(activationState?.onboarding?.regions ?? []).join(", ") || "—"}</p>
                <p className="md:col-span-2">
                  <span className="font-medium text-text">Cities:</span> {(activationState?.onboarding?.cities ?? []).join(", ") || "—"}
                </p>
                <p>
                  <span className="font-medium text-text">Deal amount:</span>{" "}
                  {activationState?.paymentSummary?.quotedAmount > 0
                    ? formatInr(Number(activationState.paymentSummary.quotedAmount))
                    : "—"}
                </p>
                <p>
                  <span className="font-medium text-text">Received:</span>{" "}
                  {activationState?.paymentSummary?.totalPaid > 0
                    ? formatInr(Number(activationState.paymentSummary.totalPaid))
                    : "—"}
                </p>
                <p>
                  <span className="font-medium text-text">RM Support:</span> {formatYesNo(activationState?.onboarding?.rmSupport)}
                </p>
                <p>
                  <span className="font-medium text-text">Lead Reversal:</span> {formatYesNo(activationState?.onboarding?.leadReversal)}
                </p>
                <p>
                  <span className="font-medium text-text">Social Media:</span>{" "}
                  {formatSocialMediaDealLabel({
                    socialMedia: activationState?.onboarding?.socialMedia,
                    hasSocialMedia: activationState?.onboarding?.hasSocialMedia,
                  })}
                </p>
                <p>
                  <span className="font-medium text-text">Assured bookings:</span>{" "}
                  {activationState?.onboarding?.assuredBookings != null &&
                  activationState.onboarding.assuredBookings > 0
                    ? activationState.onboarding.assuredBookings
                    : "—"}
                </p>
                <p>
                  <span className="font-medium text-text">Avg revenue target:</span>{" "}
                  {activationState?.onboarding?.avgRevenueTarget != null &&
                  activationState.onboarding.avgRevenueTarget > 0
                    ? formatInr(Number(activationState.onboarding.avgRevenueTarget))
                    : "—"}
                </p>
              </div>
              {ledger.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-600">Recent comms</p>
                  {ledger.slice(0, 4).map((e) => (
                    <div key={`${e.ledgerSource}-${e.id}`} className="rounded-md border border-slate-200 bg-white p-2">
                      <p className="text-xs text-slate-muted">
                        {e.ledgerSource} · {new Date(e.createdAt).toLocaleString("en-IN")}
                      </p>
                      <p className="text-sm text-slate-700">{e.description}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </SlideOver>
  );
}
