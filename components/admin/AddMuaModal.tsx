"use client";

import { useEffect, useState } from "react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { MuaRegionPicker } from "@/components/muas/MuaRegionPicker";
import { MuaServicesPicker } from "@/components/muas/MuaServicesPicker";
import { CityInput } from "@/components/muas/CityInput";
import { useCityRegionLookup } from "@/lib/use-city-region-lookup";
import type { MuaServiceOffering } from "@/lib/mua-service-catalog";
import { MUA_SOURCE_OPTIONS } from "@/lib/mua-source";
import type { Region } from "@/lib/types";

interface AddMuaModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** Staff roles see shorter onboarding copy (no admin-only steps). */
  audience?: "admin" | "staff";
}

export function AddMuaModal({
  open,
  onClose,
  onCreated,
  audience = "admin",
}: AddMuaModalProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [regionsTouched, setRegionsTouched] = useState(false);
  const [showBusiness, setShowBusiness] = useState(false);
  const [form, setForm] = useState({
    name: "",
    city: "",
    regions: [] as Region[],
    bio: "",
    serviceOfferings: [] as MuaServiceOffering[],
    phone: "",
    whatsapp: "",
    source: "",
    instagram: "",
    status: "active",
    businessName: "",
    officialAddress: "",
    gstNumber: "",
    email: "",
    alternatePhone: "",
    businessManagerPhone: "",
    avgRevenueTarget: "",
    preferredContactChannel: "",
  });

  const { regions: lookedUpRegions } = useCityRegionLookup(form.city);

  useEffect(() => {
    if (!open) return;
    setRegionsTouched(false);
    setShowBusiness(false);
    setForm({
      name: "",
      city: "",
      regions: [],
      bio: "",
      serviceOfferings: [],
      phone: "",
      whatsapp: "",
      source: "",
      instagram: "",
      status: "active",
      businessName: "",
      officialAddress: "",
      gstNumber: "",
      email: "",
      alternatePhone: "",
      businessManagerPhone: "",
      avgRevenueTarget: "",
      preferredContactChannel: "",
    });
  }, [open]);

  useEffect(() => {
    if (!open || regionsTouched || lookedUpRegions.length === 0) return;
    setForm((f) => {
      if (
        f.regions.length === lookedUpRegions.length &&
        f.regions.every((r, i) => r === lookedUpRegions[i])
      ) {
        return f;
      }
      return { ...f, regions: lookedUpRegions };
    });
  }, [open, regionsTouched, lookedUpRegions]);

  async function submit() {
    const phone = form.phone.replace(/\D/g, "").slice(-10);
    if (!form.name.trim() || !form.city.trim() || phone.length !== 10) {
      toast("Name, city, and a 10-digit phone number are required", "error");
      return;
    }

    const whatsappRaw = form.whatsapp.replace(/\D/g, "").slice(-10);
    const whatsapp = whatsappRaw.length === 10 ? whatsappRaw : phone;

    setBusy(true);
    try {
      const res = await fetch("/api/admin/muas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          city: form.city.trim(),
          regions: form.regions ?? [],
          bio: form.bio.trim() || null,
          serviceOfferings: form.serviceOfferings,
          phone,
          whatsapp,
          source: form.source.trim() || null,
          instagram: form.instagram.trim() || null,
          status: form.status,
          businessName: form.businessName.trim() || null,
          officialAddress: form.officialAddress.trim() || null,
          gstNumber: form.gstNumber.trim() || null,
          email: form.email.trim() || null,
          alternatePhone: form.alternatePhone.replace(/\D/g, "").slice(-10) || null,
          businessManagerPhone: form.businessManagerPhone.replace(/\D/g, "").slice(-10) || null,
          avgRevenueTarget: form.avgRevenueTarget.trim()
            ? Number(form.avgRevenueTarget)
            : null,
          preferredContactChannel: form.preferredContactChannel.trim() || null,
        }),
      });
      const json = (await res.json()) as {
        data: { displayId: string } | null;
        error: string | null;
      };
      if (!res.ok || json.error) {
        toast(json.error ?? "Failed to create MUA", "error");
        return;
      }
      toast(`MUA ${json.data?.displayId ?? ""} created`);
      onCreated();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Add MUA"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving…" : "Create MUA"}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-muted">
        {audience === "staff"
          ? "Creates an active MUA and an unassigned sales pipeline. Use Inactive to hide from assignment without removing the record."
          : "Creates an active MUA and an unassigned sales pipeline (Potential if no plan history, Existing No Plan if there is). Assign a salesperson from Manage MUAs → Needs Sales RM. Use Inactive to hide from assignment without junking a sales record."}
      </p>
      <div className="space-y-4">
        <Input
          label="MUA name *"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <CityInput
          value={form.city}
          onChange={(city) => setForm((f) => ({ ...f, city, regionsTouched: false }))}
          required
          hint="Pick from suggestions or type any city — region auto-fills when recognised."
        />
        <MuaRegionPicker
          value={form.regions ?? []}
          onChange={(regions) => {
            setRegionsTouched(true);
            setForm((f) => ({ ...f, regions }));
          }}
        />
        <p className="-mt-2 text-xs text-slate-muted">
          Auto-filled from city when recognised. More regions can be added when a plan is pushed.
        </p>
        <Input
          label="Phone *"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
        <Input
          label="WhatsApp"
          placeholder="Defaults to phone if left blank"
          value={form.whatsapp}
          onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
        />
        <Select
          label="Source"
          value={form.source}
          onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
          options={[
            { value: "", label: "—" },
            ...MUA_SOURCE_OPTIONS.map((s) => ({ value: s, label: s })),
          ]}
        />
        <Input
          label="Instagram"
          value={form.instagram}
          onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))}
        />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">About / bio</span>
          <textarea
            className="min-h-[80px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Experience, style, team size…"
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
          />
        </label>
        <MuaServicesPicker
          value={form.serviceOfferings}
          onChange={(serviceOfferings) => setForm((f) => ({ ...f, serviceOfferings }))}
        />
        <Select
          label="Roster visibility"
          value={form.status}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          options={[
            { value: "active", label: "Active — on roster (default)" },
            { value: "inactive", label: "Inactive — hidden from assignment" },
          ]}
        />
        <button
          type="button"
          className="text-sm font-medium text-accent underline"
          onClick={() => setShowBusiness((v) => !v)}
        >
          {showBusiness ? "Hide" : "Show"} business details (optional)
        </button>
        {showBusiness ? (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <Input
              label="Business / brand name"
              value={form.businessName}
              onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
            />
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-text">Official address</span>
              <textarea
                className="min-h-[60px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={form.officialAddress}
                onChange={(e) => setForm((f) => ({ ...f, officialAddress: e.target.value }))}
              />
            </label>
            <Input
              label="GST number"
              value={form.gstNumber}
              onChange={(e) => setForm((f) => ({ ...f, gstNumber: e.target.value }))}
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <Input
              label="Alternate phone"
              value={form.alternatePhone}
              onChange={(e) => setForm((f) => ({ ...f, alternatePhone: e.target.value }))}
            />
            <Input
              label="Business manager phone"
              value={form.businessManagerPhone}
              onChange={(e) => setForm((f) => ({ ...f, businessManagerPhone: e.target.value }))}
            />
            <Input
              label="Avg revenue target (₹ reference)"
              type="number"
              min={0}
              value={form.avgRevenueTarget}
              onChange={(e) => setForm((f) => ({ ...f, avgRevenueTarget: e.target.value }))}
            />
            <Input
              label="Preferred contact channel"
              placeholder="WhatsApp / Call / Instagram"
              value={form.preferredContactChannel}
              onChange={(e) => setForm((f) => ({ ...f, preferredContactChannel: e.target.value }))}
            />
          </div>
        ) : null}
      </div>
    </SlideOver>
  );
}
