"use client";

import { useEffect, useMemo, useState } from "react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  CeremonyBudgetFields,
  type CeremonyEntry,
} from "@/components/leads/CeremonyBudgetFields";
import {
  PortalRoutingFields,
  type LeadRouting,
} from "@/components/leads/PortalRoutingFields";
import {
  EMAIL_ERROR,
  isValidEmailOptional,
  isValidPhone10,
  PHONE_ERROR,
} from "@/lib/validation";
import {
  resolveBudgetTierFromAmount,
  sumCeremonyBudgets,
  type BudgetTierLimitsConfig,
} from "@/lib/budget-tier";
import type { BudgetTier, CityRegion, Region } from "@/lib/types";
import { BUDGET_TIER_LABELS, BUDGET_TIER_RANGES } from "@/lib/types";
import { parseUploadFormConfig } from "@/lib/upload-form-config";
import { resolveLocationFromCatalog } from "@/lib/city-catalog";
import { LeadCityField } from "@/components/leads/LeadCityField";
import { PreviousLeadsForPhonePanel } from "@/components/upload/PreviousLeadsForPhonePanel";

const REGIONS: { value: Region; label: string }[] = [
  { value: "north", label: "North" },
  { value: "east", label: "East" },
  { value: "west", label: "West" },
  { value: "south", label: "South" },
];

function minCeremonyDate(ceremonies: CeremonyEntry[]): string | null {
  const dates = ceremonies
    .map((c) => c.date)
    .filter((d): d is string => !!d);
  if (!dates.length) return null;
  return dates.sort()[0] ?? null;
}

interface AddLeadModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (leadId?: string) => void;
  /** Admin creates verified leads; uploader creates pending verification. */
  mode?: "admin" | "uploader";
  initialBrideName?: string;
  initialPhone?: string;
  initialSource?: string;
  feedbackReferralId?: string | null;
}

export function AddLeadModal({
  open,
  onClose,
  onCreated,
  mode = "admin",
  initialBrideName,
  initialPhone,
  initialSource,
  feedbackReferralId,
}: AddLeadModalProps) {
  const { toast } = useToast();
  const [ceremonyTypes, setCeremonyTypes] = useState<string[]>([]);
  const [ceremonies, setCeremonies] = useState<CeremonyEntry[]>([
    {
      name: "Wedding",
      budget: null,
      date: null,
      description: null,
      location: null,
      region: null,
    },
  ]);
  const [routing, setRouting] = useState<LeadRouting>("rm");
  const [portalCap, setPortalCap] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [cities, setCities] = useState<CityRegion[]>([]);
  const [tierLimits, setTierLimits] = useState<BudgetTierLimitsConfig | null>(null);
  const [tierRanges, setTierRanges] = useState(BUDGET_TIER_RANGES);
  const [leadSources, setLeadSources] = useState<string[]>([]);
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [regionLocked, setRegionLocked] = useState(false);
  const [cityGeo, setCityGeo] = useState<{ state?: string | null; region: Region } | null>(null);
  const [cityByState, setCityByState] = useState(false);
  const [pickedState, setPickedState] = useState("");
  const [form, setForm] = useState({
    brideName: "",
    phone: "",
    email: "",
    city: "",
    region: "north" as Region | "",
    eventLocation: "",
    source: "",
    sourceOther: "",
    groupSize: "",
    groupNotes: "",
  });

  const totalBudget = useMemo(() => sumCeremonyBudgets(ceremonies), [ceremonies]);

  const eventDate = useMemo(() => minCeremonyDate(ceremonies), [ceremonies]);

  const previewTier = useMemo(() => {
    if (totalBudget <= 0 || !tierLimits) return null;
    return resolveBudgetTierFromAmount(totalBudget, tierLimits);
  }, [totalBudget, tierLimits]);

  useEffect(() => {
    if (!open) return;

    setCeremonies([
      {
        name: "Wedding",
        budget: null,
        date: null,
        description: null,
        location: null,
        region: null,
      },
    ]);
    setRouting("rm");
    setPortalCap(null);
    setPhoneError(undefined);
    setEmailError(undefined);
    setRegionLocked(false);
    setCityGeo(null);
    setCityByState(false);
    setPickedState("");
    setForm({
      brideName: initialBrideName?.trim() ?? "",
      phone: initialPhone?.trim() ?? "",
      email: "",
      city: "",
      region: mode === "admin" ? "north" : "",
      eventLocation: "",
      source: initialSource?.trim() ?? "",
      sourceOther: "",
      groupSize: "",
      groupNotes: "",
    });

    const configUrl =
      mode === "uploader" ? "/api/upload/config" : "/api/admin/config";
    void Promise.all([
      fetch(configUrl).then((r) => r.json()),
      fetch("/api/cities").then((r) => r.json()),
    ]).then(([configJson, citiesJson]) => {
      const cfg = parseUploadFormConfig(configJson);
      setCeremonyTypes(cfg.ceremonyTypes);
      setTierLimits(cfg.budgetTierLimits);
      setTierRanges(cfg.budgetTierRanges);
      setLeadSources(cfg.leadSources);
      setCities((citiesJson as { data?: CityRegion[] }).data ?? []);
    });
  }, [open, mode, initialBrideName, initialPhone, initialSource]);

  function handleCityChange(value: string) {
    setForm((f) => ({ ...f, city: value }));
  }

  function handleCityResolved(
    geo: { state?: string | null; region: Region } | null,
    locked: boolean,
  ) {
    setCityGeo(geo);
    setRegionLocked(locked);
    if (geo) {
      setForm((f) => ({ ...f, region: geo.region }));
    } else if (mode !== "admin") {
      setForm((f) => ({ ...f, region: "" }));
    }
  }

  function handleEventLocationChange(value: string) {
    const resolved = resolveLocationFromCatalog(value, cities);
    setForm((f) => ({ ...f, eventLocation: value }));
    if (resolved && !cityByState) {
      setForm((f) => ({ ...f, eventLocation: value, region: resolved.region }));
      setCityGeo({ state: resolved.state, region: resolved.region });
      setRegionLocked(true);
    } else if (!form.city.trim() && !cityByState) {
      setCityGeo(null);
      setRegionLocked(false);
    }
  }

  function validatePhone() {
    const ok = isValidPhone10(form.phone);
    setPhoneError(ok ? undefined : PHONE_ERROR);
    return ok;
  }

  function validateEmail() {
    const ok = isValidEmailOptional(form.email);
    setEmailError(ok ? undefined : EMAIL_ERROR);
    return ok;
  }

  const resolvedSource =
    form.source === "Other" ? form.sourceOther.trim() : form.source.trim();

  async function submit() {
    const phoneOk = validatePhone();
    const emailOk = validateEmail();
    if (cityByState && !pickedState) {
      toast("Select a state when city is not in the list", "error");
      return;
    }
    if (
      !form.brideName.trim() ||
      !form.phone.trim() ||
      !form.city.trim() ||
      !phoneOk ||
      !emailOk
    ) {
      toast("Fill all required fields correctly", "error");
      return;
    }
    if (!ceremonies.length) {
      toast("Add at least one ceremony", "error");
      return;
    }
    if (mode === "admin") {
      if (!eventDate) {
        toast("Add a date for at least one ceremony", "error");
        return;
      }
      if (!form.eventLocation?.trim()) {
        toast("Event location is required", "error");
        return;
      }
    }
    setBusy(true);
    const createUrl =
      mode === "uploader"
        ? "/api/upload/leads/create"
        : "/api/admin/leads/create";
    const body: Record<string, unknown> = {
      brideName: form.brideName,
      phone: form.phone,
      email: form.email || undefined,
      city: form.city,
      eventLocation: form.eventLocation?.trim() || undefined,
      eventDate: eventDate ?? undefined,
      source: resolvedSource || undefined,
      groupSize: form.groupSize ? Number(form.groupSize) : undefined,
      groupNotes: form.groupNotes || undefined,
      budgetAmount: totalBudget > 0 ? totalBudget : undefined,
      ceremonies: ceremonies.map((c) => ({
        name: c.name,
        budget: c.budget,
        date: c.date,
        description: c.description,
      })),
    };
    if (mode === "admin") {
      body.region = form.region;
    } else if (form.region) {
      body.region = form.region;
    }
    if (feedbackReferralId) {
      body.feedbackReferralId = feedbackReferralId;
    }
    if (mode === "admin") {
      body.portalOnly = routing === "portal";
      body.portalPushed = routing === "portal" || routing === "both";
      body.portalCap = portalCap;
    }
    const res = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    const json = (await res.json()) as {
      data?: { lead?: { id?: string } };
      error?: string;
    };
    if (res.ok) {
      toast(
        mode === "uploader"
          ? "Lead added — pending verification"
          : "Lead created"
      );
      onCreated(json.data?.lead?.id);
      onClose();
    } else {
      toast(json.error ?? "Failed to create lead", "error");
    }
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="Add lead"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {mode === "uploader" ? "Add lead" : "Create lead"}
          </Button>
        </>
      }
    >
      {mode === "uploader" ? (
        <p className="mb-4 text-sm text-slate-muted">
          New leads appear under Pending verification until you verify them (call /
          WhatsApp checklist).
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-muted">
            Creates a verified lead for admin assignment. RMs are auto-assigned when a
            lead is verified via the uploader flow.
          </p>
          <PortalRoutingFields
            routing={routing}
            onRoutingChange={setRouting}
            portalCap={portalCap}
            onPortalCapChange={setPortalCap}
          />
        </>
      )}
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Bride name *"
            value={form.brideName}
            onChange={(e) => setForm({ ...form, brideName: e.target.value })}
          />
          <Input
            label="Phone *"
            type="text"
            inputMode="numeric"
            value={form.phone}
            error={phoneError}
            onChange={(e) => {
              setForm({ ...form, phone: e.target.value });
              if (phoneError) setPhoneError(undefined);
            }}
            onBlur={validatePhone}
          />
          {form.phone.trim().length >= 10 ? (
            <div className="sm:col-span-2">
              <PreviousLeadsForPhonePanel phone={form.phone} />
            </div>
          ) : null}
          <Input
            label="Email"
            type="email"
            value={form.email}
            error={emailError}
            onChange={(e) => {
              setForm({ ...form, email: e.target.value });
              if (emailError) setEmailError(undefined);
            }}
            onBlur={validateEmail}
          />
          <LeadCityField
            required
            cities={cities}
            city={form.city}
            resetKey={open}
            onCityChange={handleCityChange}
            onResolved={handleCityResolved}
            onStatePickerChange={(active, state) => {
              setCityByState(active);
              setPickedState(state);
            }}
            hint="City, state (Goa), or alias (Bombay, NCR)"
          />
          <div>
            <Input
              label={mode === "admin" ? "Event location (city) *" : "Event location (city)"}
              list="lead-event-cities"
              value={form.eventLocation}
              onChange={(e) => handleEventLocationChange(e.target.value)}
            />
            <datalist id="lead-event-cities">
              {cities.map((c) => (
                <option key={`evt-${c.city}`} value={c.city} />
              ))}
            </datalist>
            {mode === "uploader" && (
              <p className="mt-1 text-xs text-slate-muted">
                Optional now — required when verifying the lead
              </p>
            )}
          </div>
          {mode === "admin" ? (
            <Select
              label="Region *"
              value={form.region}
              disabled={regionLocked}
              onChange={(e) =>
                setForm({ ...form, region: e.target.value as Region })
              }
              options={REGIONS}
            />
          ) : null}
          {cityGeo ? (
            <p className="text-xs text-slate-muted sm:col-span-2">
              Auto from city:{" "}
              {cityGeo.state ? (
                <span>
                  State <strong>{cityGeo.state}</strong>
                  {" · "}
                </span>
              ) : null}
              Region{" "}
              <strong>
                {REGIONS.find((r) => r.value === cityGeo.region)?.label ?? cityGeo.region}
              </strong>
            </p>
          ) : mode === "uploader" ? (
            <p className="text-xs text-slate-muted sm:col-span-2">
              Region is optional now — it will be confirmed when you verify this lead.
            </p>
          ) : null}
          {mode === "admin" && regionLocked && !cityGeo ? (
            <p className="text-xs text-slate-muted sm:col-span-2">
              Region set from event city
            </p>
          ) : null}
          {mode === "uploader" ? (
            <p className="text-sm text-slate-muted sm:col-span-2">
              Budget tier is assigned automatically when you verify the lead, from
              the sum of ceremony budgets.
            </p>
          ) : previewTier ? (
            <p className="text-sm text-slate-muted sm:col-span-2">
              Budget tier (from ceremony budgets):{" "}
              <strong>
                {BUDGET_TIER_LABELS[previewTier]} ({tierRanges[previewTier]})
              </strong>
            </p>
          ) : null}
          {totalBudget > 0 && (
            <p className="text-sm text-slate-muted sm:col-span-2">
              Total event budgets: Rs.{" "}
              {totalBudget.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              {eventDate && (
                <span className="ml-2">
                  · Earliest event:{" "}
                  {new Date(eventDate).toLocaleDateString("en-IN")}
                </span>
              )}
            </p>
          )}
          <Select
            label="Source"
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            options={[
              { value: "", label: "Select source…" },
              ...leadSources.map((s) => ({ value: s, label: s })),
            ]}
          />
          {form.source === "Other" && (
            <Input
              label="Source (other)"
              value={form.sourceOther}
              onChange={(e) => setForm({ ...form, sourceOther: e.target.value })}
              placeholder="Describe source"
            />
          )}
          <Input
            label="Group size"
            type="number"
            value={form.groupSize}
            onChange={(e) => setForm({ ...form, groupSize: e.target.value })}
          />
        </div>
        <Input
          label="Group notes"
          value={form.groupNotes}
          onChange={(e) => setForm({ ...form, groupNotes: e.target.value })}
        />
        <CeremonyBudgetFields
          ceremonies={ceremonies}
          onChange={setCeremonies}
          quickOptions={ceremonyTypes}
          requireCeremonyDates={mode === "admin"}
          datesHint={
            mode === "uploader"
              ? "Ceremony dates optional until verification"
              : undefined
          }
        />
      </div>
    </SlideOver>
  );
}
