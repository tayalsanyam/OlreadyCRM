"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MuaRegionPicker } from "@/components/muas/MuaRegionPicker";
import { MuaServicesPicker } from "@/components/muas/MuaServicesPicker";
import { MuaServiceOfferingsList } from "@/components/muas/MuaServiceOfferingsList";
import { CityInput } from "@/components/muas/CityInput";
import { MUA_STATUS_LABELS } from "@/lib/mua-status-labels";
import { formatRegions } from "@/lib/mua-region";
import { useCityRegionLookup } from "@/lib/use-city-region-lookup";
import type { MuaServiceOffering } from "@/lib/mua-service-catalog";
import type { SalesPipelineProfilePayload } from "@/lib/sales-pipeline-profile";
import { PLAN_TIER_LABELS, type PlanTier, type Region } from "@/lib/types";
import { ProfileField, ProfileFieldGrid, ProfileSection, ProfileAvatar, ProfileContactLinks, ProfileCollapsibleSection } from "@/components/sales/ProfileFieldGrid";

const SOURCE_OPTIONS = ["Inbound", "Ads", "Referral", "Instagram DM", "Others"] as const;

type FormState = {
  name: string;
  phone: string;
  city: string;
  source: string;
  whatsapp: string;
  instagram: string;
  preferredContactChannel: string;
  preferredContactTime: string;
  salesNotes: string;
  bio: string;
  specialtiesText: string;
  serviceOfferings: MuaServiceOffering[];
  regions: Region[];
  businessName: string;
  officialAddress: string;
  gstNumber: string;
  email: string;
  alternatePhone: string;
  businessManagerPhone: string;
  avgRevenueTarget: string;
  showBusiness: boolean;
  regionsTouched: boolean;
};

function toForm(data: SalesPipelineProfilePayload): FormState {
  return {
    name: data.mua.name ?? "",
    phone: data.mua.phone ?? "",
    city: data.mua.city ?? "",
    source: data.mua.source ?? "",
    whatsapp: data.mua.whatsapp ?? "",
    instagram: data.mua.instagram ?? "",
    preferredContactChannel: data.mua.preferredContactChannel ?? "",
    preferredContactTime: data.pipeline.preferredContactTime ?? "",
    salesNotes: data.pipeline.salesNotes ?? "",
    bio: data.mua.bio ?? "",
    specialtiesText: (data.mua.specialties ?? []).join(", "),
    serviceOfferings: data.mua.serviceOfferings ?? [],
    regions: data.mua.regions ?? [],
    businessName: data.mua.businessName ?? "",
    officialAddress: data.mua.officialAddress ?? "",
    gstNumber: data.mua.gstNumber ?? "",
    email: data.mua.email ?? "",
    alternatePhone: data.mua.alternatePhone ?? "",
    businessManagerPhone: data.mua.businessManagerPhone ?? "",
    avgRevenueTarget:
      data.mua.avgRevenueTarget != null ? String(data.mua.avgRevenueTarget) : "",
    showBusiness: Boolean(
      data.mua.businessName ||
        data.mua.officialAddress ||
        data.mua.gstNumber ||
        data.mua.email ||
        data.mua.alternatePhone ||
        data.mua.businessManagerPhone ||
        data.mua.avgRevenueTarget != null
    ),
    regionsTouched: false,
  };
}

function parseList(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function MuaProfileDetailsTab({
  pipelineId,
  onSaved,
}: {
  pipelineId: string;
  onSaved: () => void;
}) {
  const [profile, setProfile] = useState<SalesPipelineProfilePayload | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneWarning, setPhoneWarning] = useState<string | null>(null);

  const { regions: lookedUpRegions } = useCityRegionLookup(form?.city ?? "");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/sales/pipeline/${pipelineId}/profile`);
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setProfile(null);
      setForm(null);
      setError(json?.error ?? "Could not load profile");
      return;
    }
    const data = json.data as SalesPipelineProfilePayload;
    setProfile(data);
    setForm(toForm(data));
  }, [pipelineId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!editing || !form || form.regionsTouched || lookedUpRegions.length === 0) return;
    setForm((f) => {
      if (!f) return f;
      if (
        f.regions.length === lookedUpRegions.length &&
        f.regions.every((r, i) => r === lookedUpRegions[i])
      ) {
        return f;
      }
      return { ...f, regions: lookedUpRegions };
    });
  }, [editing, form?.regionsTouched, lookedUpRegions]);

  async function checkPhone(phone: string) {
    if (!phone.trim()) {
      setPhoneWarning(null);
      return;
    }
    const res = await fetch(`/api/sales/pipeline/check-duplicate?phone=${encodeURIComponent(phone)}`);
    const json = await res.json().catch(() => ({}));
    const matches = json?.data?.matches ?? [];
    if (matches.length) {
      const m = matches[0];
      setPhoneWarning(`Phone in use: ${m.muaName} (${m.stage ?? "no active pipeline"})`);
    } else {
      setPhoneWarning(null);
    }
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);

    const phone = form.phone.replace(/\D/g, "").slice(-10);
    const whatsappRaw = form.whatsapp.replace(/\D/g, "").slice(-10);
    const whatsapp = whatsappRaw.length === 10 ? whatsappRaw : phone;

    const res = await fetch(`/api/sales/pipeline/${pipelineId}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        phone: phone || null,
        city: form.city,
        source: form.source || null,
        whatsapp: whatsapp || null,
        instagram: form.instagram || null,
        preferredContactChannel: form.preferredContactChannel || null,
        preferredContactTime: form.preferredContactTime || null,
        salesNotes: form.salesNotes,
        bio: form.bio || null,
        specialties: parseList(form.specialtiesText),
        serviceOfferings: form.serviceOfferings,
        regions: form.regions,
        businessName: form.businessName.trim() || null,
        officialAddress: form.officialAddress.trim() || null,
        gstNumber: form.gstNumber.trim() || null,
        email: form.email.trim() || null,
        alternatePhone: form.alternatePhone.replace(/\D/g, "").slice(-10) || null,
        businessManagerPhone: form.businessManagerPhone.replace(/\D/g, "").slice(-10) || null,
        avgRevenueTarget: form.avgRevenueTarget.trim() ? Number(form.avgRevenueTarget) : null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(json?.error ?? "Save failed");
      return;
    }
    setEditing(false);
    await load();
    onSaved();
  }

  if (loading) {
    return <p className="text-sm text-slate-muted">Loading profile…</p>;
  }

  if (!profile || !form) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        <p>{error ?? "Profile unavailable"}</p>
        <Button size="sm" variant="secondary" className="mt-2" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  const planLabel = profile.mua.planTier
    ? PLAN_TIER_LABELS[profile.mua.planTier as PlanTier] ?? profile.mua.planTier
    : "No plan";

  const statusLabel = MUA_STATUS_LABELS[profile.mua.status] ?? profile.mua.status;
  const displayEmail =
    profile.mua.email?.trim() || profile.onboarding?.email?.trim() || null;

  if (!editing) {
    const specialties = profile.mua.specialties ?? [];
    const fmtDate = (d: string | null | undefined) =>
      d ? new Date(d).toLocaleDateString("en-IN") : null;
    const hasBusinessDetails = Boolean(
      profile.mua.businessName ||
        displayEmail ||
        profile.mua.gstNumber ||
        profile.mua.alternatePhone ||
        profile.mua.businessManagerPhone ||
        profile.mua.avgRevenueTarget != null ||
        profile.mua.officialAddress
    );
    const waDigits = (profile.mua.whatsapp || profile.mua.phone || "").replace(/\D/g, "");
    const waHref = waDigits.length >= 10 ? `https://wa.me/91${waDigits.slice(-10)}` : undefined;

    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4">
          <ProfileAvatar name={profile.mua.name} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-lg font-semibold text-brand">{profile.mua.name}</p>
                <p className="text-xs text-slate-muted">
                  {profile.mua.displayId}
                  {profile.mua.city ? ` · ${profile.mua.city}` : ""}
                  {displayEmail ? ` · ${displayEmail}` : ""}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand">
                {statusLabel}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                {planLabel}
              </span>
            </div>
            <ProfileContactLinks
              phone={profile.mua.phone}
              whatsapp={profile.mua.whatsapp}
              instagram={profile.mua.instagram}
              email={displayEmail}
            />
          </div>
        </div>

        <ProfileSection title="Account">
          <ProfileFieldGrid cols={3}>
            <ProfileField label="Plan expiry" value={fmtDate(profile.mua.planExpiry)} />
            <ProfileField label="Join date" value={fmtDate(profile.mua.joinDate)} />
            <ProfileField label="Regions" value={formatRegions(profile.mua.regions)} />
            <ProfileField label="Assigned RM" value={profile.mua.assignedRmName} />
            <ProfileField label="Pipeline assignee" value={profile.pipeline.assignedToName ?? "Unassigned"} />
            <ProfileField label="Source" value={profile.mua.source} />
          </ProfileFieldGrid>
        </ProfileSection>

        <ProfileSection title="Contact preferences">
          <ProfileFieldGrid cols={3}>
            <ProfileField
              label="Phone"
              value={profile.mua.phone}
              href={profile.mua.phone ? `tel:${profile.mua.phone}` : undefined}
            />
            <ProfileField
              label="WhatsApp"
              value={profile.mua.whatsapp ?? profile.mua.phone}
              href={waHref}
            />
            <ProfileField
              label="Instagram"
              value={profile.mua.instagram}
              href={
                profile.mua.instagram?.startsWith("http")
                  ? profile.mua.instagram
                  : profile.mua.instagram
                    ? `https://instagram.com/${profile.mua.instagram.replace(/^@/, "")}`
                    : undefined
              }
            />
            {displayEmail ? (
              <ProfileField
                label="Email"
                value={displayEmail}
                href={`mailto:${displayEmail}`}
              />
            ) : null}
            <ProfileField label="Preferred channel" value={profile.mua.preferredContactChannel} />
            <ProfileField label="Preferred call time" value={profile.pipeline.preferredContactTime} />
          </ProfileFieldGrid>
        </ProfileSection>

        <ProfileSection title="Business">
          {profile.mua.bio?.trim() ? (
            <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
              {profile.mua.bio}
            </p>
          ) : (
            <p className="mb-3 text-sm text-slate-400">No bio yet</p>
          )}
          {specialties.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {specialties.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700"
                >
                  {s}
                </span>
              ))}
            </div>
          ) : null}
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Services</p>
          <MuaServiceOfferingsList
            offerings={profile.mua.serviceOfferings}
            fallbackNames={profile.mua.services}
          />
        </ProfileSection>

        {hasBusinessDetails ? (
          <ProfileCollapsibleSection title="Business & legal details" defaultOpen={false}>
            <ProfileFieldGrid cols={3}>
              <ProfileField label="Business name" value={profile.mua.businessName} />
              <ProfileField label="Email" value={displayEmail ?? profile.mua.email} />
              <ProfileField label="GST" value={profile.mua.gstNumber} />
              <ProfileField label="Alt phone" value={profile.mua.alternatePhone} />
              <ProfileField label="Manager phone" value={profile.mua.businessManagerPhone} />
              <ProfileField
                label="Avg revenue target"
                value={
                  profile.mua.avgRevenueTarget != null
                    ? `₹${profile.mua.avgRevenueTarget.toLocaleString("en-IN")}`
                    : null
                }
              />
              {profile.mua.officialAddress ? (
                <ProfileField
                  label="Address"
                  value={profile.mua.officialAddress}
                  className="sm:col-span-2 lg:col-span-3"
                />
              ) : null}
            </ProfileFieldGrid>
          </ProfileCollapsibleSection>
        ) : null}

        {profile.pipeline.salesNotes?.trim() ? (
          <ProfileSection title="Sales notes">
            <p className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap">
              {profile.pipeline.salesNotes}
            </p>
          </ProfileSection>
        ) : null}

        {profile.onboarding ? (
          <ProfileCollapsibleSection title="Onboarding form" defaultOpen={false} className="border-dashed">
            <ProfileFieldGrid>
              <ProfileField label="Business" value={profile.onboarding.businessName} />
              <ProfileField label="Email" value={profile.onboarding.email} />
              <ProfileField label="Alt phone" value={profile.onboarding.alternatePhone} />
              <ProfileField label="Plan (form)" value={profile.onboarding.plan} />
              <ProfileField
                label="Checklists"
                value={
                  <>
                    {profile.onboarding.checklist1Complete ? "C1 ✓" : "C1 …"} ·{" "}
                    {profile.onboarding.checklist2Complete ? "C2 ✓" : "C2 …"}
                    <span className="text-slate-500"> — Checklists tab</span>
                  </>
                }
                className="sm:col-span-2"
              />
            </ProfileFieldGrid>
          </ProfileCollapsibleSection>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-brand">Edit MUA profile</p>
        <p className="text-xs text-slate-muted">{profile.mua.displayId}</p>
      </div>

      <section className="rounded-lg border border-slate-200 p-3 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</p>
        <div className="grid gap-2 md:grid-cols-2">
          <Input label="Name" value={form.name} onChange={(e) => setForm((f) => f && { ...f, name: e.target.value })} />
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm((f) => f && { ...f, phone: e.target.value })}
            onBlur={() => void checkPhone(form.phone)}
          />
          <Input
            label="WhatsApp"
            placeholder="Defaults to phone if blank"
            value={form.whatsapp}
            onChange={(e) => setForm((f) => f && { ...f, whatsapp: e.target.value })}
          />
          <Input label="Instagram" value={form.instagram} onChange={(e) => setForm((f) => f && { ...f, instagram: e.target.value })} />
          <CityInput
            value={form.city}
            onChange={(city) => setForm((f) => f && { ...f, city, regionsTouched: false })}
          />
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium text-text">Source</span>
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={form.source}
              onChange={(e) => setForm((f) => f && { ...f, source: e.target.value })}
            >
              <option value="">—</option>
              {SOURCE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Preferred contact channel"
            value={form.preferredContactChannel}
            onChange={(e) => setForm((f) => f && { ...f, preferredContactChannel: e.target.value })}
            placeholder="e.g. WhatsApp, phone"
          />
          <Input
            label="Preferred call time"
            value={form.preferredContactTime}
            onChange={(e) => setForm((f) => f && { ...f, preferredContactTime: e.target.value })}
            placeholder="e.g. morning, 2–4pm"
          />
        </div>
        <MuaRegionPicker
          value={form.regions}
          onChange={(regions) => setForm((f) => f && { ...f, regions, regionsTouched: true })}
        />
      </section>

      <section className="rounded-lg border border-slate-200 p-3 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Business</p>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-text">Bio</span>
          <textarea
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={3}
            value={form.bio}
            onChange={(e) => setForm((f) => f && { ...f, bio: e.target.value })}
          />
        </label>
        <Input
          label="Specialties (comma-separated)"
          value={form.specialtiesText}
          onChange={(e) => setForm((f) => f && { ...f, specialtiesText: e.target.value })}
        />
        <MuaServicesPicker
          value={form.serviceOfferings}
          onChange={(serviceOfferings) => setForm((f) => f && { ...f, serviceOfferings })}
        />
        <button
          type="button"
          className="text-sm font-medium text-accent underline"
          onClick={() => setForm((f) => f && { ...f, showBusiness: !f.showBusiness })}
        >
          {form.showBusiness ? "Hide" : "Show"} business details
        </button>
        {form.showBusiness ? (
          <div className="grid gap-2 md:grid-cols-2">
            <Input
              label="Business / brand name"
              value={form.businessName}
              onChange={(e) => setForm((f) => f && { ...f, businessName: e.target.value })}
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => f && { ...f, email: e.target.value })}
            />
            <Input
              label="GST number"
              value={form.gstNumber}
              onChange={(e) => setForm((f) => f && { ...f, gstNumber: e.target.value })}
            />
            <Input
              label="Alternate phone"
              value={form.alternatePhone}
              onChange={(e) => setForm((f) => f && { ...f, alternatePhone: e.target.value })}
            />
            <Input
              label="Business manager phone"
              value={form.businessManagerPhone}
              onChange={(e) => setForm((f) => f && { ...f, businessManagerPhone: e.target.value })}
            />
            <Input
              label="Avg revenue target (₹ reference)"
              type="number"
              min={0}
              value={form.avgRevenueTarget}
              onChange={(e) => setForm((f) => f && { ...f, avgRevenueTarget: e.target.value })}
            />
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block font-medium text-text">Official address</span>
              <textarea
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                rows={2}
                value={form.officialAddress}
                onChange={(e) => setForm((f) => f && { ...f, officialAddress: e.target.value })}
              />
            </label>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 p-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-text">Sales notes (private)</span>
          <textarea
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={4}
            value={form.salesNotes}
            onChange={(e) => setForm((f) => f && { ...f, salesNotes: e.target.value })}
          />
        </label>
      </section>

      <p className="text-xs text-slate-muted">
        Plan tier and expiry are managed outside sales. Onboarding checklists stay on the Checklists tab.
      </p>

      {phoneWarning ? <p className="text-xs text-amber-700">{phoneWarning}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setEditing(false);
            setForm(toForm(profile));
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
