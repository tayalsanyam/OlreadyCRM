"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { ceremonyIcon } from "@/components/leads/CeremonyBudgetFields";
import { parseUploadFormConfig } from "@/lib/upload-form-config";
import { resolveRegionFromLocation } from "@/lib/ceremony-region";
import { REGION_OPTIONS } from "@/lib/mua-region";
import type { CityRegion, LeadEvent, Region } from "@/lib/types";

export interface AddCeremonyLeadDefaults {
  eventDate: string;
  eventLocation: string | null;
  region: Region | null;
  budgetAmount: number | null;
  city: string;
}

const OTHER_VALUE = "__other__";

interface AddCeremonyModalProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  leadDefaults: AddCeremonyLeadDefaults;
  existingEvents: LeadEvent[];
  onAdded: () => void;
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}

export function AddCeremonyModal({
  open,
  onClose,
  leadId,
  leadDefaults,
  existingEvents,
  onAdded,
}: AddCeremonyModalProps) {
  const { toast } = useToast();
  const [cities, setCities] = useState<CityRegion[]>([]);
  const [ceremonyTypes, setCeremonyTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [ceremonyChoice, setCeremonyChoice] = useState("");
  const [customName, setCustomName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [region, setRegion] = useState<Region | "">("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [description, setDescription] = useState("");
  const [sameAsLeadDate, setSameAsLeadDate] = useState(true);
  const [sameAsLeadLocation, setSameAsLeadLocation] = useState(true);
  const [sameAsLeadRegion, setSameAsLeadRegion] = useState(true);

  const takenNames = useMemo(
    () => new Set(existingEvents.map((e) => normalizeName(e.ceremonyType))),
    [existingEvents],
  );

  const availableTypes = useMemo(
    () => ceremonyTypes.filter((c) => !takenNames.has(normalizeName(c))),
    [ceremonyTypes, takenNames],
  );

  const ceremonyOptions = useMemo(
    () => [
      ...availableTypes.map((c) => ({
        value: c,
        label: `${ceremonyIcon(c)} ${c}`,
      })),
      { value: OTHER_VALUE, label: "Other (custom name)…" },
    ],
    [availableTypes],
  );

  const useCustom = ceremonyChoice === OTHER_VALUE;
  const leadDateIso = leadDefaults.eventDate?.slice(0, 10) ?? "";
  const leadLocation = leadDefaults.eventLocation?.trim() ?? "";

  useEffect(() => {
    if (!open) return;
    void fetch("/api/upload/config")
      .then((r) => r.json())
      .then((json) => {
        const cfg = parseUploadFormConfig(json);
        setCeremonyTypes(cfg.ceremonyTypes);
      })
      .catch(() => setCeremonyTypes(["Haldi", "Mehndi", "Sangeet", "Wedding", "Reception"]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setCeremonyChoice(availableTypes[0] ?? OTHER_VALUE);
    setCustomName("");
    setEventDate(leadDateIso);
    setEventLocation(leadLocation || leadDefaults.city || "");
    setRegion(leadDefaults.region ?? "");
    setBudgetAmount(
      leadDefaults.budgetAmount != null ? String(leadDefaults.budgetAmount) : "",
    );
    setDescription("");
    setSameAsLeadDate(!!leadDateIso);
    setSameAsLeadLocation(!!leadLocation);
    setSameAsLeadRegion(true);
  }, [open, availableTypes, leadDateIso, leadLocation, leadDefaults]);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/cities")
      .then((r) => r.json())
      .then((json: { data: CityRegion[] | null }) => {
        setCities(json.data ?? []);
      })
      .catch(() => setCities([]));
  }, [open]);

  useEffect(() => {
    if (sameAsLeadDate && leadDateIso) setEventDate(leadDateIso);
  }, [sameAsLeadDate, leadDateIso]);

  useEffect(() => {
    if (sameAsLeadLocation && leadLocation) setEventLocation(leadLocation);
    else if (sameAsLeadLocation && !leadLocation)
      setEventLocation(leadDefaults.city || "");
  }, [sameAsLeadLocation, leadLocation, leadDefaults.city]);

  useEffect(() => {
    if (sameAsLeadRegion) setRegion(leadDefaults.region ?? "");
  }, [sameAsLeadRegion, leadDefaults.region]);

  const resolvedName = useCustom ? customName.trim() : ceremonyChoice.trim();

  function inferRegion(): Region | null {
    if (region) return region;
    const loc = eventLocation.trim();
    if (!loc) return null;
    return resolveRegionFromLocation(loc, cities);
  }

  async function submit() {
    const name = resolvedName;
    if (!name || ceremonyChoice === "") {
      toast("Choose or enter a ceremony type", "error");
      return;
    }
    if (takenNames.has(normalizeName(name))) {
      toast("This ceremony is already on the lead", "error");
      return;
    }

    const date = sameAsLeadDate && leadDateIso ? leadDateIso : eventDate.trim();
    if (!date) {
      toast("Ceremony date is required", "error");
      return;
    }

    const location =
      sameAsLeadLocation && leadLocation
        ? leadLocation
        : eventLocation.trim() || (sameAsLeadLocation ? leadDefaults.city : "");
    if (!location) {
      toast("Ceremony location is required", "error");
      return;
    }

    let resolvedRegion: Region | null = sameAsLeadRegion
      ? leadDefaults.region
      : (region as Region) || null;
    if (!resolvedRegion) {
      resolvedRegion = resolveRegionFromLocation(location, cities);
    }
    if (!resolvedRegion) {
      toast("Pick a region or use a recognised city name", "error");
      return;
    }

    const budget = budgetAmount.trim() === "" ? null : Number(budgetAmount);
    if (budget != null && (!Number.isFinite(budget) || budget < 0)) {
      toast("Enter a valid budget amount", "error");
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/leads/${leadId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ceremonyType: name,
        eventDate: date,
        eventLocation: location,
        region: resolvedRegion,
        budgetAmount: budget,
        description: description.trim() || null,
      }),
    });
    const json = (await res.json()) as { error?: string };
    setLoading(false);
    if (!res.ok) {
      toast(json.error ?? "Could not add ceremony", "error");
      return;
    }
    toast("Ceremony added");
    onAdded();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={() => !loading && onClose()}
      title="Add ceremony"
      footer={
        <>
          <Button variant="ghost" disabled={loading} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={loading} onClick={() => void submit()}>
            {loading ? "Adding…" : "Add ceremony"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-muted">
          For ceremonies the bride did not list at intake. Each ceremony needs date,
          location, and region for MUA push.
        </p>

        <Select
          label="Ceremony type"
          required
          value={ceremonyChoice}
          onChange={(e) => setCeremonyChoice(e.target.value)}
          options={
            ceremonyOptions.length > 1
              ? ceremonyOptions
              : [{ value: OTHER_VALUE, label: "Other (custom name)…" }]
          }
        />

        {useCustom && (
          <Input
            label="Custom ceremony name"
            placeholder="e.g. Cocktail, Roka, Engagement"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
          />
        )}

        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          {leadDateIso && (
            <label className="flex items-center gap-2 text-sm text-brand">
              <input
                type="checkbox"
                checked={sameAsLeadDate}
                onChange={(e) => setSameAsLeadDate(e.target.checked)}
              />
              Same date as lead ({leadDateIso})
            </label>
          )}
          <Input
            label="Ceremony date"
            type="date"
            required
            disabled={sameAsLeadDate && !!leadDateIso}
            value={sameAsLeadDate && leadDateIso ? leadDateIso : eventDate}
            onChange={(e) => setEventDate(e.target.value)}
          />

          {(leadLocation || leadDefaults.city) && (
            <label className="flex items-center gap-2 text-sm text-brand">
              <input
                type="checkbox"
                checked={sameAsLeadLocation}
                onChange={(e) => setSameAsLeadLocation(e.target.checked)}
              />
              Same location as lead ({leadLocation || leadDefaults.city})
            </label>
          )}
          <Input
            label="Location (city / venue)"
            required
            disabled={sameAsLeadLocation && !!leadLocation}
            value={
              sameAsLeadLocation && leadLocation ? leadLocation : eventLocation
            }
            onChange={(e) => setEventLocation(e.target.value)}
            placeholder="City or venue"
            list={cities.length ? "add-ceremony-cities" : undefined}
          />
          {cities.length > 0 && (
            <datalist id="add-ceremony-cities">
              {cities.map((c) => (
                <option key={c.city} value={c.city} />
              ))}
            </datalist>
          )}

          <label className="flex items-center gap-2 text-sm text-brand">
            <input
              type="checkbox"
              checked={sameAsLeadRegion}
              onChange={(e) => setSameAsLeadRegion(e.target.checked)}
            />
            Same region as lead (
            {REGION_OPTIONS.find((o) => o.value === leadDefaults.region)?.label ??
              leadDefaults.region}
            )
          </label>
          <Select
            label="Region"
            required
            disabled={sameAsLeadRegion}
            value={sameAsLeadRegion ? (leadDefaults.region ?? "") : region}
            onChange={(e) => setRegion(e.target.value as Region)}
            options={REGION_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
          />
          {!sameAsLeadRegion && eventLocation.trim() && !region && (
            <p className="text-xs text-slate-muted">
              Region from location:{" "}
              {inferRegion()
                ? REGION_OPTIONS.find((o) => o.value === inferRegion())?.label
                : "— pick manually"}
            </p>
          )}

          <Input
            label="Budget (Rs.)"
            type="number"
            min={0}
            placeholder="Optional"
            value={budgetAmount}
            onChange={(e) => setBudgetAmount(e.target.value)}
          />
          <Input
            label="Notes"
            placeholder="Optional"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
