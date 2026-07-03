"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

export function OnboardingChecklist1({ pipelineId, initial, onSaved }: { pipelineId: string; initial?: any; onSaved: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    muaName: initial?.muaName ?? "",
    businessName: initial?.businessName ?? "",
    officialAddress: initial?.officialAddress ?? "",
    email: initial?.email ?? "",
    gstNumber: initial?.gstNumber ?? "",
    alternatePhone: initial?.alternatePhone ?? "",
    businessManagerPhone: initial?.businessManagerPhone ?? "",
  });

  useEffect(() => {
    setForm({
      muaName: initial?.muaName ?? "",
      businessName: initial?.businessName ?? "",
      officialAddress: initial?.officialAddress ?? "",
      email: initial?.email ?? "",
      gstNumber: initial?.gstNumber ?? "",
      alternatePhone: initial?.alternatePhone ?? "",
      businessManagerPhone: initial?.businessManagerPhone ?? "",
    });
  }, [initial]);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/sales/pipeline/${pipelineId}/onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast(json.error ?? "Could not save Checklist 1", "error");
        return;
      }
      toast("Checklist 1 saved");
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <p className="text-sm font-semibold text-brand">Checklist 1 — Profile Info</p>
      <Input label="Name of MUA *" value={form.muaName} onChange={(e) => setForm((f) => ({ ...f, muaName: e.target.value }))} />
      <Input label="Business Name *" value={form.businessName} onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))} />
      <Input label="Official Address *" value={form.officialAddress} onChange={(e) => setForm((f) => ({ ...f, officialAddress: e.target.value }))} />
      <Input label="Email *" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
      <Input label="GST Number" value={form.gstNumber} onChange={(e) => setForm((f) => ({ ...f, gstNumber: e.target.value }))} />
      <Input label="Alternate Phone" value={form.alternatePhone} onChange={(e) => setForm((f) => ({ ...f, alternatePhone: e.target.value }))} />
      <Input label="Business Manager Number" value={form.businessManagerPhone} onChange={(e) => setForm((f) => ({ ...f, businessManagerPhone: e.target.value }))} />
      <Button onClick={() => void save()} disabled={busy}>
        {busy ? "Saving…" : "Save Checklist 1"}
      </Button>
    </div>
  );
}
