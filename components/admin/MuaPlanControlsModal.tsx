"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { CapBar } from "@/components/muas/CapBar";
import type { AdminMuaListItem } from "@/lib/admin-mua-list-item";
import type { AdminMuaPlanControlsDetail } from "@/lib/admin-mua-plan-controls";
import type { AdminPlanAssignContext } from "@/lib/admin-plan-assign-context";
import {
  ADMIN_PLAN_TAG_LABELS,
  ADMIN_PLAN_TAG_OPTIONS,
  type AdminPlanTag,
} from "@/lib/admin-plan-tag";
import { PLAN_TIER_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

function addMonthsISO(months: number, from?: string): string {
  const d = from ? new Date(from) : new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function YesNoField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean | null | undefined;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-text">{label}</p>
      <div className="flex gap-2">
        {[
          { v: true, l: "Yes" },
          { v: false, l: "No" },
        ].map(({ v, l }) => (
          <button
            key={l}
            type="button"
            disabled={disabled}
            onClick={() => onChange(v)}
            className={cn(
              "rounded-full px-3 py-1 text-xs",
              value === v ? "bg-brand text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

interface MuaPlanControlsModalProps {
  open: boolean;
  onClose: () => void;
  mua: AdminMuaListItem | null;
  onSuccess: () => void;
}

export function MuaPlanControlsModal({
  open,
  onClose,
  mua,
  onSuccess,
}: MuaPlanControlsModalProps) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<AdminMuaPlanControlsDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expiry, setExpiry] = useState("");
  const [capOverride, setCapOverride] = useState("");
  const [capBonus, setCapBonus] = useState("");
  const [tag, setTag] = useState<AdminPlanTag | "">("");
  const [planRmId, setPlanRmId] = useState("");
  const [rmSupport, setRmSupport] = useState<boolean | null>(null);
  const [leadReversal, setLeadReversal] = useState<boolean | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [contractUrl, setContractUrl] = useState<string | null>(null);
  const [docsSaving, setDocsSaving] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !mua) return;
    setExpiry(mua.planExpiry?.slice(0, 10) ?? "");
    setCapOverride(
      mua.weeklyCapOverride != null ? String(mua.weeklyCapOverride) : "",
    );
    setCapBonus(String(mua.weeklyCapBonus ?? 0));
    setTag(mua.adminPlanTag ?? "");
    setNote("");
    setInvoiceNumber("");
    setContractFile(null);
    setContractUrl(null);
    setDetailLoading(true);
    void Promise.all([
      fetch(`/api/admin/muas/${mua.id}/plan-controls`).then((r) => r.json()),
      fetch(`/api/admin/muas/${mua.id}/plan-assign-context`).then((r) => r.json()),
    ])
      .then(([controlsJson, contextJson]: [
        { data?: AdminMuaPlanControlsDetail; error?: string },
        { data?: AdminPlanAssignContext; error?: string },
      ]) => {
        const d = controlsJson.data ?? null;
        setDetail(d);
        setPlanRmId(d?.planRmId ?? "");
        setRmSupport(d?.rmSupport ?? null);
        setLeadReversal(d?.leadReversal ?? null);
        const ctx = contextJson.data ?? null;
        setInvoiceNumber(ctx?.invoiceNumber ?? "");
        setContractUrl(ctx?.contractUrl ?? null);
      })
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [open, mua]);

  const daysFromToday = useMemo(() => {
    if (!expiry) return null;
    return Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  }, [expiry]);

  async function save() {
    if (!mua) return;
    if (rmSupport === true && !planRmId.trim()) {
      toast("Select a Plan RM when RM Support is Yes", "error");
      return;
    }
    if (
      (rmSupport !== null || leadReversal !== null) &&
      !detail?.pipelineId
    ) {
      toast("No sales onboarding linked — cannot save RM Support or Lead Reversal", "error");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/admin/muas/${mua.id}/plan-controls`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planExpiry: expiry || null,
        weeklyCapOverride:
          capOverride.trim() === "" ? null : Number(capOverride),
        weeklyCapBonus: capBonus.trim() === "" ? 0 : Number(capBonus),
        adminPlanTag: tag || null,
        planRmId: planRmId.trim() || null,
        rmSupport: rmSupport ?? undefined,
        leadReversal: leadReversal ?? undefined,
        note: note.trim() || null,
      }),
    });
    const json = (await res.json()) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      toast(json.error ?? "Could not save plan controls", "error");
      return;
    }
    toast("Plan controls updated");
    onSuccess();
    onClose();
  }

  async function saveDocuments() {
    if (!mua) return;
    if (!invoiceNumber.trim() && !contractFile) {
      toast("Enter an invoice number and/or choose a contract file", "error");
      return;
    }
    setDocsSaving(true);
    const form = new FormData();
    if (contractFile) form.append("contractFile", contractFile);
    if (invoiceNumber.trim()) form.append("invoiceNumber", invoiceNumber.trim());
    const res = await fetch(`/api/admin/muas/${mua.id}/plan-documents`, {
      method: "POST",
      body: form,
    });
    const json = (await res.json()) as {
      error?: string;
      data?: { invoiceNumber?: string | null; contractUrl?: string | null };
    };
    setDocsSaving(false);
    if (!res.ok) {
      toast(json.error ?? "Could not save documents", "error");
      return;
    }
    setContractFile(null);
    if (json.data?.contractUrl) setContractUrl(json.data.contractUrl);
    toast("Invoice & contract saved");
    onSuccess();
  }

  if (!mua) return null;

  const hasActivePlan =
    mua.planTier &&
    (!mua.planExpiry || new Date(mua.planExpiry) >= new Date(new Date().toDateString()));

  const planRmOptions = detail?.planRmOptions ?? [];

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title={`Plan controls — ${mua.name}`}
    >
      <div className="space-y-5">
        {!hasActivePlan ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This MUA does not have an active plan. Assign a plan first, then use
            these controls.
          </p>
        ) : null}

        <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-muted">Plan</p>
            <p className="font-medium">
              {mua.planTier ? PLAN_TIER_LABELS[mua.planTier] : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-muted">Sales RM</p>
            <p className="font-medium">{mua.salesRmName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-muted">Assigned RM</p>
            <p className="font-medium">
              {detail?.assignedRmName ?? mua.assignedRmName ?? "—"}
            </p>
            <p className="text-[11px] text-slate-muted">Lead / booking assignment</p>
          </div>
          <div>
            <p className="text-xs text-slate-muted">Pushes till date</p>
            <p className="font-medium tabular-nums">{mua.pushesSincePlanStart}</p>
          </div>
          <div>
            <p className="text-xs text-slate-muted">Bookings since plan</p>
            <p className="font-medium tabular-nums">
              {mua.bookingsSincePlanStart}
              {mua.assuredBookings ? ` / ${mua.assuredBookings}` : ""}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1 text-xs text-slate-muted">Weekly cap usage</p>
            <CapBar used={mua.weeklyUsed} cap={mua.weeklyCap} />
            <p className="mt-1 text-[11px] text-slate-muted">
              Plan default {mua.baseWeeklyCap}
              {mua.weeklyCapOverride != null ? ` · override ${mua.weeklyCapOverride}` : ""}
              {mua.weeklyCapBonus > 0 ? ` · +${mua.weeklyCapBonus} bonus` : ""}
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-semibold text-brand">Plan RM &amp; deal terms</p>
          {detailLoading ? (
            <p className="text-sm text-slate-muted">Loading plan details…</p>
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
                Regional RM responsible for plan support (set at activation). Distinct from Assigned RM above.
              </p>
              {!detail?.pipelineId ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                  No sales pipeline — add the MUA to the sales funnel before setting RM Support or Lead Reversal.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <YesNoField
                    label="RM Support"
                    value={rmSupport}
                    onChange={setRmSupport}
                  />
                  <YesNoField
                    label="Lead Reversal"
                    value={leadReversal}
                    onChange={setLeadReversal}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-semibold text-brand">Invoice &amp; contract</p>
          <p className="text-xs text-slate-muted">
            Add or update anytime after the plan is active. Invoice is stored as a number; contract
            is the signed file.
          </p>
          <Input
            label="Invoice number"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="e.g. INV-2026-0042"
            disabled={!hasActivePlan || detailLoading}
          />
          {contractUrl ? (
            <p className="text-xs text-emerald-700">
              Contract on file: {contractUrl.split("/").pop()}
            </p>
          ) : null}
          <div>
            <label className="mb-1 block text-sm font-medium text-text">
              Signed contract (PDF, DOCX, JPG, PNG)
            </label>
            <input
              type="file"
              accept=".pdf,.docx,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              disabled={!hasActivePlan || detailLoading || docsSaving}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand disabled:opacity-50"
              onChange={(e) => setContractFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="secondary"
              disabled={!hasActivePlan || detailLoading || docsSaving}
              onClick={() => void saveDocuments()}
            >
              {docsSaving ? "Saving…" : "Save invoice & contract"}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-brand">Extend plan</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "+1 month", months: 1 },
              { label: "+3 months", months: 3 },
              { label: "+6 months", months: 6 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium hover:bg-slate-200"
                onClick={() =>
                  setExpiry(addMonthsISO(preset.months, expiry || undefined))
                }
              >
                {preset.label}
              </button>
            ))}
          </div>
          <Input
            type="date"
            label="Plan valid until"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          />
          {daysFromToday != null && (
            <p className="text-xs text-slate-muted">{daysFromToday} days from today</p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Weekly cap override"
            type="number"
            min={0}
            placeholder={`Plan default (${mua.baseWeeklyCap})`}
            value={capOverride}
            onChange={(e) => setCapOverride(e.target.value)}
          />
          <Input
            label="Extra pushes this week"
            type="number"
            min={0}
            placeholder="0"
            value={capBonus}
            onChange={(e) => setCapBonus(e.target.value)}
          />
        </div>
        <p className="text-xs text-slate-muted">
          Override replaces the plan tier weekly cap. Extra pushes add on top for
          this week only (e.g. grant more leads without changing the plan).
        </p>

        <div>
          <p className="mb-2 text-sm font-medium text-brand">Admin tag</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTag("")}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                !tag ? "border-brand bg-brand text-white" : "border-slate-200",
              )}
            >
              None
            </button>
            {ADMIN_PLAN_TAG_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTag(t)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  tag === t
                    ? "border-brand bg-brand text-white"
                    : "border-slate-200",
                )}
              >
                {ADMIN_PLAN_TAG_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason for extension or cap change"
        />

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving || !hasActivePlan || detailLoading} onClick={() => void save()}>
            {saving ? "Saving…" : "Save controls"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
