"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PlanDetailsFields } from "@/components/sales/PlanDetailsFields";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import {
  PLAN_TIER_TO_LABEL,
  expandAdminPlanCoverage,
  type AdminPlanAssignPayload,
} from "@/lib/admin-plan-assign-shared";
import type { AdminPlanAssignContext } from "@/lib/admin-plan-assign-context";
import { PLAN_DEFAULT_CAP, type SalesPlanDetailsInput } from "@/lib/sales-plan-details";
import { mapAssignableStaffFromApi } from "@/lib/sales-pipeline-assignee";
import { PLAN_TIER_LABELS, type PlanTier, type Region } from "@/lib/types";

const PLAN_META: {
  tier: PlanTier | null;
  weeklyCap: number;
}[] = [
  { tier: "highestPrivy", weeklyCap: 10 },
  { tier: "phoenix2", weeklyCap: 7 },
  { tier: "phoenix", weeklyCap: 7 },
  { tier: "pro", weeklyCap: 2 },
  { tier: "prime", weeklyCap: 1 },
  { tier: null, weeklyCap: 0 },
];

interface PlanAssignModalProps {
  open: boolean;
  onClose: () => void;
  muaIds: string[];
  muaLabel: string;
  onSuccess: () => void;
  /** Prefill when assigning a single MUA */
  initial?: Partial<AdminPlanAssignPayload> & { planTier?: PlanTier | null };
}

function addMonthsISO(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function planDetailsFromInitial(
  initial?: PlanAssignModalProps["initial"],
  tier?: PlanTier | null,
  context?: AdminPlanAssignContext | null,
): SalesPlanDetailsInput {
  const label = tier ? PLAN_TIER_TO_LABEL[tier] : "";
  const socialMedia = context?.socialMedia ?? initial?.instagram ?? "";
  return {
    plan: label,
    leadCap: initial?.leadCap ?? (tier ? PLAN_DEFAULT_CAP[PLAN_TIER_TO_LABEL[tier]] ?? null : null),
    leadBudget: initial?.leadBudget ?? "",
    states: initial?.states ?? [],
    regions: initial?.regions ?? [],
    cities: initial?.cities ?? [],
    socialMedia,
    hasSocialMedia: context?.hasSocialMedia ?? (socialMedia ? true : null),
    rmSupport: context?.rmSupport ?? null,
    leadReversal: context?.leadReversal ?? null,
    durationStart: new Date().toISOString().slice(0, 10),
    durationEnd: initial?.planExpiry?.slice(0, 10) ?? addMonthsISO(3),
    assuredBookings: null,
    avgRevenueTarget: null,
  };
}

export function PlanAssignModal({
  open,
  onClose,
  muaIds,
  muaLabel,
  onSuccess,
  initial,
}: PlanAssignModalProps) {
  const { toast } = useToast();
  const singleMua = muaIds.length === 1;
  const [planTier, setPlanTier] = useState<PlanTier | null | "__remove__">(null);
  const [expiry, setExpiry] = useState("");
  const [primaryCity, setPrimaryCity] = useState("");
  const [instagram, setInstagram] = useState("");
  const [planDetails, setPlanDetails] = useState<SalesPlanDetailsInput>({});
  const [planRmId, setPlanRmId] = useState("");
  const [salesRmId, setSalesRmId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [context, setContext] = useState<AdminPlanAssignContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [salesRms, setSalesRms] = useState<Array<{ id: string; name: string }>>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const tier = initial?.planTier ?? null;
    setPlanTier(tier);
    const end = initial?.planExpiry?.slice(0, 10) ?? addMonthsISO(3);
    setExpiry(end);
    setPrimaryCity(initial?.city ?? initial?.cities?.[0] ?? "");
    setInstagram(initial?.instagram ?? "");
    setPlanRmId("");
    setSalesRmId("");
    setInvoiceNumber("");
    setContractFile(null);
    setContext(null);
    setPlanDetails(planDetailsFromInitial(initial, tier));
    setNote("");

    if (singleMua) {
      setContextLoading(true);
      void Promise.all([
        fetch(`/api/admin/muas/${muaIds[0]}/plan-assign-context`)
          .then((r) => r.json())
          .then((json: { data?: AdminPlanAssignContext }) => json.data ?? null)
          .catch(() => null),
        fetch("/api/sales/assignable-rms")
          .then((r) => r.json())
          .then((json: { data?: Array<{ id: string; name: string; role: string }> }) =>
            mapAssignableStaffFromApi(json.data ?? []),
          )
          .catch(() => []),
      ])
        .then(([ctx, rms]) => {
          setContext(ctx);
          setSalesRms(rms);
          if (ctx) {
            setPlanRmId(ctx.planRmId ?? "");
            setSalesRmId(ctx.salesClosedById ?? "");
            setInvoiceNumber(ctx.invoiceNumber ?? "");
            setPlanDetails(planDetailsFromInitial(initial, tier, ctx));
          }
        })
        .finally(() => setContextLoading(false));
    } else {
      void fetch("/api/sales/assignable-rms")
        .then((r) => r.json())
        .then((json: { data?: Array<{ id: string; name: string; role: string }> }) =>
          setSalesRms(mapAssignableStaffFromApi(json.data ?? [])),
        )
        .catch(() => setSalesRms([]));
    }
  }, [open, initial, singleMua, muaIds]);

  useEffect(() => {
    if (planTier && planTier !== "__remove__") {
      setPlanDetails((prev) => ({
        ...prev,
        plan: PLAN_TIER_TO_LABEL[planTier],
        leadCap: prev.leadCap ?? PLAN_DEFAULT_CAP[PLAN_TIER_TO_LABEL[planTier]] ?? null,
        durationEnd: expiry || prev.durationEnd,
      }));
    }
  }, [planTier, expiry]);

  useEffect(() => {
    if (planDetails.cities?.length && !primaryCity) {
      setPrimaryCity(planDetails.cities[0]);
    }
  }, [planDetails.cities, primaryCity]);

  const daysFromToday = useMemo(() => {
    if (!expiry) return null;
    return Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  }, [expiry]);

  const planRmOptions = context?.planRmOptions ?? [];

  async function uploadDocuments(muaId: string) {
    if (!contractFile && !invoiceNumber.trim()) return;
    const form = new FormData();
    if (contractFile) form.append("contractFile", contractFile);
    if (invoiceNumber.trim()) form.append("invoiceNumber", invoiceNumber.trim());
    const res = await fetch(`/api/admin/muas/${muaId}/plan-documents`, {
      method: "POST",
      body: form,
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(json.error ?? "Contract upload failed");
    }
  }

  async function confirm() {
    if (singleMua && planDetails.rmSupport === true && !planRmId.trim()) {
      toast("Select a Plan RM when RM Support is Yes", "error");
      return;
    }

    setSaving(true);
    const socialValue =
      singleMua && planDetails.hasSocialMedia === false
        ? ""
        : planDetails.socialMedia?.trim() || instagram.trim() || null;

    const base: AdminPlanAssignPayload = expandAdminPlanCoverage({
      planTier: planTier === "__remove__" ? "__remove__" : planTier,
      planExpiry: planTier && planTier !== "__remove__" ? expiry : null,
      city: primaryCity.trim() || planDetails.cities?.[0] || null,
      instagram: socialValue,
      leadCap: planDetails.leadCap ?? null,
      leadBudget: planDetails.leadBudget ?? null,
      states: planDetails.states ?? [],
      regions: (planDetails.regions ?? []) as AdminPlanAssignPayload["regions"],
      cities: planDetails.cities ?? [],
      note: note.trim() || null,
    });

    const payload: AdminPlanAssignPayload = singleMua
      ? {
          ...base,
          rmSupport: planDetails.rmSupport ?? null,
          leadReversal: planDetails.leadReversal ?? null,
          hasSocialMedia: planDetails.hasSocialMedia ?? null,
          planRmId: planRmId.trim() || null,
          salesRmId: salesRmId.trim() || null,
          invoiceNumber: invoiceNumber.trim() || null,
        }
      : base;

    const res = await fetch("/api/admin/muas/bulk-plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ muaIds, ...payload }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setSaving(false);
      toast(json.error ?? "Plan assignment failed", "error");
      return;
    }

    if (singleMua && contractFile) {
      try {
        await uploadDocuments(muaIds[0]!);
      } catch (e) {
        setSaving(false);
        toast(e instanceof Error ? e.message : "Contract upload failed", "error");
        onSuccess();
        onClose();
        return;
      }
    }

    setSaving(false);
    onSuccess();
    onClose();
  }

  const assigning = planTier && planTier !== "__remove__";

  return (
    <Modal open={open} onClose={onClose} title={`Assign plan — ${muaLabel}`} wide>
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        <div className="flex gap-3 overflow-x-auto pb-2">
          {PLAN_META.map((p) => {
            const selected = planTier === p.tier;
            return (
              <button
                key={p.tier ?? "none"}
                type="button"
                onClick={() => setPlanTier(p.tier)}
                className={cn(
                  "relative min-w-[120px] shrink-0 rounded-xl border-2 p-3 text-left transition-colors",
                  selected ? "border-brand bg-brand/5" : "border-slate-200",
                  p.tier === null && "opacity-80",
                )}
              >
                {selected && (
                  <Check className="absolute right-2 top-2 h-4 w-4 text-brand" />
                )}
                <p className="pr-5 text-sm font-semibold leading-snug">
                  {p.tier ? PLAN_TIER_LABELS[p.tier] : "Remove plan"}
                </p>
                <p className="mt-1 text-xs text-slate-muted">
                  {p.tier ? `${p.weeklyCap} pushes/week` : "Clear plan from MUA"}
                </p>
              </button>
            );
          })}
        </div>

        {assigning && (
          <>
            <div>
              <p className="mb-2 text-sm font-medium">Plan valid until</p>
              <div className="mb-2 flex flex-wrap gap-2">
                {[
                  { label: "+1 month", months: 1 },
                  { label: "+3 months", months: 3 },
                  { label: "+6 months", months: 6 },
                  { label: "+1 year", months: 12 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium hover:bg-slate-200"
                    onClick={() => {
                      const next = addMonthsISO(preset.months);
                      setExpiry(next);
                      setPlanDetails((prev) => ({ ...prev, durationEnd: next }));
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <Input
                type="date"
                value={expiry}
                onChange={(e) => {
                  setExpiry(e.target.value);
                  setPlanDetails((prev) => ({ ...prev, durationEnd: e.target.value }));
                }}
              />
              {daysFromToday !== null && (
                <p className="mt-1 text-xs text-slate-muted">{daysFromToday} days from today</p>
              )}
            </div>

            <Input
              label="Primary city *"
              value={primaryCity}
              onChange={(e) => setPrimaryCity(e.target.value)}
              placeholder="e.g. Delhi, Gurgaon, Delhi NCR"
            />

            {singleMua ? (
              <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold text-brand">Plan RM &amp; sales</p>
                {contextLoading ? (
                  <p className="text-sm text-slate-muted">Loading deal details…</p>
                ) : (
                  <>
                    <Select
                      label="Plan RM"
                      value={planRmId}
                      onChange={(e) => setPlanRmId(e.target.value)}
                      options={[
                        { value: "", label: "Not assigned" },
                        ...planRmOptions.map((rm) => ({
                          value: rm.id,
                          label: `${rm.name} (${rm.region})`,
                        })),
                      ]}
                    />
                    <p className="text-xs text-slate-muted">
                      Regional RM for plan support. Required when RM Support is Yes.
                    </p>
                    <Select
                      label="Sales RM (closed deal)"
                      value={salesRmId}
                      onChange={(e) => setSalesRmId(e.target.value)}
                      options={[
                        { value: "", label: "Not assigned" },
                        ...salesRms.map((rm) => ({ value: rm.id, label: rm.name })),
                      ]}
                    />
                  </>
                )}
              </div>
            ) : null}

            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-3 text-sm font-semibold text-brand">Plan coverage</p>
              <PlanDetailsFields
                hidePlanField
                showDealConfirmFields={singleMua}
                artistCity={(primaryCity.trim() || initial?.city) ?? undefined}
                artistRegions={(initial?.regions ?? planDetails.regions ?? []) as Region[]}
                value={{ ...planDetails, plan: planTier ? PLAN_TIER_TO_LABEL[planTier] : "" }}
                onChange={(next) => {
                  setPlanDetails(next);
                  if (next.cities?.length && !primaryCity) {
                    setPrimaryCity(next.cities[0]);
                  }
                }}
              />
            </div>

            {!singleMua ? (
              <Input
                label="Instagram / social *"
                value={instagram}
                onChange={(e) => {
                  setInstagram(e.target.value);
                  setPlanDetails((prev) => ({ ...prev, socialMedia: e.target.value }));
                }}
                placeholder="@handle or profile URL"
              />
            ) : null}

            {singleMua ? (
              <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold text-brand">Invoice &amp; contract</p>
                <p className="text-xs text-slate-muted">
                  Admin-only — record invoice and upload signed contract without going through the
                  activation wizard.
                </p>
                <Input
                  label="Invoice number"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="e.g. INV-2026-0042"
                />
                {context?.contractUrl ? (
                  <p className="text-xs text-emerald-700">
                    Contract on file: {context.contractUrl.split("/").pop()}
                  </p>
                ) : null}
                <div>
                  <label className="mb-1 block text-sm font-medium text-text">
                    Signed contract (PDF, DOCX, JPG, PNG)
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.docx,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand"
                    onChange={(e) => setContractFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
            ) : null}
          </>
        )}

        <Input
          label="Notes (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Internal note about this assignment"
        />

        {muaIds.length > 1 && assigning && (
          <p className="text-xs text-amber-800">
            Same plan and coverage will apply to all {muaIds.length} selected MUAs. Deal terms, RM
            assignment, and documents are only available when assigning one MUA at a time.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void confirm()}
            disabled={saving || planTier === null || (Boolean(assigning) && !expiry)}
          >
            {saving ? "Saving…" : "Confirm"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
