"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SlideOver } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";
import {
  CeremonyBudgetFields,
  type CeremonyEntry,
} from "@/components/leads/CeremonyBudgetFields";
import {
  PortalRoutingFields,
} from "@/components/leads/PortalRoutingFields";
import type { LeadRouting } from "@/lib/lead-verify-routing";
import { MakeupLookProfileFields } from "@/components/leads/MakeupLookProfileFields";
import { LeadAIAssistPanel } from "@/components/leads/LeadAIAssistPanel";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";
import { EMPTY_MAKEUP_LOOK, type MakeupLookProfileInput } from "@/lib/makeup-look";
import {
  EMAIL_ERROR,
  isValidEmailOptional,
  isValidPhone10,
  PHONE_ERROR,
} from "@/lib/validation";
import {
  deriveLeadPrimaryRegion,
  resolveRegionFromLocation,
  uniqueRegions,
} from "@/lib/ceremony-region";
import { REGION_OPTIONS } from "@/lib/mua-region";
import { LEAD_EXIT_LABELS } from "@/lib/lead-exit";
import { MAX_VERIFICATION_CONNECT_ATTEMPTS } from "@/lib/lead-uploader-config";
import {
  resolveBudgetTierFromAmount,
  sumCeremonyBudgets,
  coerceBudgetAmount,
  type BudgetTierLimitsConfig,
} from "@/lib/budget-tier";
import type { BrideLead, BudgetTier, CityRegion, LeadEvent, Region } from "@/lib/types";
import {
  BUDGET_TIER_LABELS,
  BUDGET_TIER_RANGES,
  DEFAULT_LEAD_SOURCES,
} from "@/lib/types";
import { parseUploadFormConfig } from "@/lib/upload-form-config";
import { resolveLocationFromCatalog } from "@/lib/city-catalog";
import { PreviousLeadsForPhonePanel } from "@/components/upload/PreviousLeadsForPhonePanel";

type TalkedTo = "bride" | "family" | "both";

function minCeremonyDate(ceremonies: CeremonyEntry[]): string | null {
  const dates = ceremonies
    .map((c) => c.date)
    .filter((d): d is string => !!d);
  if (!dates.length) return null;
  return dates.sort()[0] ?? null;
}

interface VerifyLeadSlideOverProps {
  open: boolean;
  onClose: () => void;
  lead: BrideLead | null;
  onVerified: (outcome?: "verified" | "not_interested" | "not_answering") => void;
  reVerify?: boolean;
  /** Show prior NI / handover context when re-opening from Not interested tab */
  priorContext?: string | null;
  /** RM note when re-opening from Not answering tab */
  notAnsweringNote?: string | null;
  /** Edit verified lead details without re-verification or routing changes */
  editOnly?: boolean;
}

export function VerifyLeadSlideOver({
  open,
  onClose,
  lead,
  onVerified,
  reVerify = false,
  priorContext = null,
  notAnsweringNote = null,
  editOnly = false,
}: VerifyLeadSlideOverProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<Partial<BrideLead>>({});
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
  const [assignmentRegion, setAssignmentRegion] = useState<Region | "">("");
  const [routing, setRouting] = useState<LeadRouting>("rm");
  const [portalCap, setPortalCap] = useState<number | null>(null);
  const [commissionRmId, setCommissionRmId] = useState("");
  const [commissionRms, setCommissionRms] = useState<{ id: string; name: string }[]>([]);
  const [verifiedViaCall, setVerifiedViaCall] = useState(false);
  const [verifiedViaWhatsapp, setVerifiedViaWhatsapp] = useState(false);
  const [talkedTo, setTalkedTo] = useState<TalkedTo | "">("");
  const [saving, setSaving] = useState(false);
  const [exitNote, setExitNote] = useState("");
  const [showNiExit, setShowNiExit] = useState(false);
  const [showNotAnsweringExit, setShowNotAnsweringExit] = useState(false);
  const [showCloseExit, setShowCloseExit] = useState(false);
  const [connectAttempts, setConnectAttempts] = useState(0);
  const [connectNote, setConnectNote] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [cities, setCities] = useState<CityRegion[]>([]);
  const [tierLimits, setTierLimits] = useState<BudgetTierLimitsConfig | null>(null);
  const [tierRanges, setTierRanges] = useState(BUDGET_TIER_RANGES);
  const [leadSources, setLeadSources] = useState<string[]>(DEFAULT_LEAD_SOURCES);
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [regionLocked, setRegionLocked] = useState(false);
  const [source, setSource] = useState("");
  const [sourceOther, setSourceOther] = useState("");
  const [ceremonyTypes, setCeremonyTypes] = useState<string[]>([]);
  const [makeupLook, setMakeupLook] = useState<MakeupLookProfileInput>({
    ...EMPTY_MAKEUP_LOOK,
  });

  const totalBudget = useMemo(() => sumCeremonyBudgets(ceremonies), [ceremonies]);

  const previewTier = useMemo(() => {
    if (totalBudget <= 0 || !tierLimits) return null;
    return resolveBudgetTierFromAmount(totalBudget, tierLimits);
  }, [totalBudget, tierLimits]);

  const eventDate = useMemo(() => minCeremonyDate(ceremonies), [ceremonies]);

  useEffect(() => {
    if (!open) return;
    void Promise.all([
      fetch("/api/upload/config").then((r) => r.json()),
      fetch("/api/cities").then((r) => r.json()),
    ]).then(([configJson, citiesJson]) => {
      const cfg = parseUploadFormConfig(configJson);
      setCeremonyTypes(cfg.ceremonyTypes);
      setTierLimits(cfg.budgetTierLimits);
      setTierRanges(cfg.budgetTierRanges);
      setLeadSources(cfg.leadSources);
      setCities((citiesJson as { data?: CityRegion[] }).data ?? []);
    });
  }, [open]);

  const regionConflict = uniqueRegions(ceremonies.map((c) => c.region)).length > 1;

  function applyCeremonyRegions(next: CeremonyEntry[]) {
    return next.map((c) => {
      const location = c.location?.trim() ?? "";
      const region = location
        ? resolveRegionFromLocation(location, cities)
        : c.region;
      return { ...c, region };
    });
  }

  function handleCeremoniesChange(next: CeremonyEntry[]) {
    const resolved = applyCeremonyRegions(next);
    setCeremonies(resolved);
    const { region, conflict } = deriveLeadPrimaryRegion({
      ceremonies: resolved,
      assignmentRegion: assignmentRegion || null,
      fallbackRegion: form.region ?? lead?.region ?? null,
    });
    if (!conflict) {
      setForm((f) => ({ ...f, region }));
      setAssignmentRegion("");
    }
  }

  useEffect(() => {
    if (!open || !lead?.id) return;
    void fetch(`/api/leads/${lead.id}/makeup-look`)
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((json: { data?: MakeupLookProfileInput | null }) => {
        if (json.data) setMakeupLook(json.data);
        else setMakeupLook({ ...EMPTY_MAKEUP_LOOK });
      });
  }, [open, lead?.id]);

  useEffect(() => {
    if (!open || !lead?.id) return;
    void fetch(`/api/upload/leads/${lead.id}/ceremonies`)
      .then((r) => r.json())
      .then((json: { data: LeadEvent[] | null }) => {
        const evs = json.data ?? [];
        if (evs.length) {
          setCeremonies(
            evs.map((e) => ({
              name: e.ceremonyType,
              budget: e.budgetAmount ?? null,
              date: e.eventDate?.slice(0, 10) ?? null,
              description: e.description ?? null,
              location: e.eventLocation ?? lead.eventLocation ?? null,
              region: e.region ?? null,
            }))
          );
        }
      });
  }, [open, lead?.id, lead?.eventLocation]);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/staff/commission-rms")
      .then((r) => r.json())
      .then((json: { data: { id: string; name: string }[] }) =>
        setCommissionRms(json.data ?? [])
      );
  }, [open]);

  useEffect(() => {
    if (lead) {
      setForm({ ...lead });
      if (!reVerify && !editOnly) {
        const names =
          (lead as BrideLead & { ceremonies?: string | null }).ceremonies
            ?.split(",")
            .map((s) => s.trim())
            .filter(Boolean) ?? [];
        if (names.length) {
          setCeremonies(
            applyCeremonyRegions(
              names.map((name) => ({
                name,
                budget: null,
                date: lead.eventDate?.slice(0, 10) ?? null,
                description: null,
                location: lead.eventLocation ?? null,
                region: lead.region ?? null,
              }))
            )
          );
        }
      }
      setRouting("rm");
      setPortalCap(null);
      setCommissionRmId("");
      setVerifiedViaCall(false);
      setVerifiedViaWhatsapp(false);
      setTalkedTo("");
      setPhoneError(undefined);
      setEmailError(undefined);
      const knownSource = lead.source ?? "";
      if (knownSource && !DEFAULT_LEAD_SOURCES.includes(knownSource)) {
        setSource("Other");
        setSourceOther(knownSource);
      } else if (knownSource && leadSources.includes(knownSource)) {
        setSource(knownSource);
        setSourceOther("");
      } else {
        setSource(knownSource);
        setSourceOther("");
      }
      const match = resolveLocationFromCatalog(
        lead.eventLocation ?? "",
        cities,
      );
      setRegionLocked(!!match);
      setConnectAttempts(lead.verificationConnectAttempts ?? 0);
      setConnectNote("");
      setShowNotAnsweringExit(false);
      setShowCloseExit(false);
    }
  }, [lead, cities, leadSources, reVerify, editOnly]);

  function handleEventLocationChange(value: string) {
    const resolved = resolveLocationFromCatalog(value, cities);
    if (resolved) {
      setForm((f) => ({ ...f, eventLocation: value, region: resolved.region }));
      setRegionLocked(true);
    } else {
      setForm((f) => ({ ...f, eventLocation: value }));
      setRegionLocked(false);
    }
  }

  function validatePhone() {
    const phone = form.phone ?? "";
    const ok = isValidPhone10(phone);
    setPhoneError(ok ? undefined : PHONE_ERROR);
    return ok;
  }

  function validateEmail() {
    const ok = isValidEmailOptional(form.email ?? "");
    setEmailError(ok ? undefined : EMAIL_ERROR);
    return ok;
  }

  const footerLabel = reVerify
    ? routing === "portal"
      ? "Re-verify & list on portal"
      : routing === "both"
        ? "Re-verify & assign"
        : routing === "commission"
          ? "Re-verify & assign commission"
          : "Re-verify & assign RM"
    : routing === "portal"
      ? "Verify & list on portal"
      : routing === "both"
        ? "Verify & assign"
        : routing === "commission"
          ? "Verify & assign commission"
          : "Verify & assign RM";

  const resolvedSource = source === "Other" ? sourceOther.trim() : source.trim();
  const isPendingVerification = !reVerify && !editOnly;
  const canUseConnectAgain = isPendingVerification || reVerify;
  const canCloseWithoutContact = connectAttempts >= MAX_VERIFICATION_CONNECT_ATTEMPTS;
  const hasContactChecklist =
    (verifiedViaCall || verifiedViaWhatsapp) && Boolean(talkedTo);

  async function applyProfileFromPrior(source: {
    id: string;
    displayId: string;
    brideName: string;
    city: string;
    region: string | null;
  }) {
    const [evRes, makeupRes] = await Promise.all([
      fetch(`/api/upload/leads/${source.id}/ceremonies`),
      fetch(`/api/leads/${source.id}/makeup-look`),
    ]);
    const evJson = (await evRes.json()) as { data: LeadEvent[] | null };
    const makeupJson = (await makeupRes.json()) as {
      data: MakeupLookProfileInput | null;
    };
    const evs = evJson.data ?? [];
    if (evs.length) {
      setCeremonies(
        applyCeremonyRegions(
          evs.map((e) => ({
            name: e.ceremonyType,
            budget: e.budgetAmount ?? null,
            date: e.eventDate?.slice(0, 10) ?? null,
            description: e.description ?? null,
            location: e.eventLocation ?? source.city ?? null,
            region: e.region ?? (source.region as Region | null) ?? null,
          }))
        )
      );
    }
    if (makeupJson.data) {
      setMakeupLook(makeupJson.data);
    }
    if (!evs.length && !makeupJson.data) {
      toast(`No ceremony or makeup profile on ${source.displayId}`, "error");
      return;
    }
    toast(`Loaded profile from ${source.displayId}`, "success");
  }

  async function submitConnectAgain() {
    if (!lead) return;
    setConnecting(true);
    const res = await fetch(`/api/upload/leads/${lead.id}/connect-again`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: connectNote.trim() || null }),
    });
    const json = (await res.json()) as {
      data: { attempts: number; canClose: boolean } | null;
      error?: string;
    };
    setConnecting(false);
    if (res.ok && json.data) {
      setConnectAttempts(json.data.attempts);
      setConnectNote("");
      toast(
        `Connect attempt ${json.data.attempts}/${MAX_VERIFICATION_CONNECT_ATTEMPTS} logged`,
        "success"
      );
    } else {
      toast(json.error ?? "Could not log connect attempt", "error");
    }
  }

  async function submitEdit() {
    if (!lead) return;
    if (!ceremonies.length) {
      toast("Add at least one ceremony", "error");
      return;
    }
    if (!validatePhone() || !validateEmail()) {
      toast("Fix phone or email errors", "error");
      return;
    }
    if (ceremonies.some((c) => !c.location?.trim())) {
      toast("Each ceremony needs a location (city / venue)", "error");
      return;
    }
    if (regionConflict && !assignmentRegion) {
      toast("Select the main region for RM assignment", "error");
      return;
    }
    if (!eventDate || ceremonies.some((c) => !c.date?.trim())) {
      toast("Each ceremony needs a date", "error");
      return;
    }
    if (totalBudget <= 0) {
      toast("Enter a budget for each ceremony", "error");
      return;
    }
    setSaving(true);
    const { budgetTier: _omitTier, budgetAmount: _omitAmt, ...leadFields } = form;
    const res = await fetch(`/api/upload/leads/${lead.id}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...leadFields,
        eventDate,
        source: resolvedSource || null,
        ceremonies: ceremonies.map((c) => ({
          name: c.name,
          budget: c.budget,
          date: c.date,
          description: c.description,
          location: c.location,
          region: c.region,
        })),
        assignmentRegion: assignmentRegion || undefined,
        makeupLook,
      }),
    });
    setSaving(false);
    if (res.ok) {
      onVerified("verified");
      onClose();
    } else {
      const json = (await res.json()) as { error?: string };
      toast(json.error ?? "Could not save changes", "error");
    }
  }

  async function submitCloseLead() {
    if (!lead) return;
    if (exitNote.trim().length < 5) {
      toast("Add a closing note (min 5 characters)", "error");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/upload/leads/${lead.id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close_lead", note: exitNote.trim() }),
    });
    setSaving(false);
    if (res.ok) {
      onVerified("not_interested");
      onClose();
      setExitNote("");
      setShowCloseExit(false);
    } else {
      const json = (await res.json()) as { error?: string };
      toast(json.error ?? "Could not close lead", "error");
    }
  }

  async function submit(
    verifyOutcome: "complete" | "not_interested_archive" | "not_answering_archive"
  ) {
    if (!lead) return;
    const closingWithoutContact =
      (verifyOutcome === "not_interested_archive" ||
        verifyOutcome === "not_answering_archive") &&
      !hasContactChecklist;

    if (!closingWithoutContact) {
      if (!verifiedViaCall && !verifiedViaWhatsapp) {
        toast("Confirm verification via call and/or WhatsApp", "error");
        return;
      }
      if (!talkedTo) {
        toast("Select who you spoke with", "error");
        return;
      }
    } else if (!canCloseWithoutContact) {
      toast(
        `Log at least ${MAX_VERIFICATION_CONNECT_ATTEMPTS} connect attempts first (${connectAttempts}/${MAX_VERIFICATION_CONNECT_ATTEMPTS})`,
        "error"
      );
      return;
    }

    if (verifyOutcome === "not_interested_archive" && exitNote.trim().length < 5) {
      toast("Add why the lead is not interested (min 5 characters)", "error");
      return;
    }
    if (verifyOutcome === "not_answering_archive" && exitNote.trim().length < 5) {
      toast(
        `Add a note for ${LEAD_EXIT_LABELS.notAnswering.toLowerCase()} (min 5 characters)`,
        "error"
      );
      return;
    }

    if (!closingWithoutContact) {
      if (!ceremonies.length) {
        toast("Add at least one ceremony", "error");
        return;
      }
      if (!validatePhone() || !validateEmail()) {
        toast("Fix phone or email errors", "error");
        return;
      }
      if (ceremonies.some((c) => !c.location?.trim())) {
        toast("Each ceremony needs a location (city / venue)", "error");
        return;
      }
      if (regionConflict && !assignmentRegion) {
        toast("Select the main region for RM assignment", "error");
        return;
      }
      if (!eventDate) {
        toast("Add a date for every ceremony (required at verification)", "error");
        return;
      }
      const missingCeremonyDate = ceremonies.some((c) => !c.date?.trim());
      if (missingCeremonyDate) {
        toast("Each ceremony needs a date before verification", "error");
        return;
      }
      if (verifyOutcome === "complete" && totalBudget <= 0) {
        toast("Enter a budget for each ceremony — tier is set from the total", "error");
        return;
      }
    }
    if (verifyOutcome === "complete" && routing === "commission" && !commissionRmId) {
      toast("Select a Commission RM", "error");
      return;
    }
    setSaving(true);
    const { budgetTier: _omitTier, budgetAmount: _omitAmt, ...leadFields } = form;
    const res = await fetch(`/api/upload/leads/${lead.id}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...leadFields,
        eventDate,
        source: resolvedSource || null,
        ceremonies: ceremonies.map((c) => ({
          name: c.name,
          budget: c.budget,
          date: c.date,
          description: c.description,
          location: c.location,
          region: c.region,
        })),
        assignmentRegion: assignmentRegion || undefined,
        routing,
        commissionRmId: routing === "commission" ? commissionRmId : null,
        portalOnly: routing === "portal",
        portalPushed: routing === "portal" || routing === "both",
        portalCap,
        verifiedViaCall,
        verifiedViaWhatsapp,
        talkedTo,
        verifyOutcome,
        exitNote:
          verifyOutcome === "not_interested_archive" ||
          verifyOutcome === "not_answering_archive"
            ? exitNote.trim()
            : null,
        makeupLook,
      }),
    });
    setSaving(false);
    if (res.ok) {
      const json = (await res.json()) as { data?: { outcome?: string } };
      const outcome = json.data?.outcome;
      onVerified(
        outcome === "not_interested"
          ? "not_interested"
          : outcome === "not_answering"
            ? "not_answering"
            : "verified"
      );
      onClose();
      setExitNote("");
      setShowNiExit(false);
      setShowNotAnsweringExit(false);
      setShowCloseExit(false);
    } else {
      const json = (await res.json()) as { error?: string };
      toast(json.error ?? "Verification failed", "error");
    }
  }

  if (!lead) return null;

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={
        editOnly
          ? `Edit lead — ${lead.brideName}`
          : `${reVerify ? "Re-verify" : "Verify"} — ${lead.brideName}`
      }
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {!editOnly && isPendingVerification && (
            <Button
              variant="secondary"
              disabled={
                saving ||
                (!canCloseWithoutContact && !hasContactChecklist)
              }
              onClick={() => {
                setShowNotAnsweringExit(false);
                setShowCloseExit(false);
                setShowNiExit((v) => !v);
              }}
              title={
                !canCloseWithoutContact && !hasContactChecklist
                  ? `Log ${MAX_VERIFICATION_CONNECT_ATTEMPTS} connect attempts first`
                  : undefined
              }
            >
              {LEAD_EXIT_LABELS.notInterested}
            </Button>
          )}
          {!editOnly && isPendingVerification && canCloseWithoutContact && (
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => {
                setShowNiExit(false);
                setShowCloseExit(false);
                setShowNotAnsweringExit((v) => !v);
              }}
            >
              {LEAD_EXIT_LABELS.notAnswering}
            </Button>
          )}
          {!editOnly && isPendingVerification && (
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => {
                setShowNiExit(false);
                setShowNotAnsweringExit(false);
                setShowCloseExit((v) => !v);
              }}
            >
              {LEAD_EXIT_LABELS.closeLead}
            </Button>
          )}
          <Button
            disabled={saving || !ceremonies.length}
            onClick={() => void (editOnly ? submitEdit() : submit("complete"))}
          >
            {saving ? "Saving…" : editOnly ? "Save changes" : footerLabel}
          </Button>
        </>
      }
    >
      {reVerify && (notAnsweringNote || lead.hostileNote) && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-medium">Previous {LEAD_EXIT_LABELS.notAnswering} note</p>
          <p className="mt-1 text-red-800">{notAnsweringNote ?? lead.hostileNote}</p>
        </div>
      )}
      {reVerify && priorContext && !notAnsweringNote && !lead.hostileNote && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">Previous not-interested / handover</p>
          <p className="mt-1">{priorContext}</p>
        </div>
      )}

      {lead?.phone ? (
        <div className="mb-4">
          <PreviousLeadsForPhonePanel
            phone={lead.phone}
            excludeLeadId={lead.id}
            title={
              isPendingVerification
                ? "Previous enquiry on this phone"
                : "Other leads on this phone"
            }
            immediate={isPendingVerification}
            onUseProfile={!editOnly ? (row) => applyProfileFromPrior(row) : undefined}
          />
        </div>
      ) : null}

      {!editOnly && canUseConnectAgain && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <p className="font-medium text-brand">Could not reach the bride yet?</p>
          <p className="mt-1 text-slate-muted">
            Use <span className="font-medium">{LEAD_EXIT_LABELS.connectAgain}</span> when
            call or WhatsApp gets no answer. Log one attempt per day. After{" "}
            {MAX_VERIFICATION_CONNECT_ATTEMPTS} attempts you can mark{" "}
            {LEAD_EXIT_LABELS.notAnswering.toLowerCase()}, {LEAD_EXIT_LABELS.closeLead.toLowerCase()},
            or {LEAD_EXIT_LABELS.notInterested.toLowerCase()} from here.
          </p>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-medium text-slate-muted">
              Optional note for next attempt
            </span>
            <textarea
              className="min-h-[60px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="e.g. rang twice, went to voicemail"
              value={connectNote}
              onChange={(e) => setConnectNote(e.target.value)}
            />
          </label>
          <Button
            className="mt-3"
            variant="secondary"
            disabled={connecting || saving}
            onClick={() => void submitConnectAgain()}
          >
            {connecting
              ? "Saving…"
              : `${LEAD_EXIT_LABELS.connectAgain} (${connectAttempts}/${MAX_VERIFICATION_CONNECT_ATTEMPTS})`}
          </Button>
        </div>
      )}

      {!editOnly && showNiExit && (
        <div className="mb-4 space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-950">
            {LEAD_EXIT_LABELS.notInterested}
          </p>
          <p className="text-xs text-amber-900">
            {hasContactChecklist
              ? "Bride does not want Olready or details are wrong. Lead goes to uploader Review."
              : canCloseWithoutContact
                ? "Close without a successful verification call after logged connect attempts."
                : `Log ${MAX_VERIFICATION_CONNECT_ATTEMPTS} connect attempts before closing without contact.`}
          </p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Why not interested? *</span>
            <textarea
              className="min-h-[80px] w-full rounded-lg border border-amber-200 px-3 py-2 text-sm"
              placeholder="e.g. already booked MUA, wrong number, not looking for services"
              value={exitNote}
              onChange={(e) => setExitNote(e.target.value)}
            />
          </label>
          <Button
            variant="danger"
            disabled={
              saving ||
              exitNote.trim().length < 5 ||
              (isPendingVerification && !canCloseWithoutContact && !hasContactChecklist)
            }
            onClick={() => void submit("not_interested_archive")}
          >
            {saving ? "Saving…" : LEAD_EXIT_LABELS.notInterested}
          </Button>
        </div>
      )}

      {!editOnly && showCloseExit && isPendingVerification && (
        <div className="mb-4 space-y-3 rounded-lg border border-slate-300 bg-slate-50 p-4">
          <p className="text-sm font-medium text-brand">{LEAD_EXIT_LABELS.closeLead}</p>
          <p className="text-xs text-slate-muted">
            Finalize this lead off the pipeline without sending it to the review queue.
          </p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Closing note (min 5 characters) *</span>
            <textarea
              className="min-h-[80px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Why this lead is closed"
              value={exitNote}
              onChange={(e) => setExitNote(e.target.value)}
            />
          </label>
          <Button
            variant="danger"
            disabled={saving || exitNote.trim().length < 5}
            onClick={() => void submitCloseLead()}
          >
            {saving ? "Saving…" : LEAD_EXIT_LABELS.closeLead}
          </Button>
        </div>
      )}

      {!editOnly && showNotAnsweringExit && (
        <div className="mb-4 space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-950">{LEAD_EXIT_LABELS.notAnswering}</p>
          <p className="text-xs text-red-900">
            Bride could not be reached after {MAX_VERIFICATION_CONNECT_ATTEMPTS} connect
            attempts. Lead goes to uploader Review.
          </p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              Short note for not answering (min 5 characters) *
            </span>
            <textarea
              className="min-h-[80px] w-full rounded-lg border border-red-200 px-3 py-2 text-sm"
              placeholder="e.g. no answer on 2 days, number switched off"
              value={exitNote}
              onChange={(e) => setExitNote(e.target.value)}
            />
          </label>
          <Button
            variant="danger"
            disabled={saving || exitNote.trim().length < 5}
            onClick={() => void submit("not_answering_archive")}
          >
            {saving ? "Saving…" : LEAD_EXIT_LABELS.notAnswering}
          </Button>
        </div>
      )}

      {!editOnly && (
      <div className="mb-6 space-y-4 rounded-lg border border-accent/30 bg-accent/5 p-4">
        <p className="text-sm font-medium text-brand">Verification checklist</p>
        <p className="text-xs text-slate-muted">
          Required before the lead is marked verified. If auto-assign is on, an RM in
          this region will be assigned immediately (unless portal-only).
        </p>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={verifiedViaCall}
              onChange={(e) => setVerifiedViaCall(e.target.checked)}
            />
            Verified via phone call
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={verifiedViaWhatsapp}
              onChange={(e) => setVerifiedViaWhatsapp(e.target.checked)}
            />
            Verified via WhatsApp
          </label>
        </div>
        <div>
          <p className="mb-2 text-sm text-slate-muted">
            Did you talk to the bride or a family member? *
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["bride", "Bride"],
                ["family", "Family member"],
                ["both", "Both"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTalkedTo(value)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  talkedTo === value
                    ? "border-accent bg-accent/10 font-medium text-accent"
                    : "border-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      )}

      {!editOnly && (
      <PortalRoutingFields
        routing={routing}
        onRoutingChange={setRouting}
        portalCap={portalCap}
        onPortalCapChange={setPortalCap}
        commissionRmId={commissionRmId}
        onCommissionRmIdChange={setCommissionRmId}
        commissionRms={commissionRms}
      />
      )}

      {editOnly && (
        <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-muted">
          Update bride details and ceremonies. Routing and RM assignment are unchanged —
          use <span className="font-medium text-brand">Manage</span> on the list to move
          portal / commission / RM queue.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Bride name"
          value={form.brideName ?? ""}
          onChange={(e) => setForm({ ...form, brideName: e.target.value })}
        />
        <Input
          label="Phone"
          type="text"
          inputMode="numeric"
          value={form.phone ?? ""}
          error={phoneError}
          onChange={(e) => {
            setForm({ ...form, phone: e.target.value });
            if (phoneError) setPhoneError(undefined);
          }}
          onBlur={validatePhone}
        />
        <Input
          label="Email"
          type="email"
          value={form.email ?? ""}
          error={emailError}
          onChange={(e) => {
            setForm({ ...form, email: e.target.value });
            if (emailError) setEmailError(undefined);
          }}
          onBlur={validateEmail}
        />
        <Input
          label="City"
          value={form.city ?? ""}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />
        <div className="text-sm sm:col-span-2">
          <span className="mb-1 block text-slate-muted">Budget tier (auto)</span>
          {previewTier ? (
            <p className="font-medium text-brand">
              {BUDGET_TIER_LABELS[previewTier]} ({tierRanges[previewTier]})
            </p>
          ) : (
            <p className="text-slate-muted">
              Enter ceremony budgets — tier is calculated from the total at verification.
            </p>
          )}
        </div>
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
        {!regionConflict ? (
          <label className="text-sm">
            <span className="mb-1 block text-slate-muted">Lead region (assignment)</span>
            <select
              className="w-full rounded-lg border px-3 py-2 disabled:bg-slate-50"
              value={form.region ?? lead.region ?? "north"}
              disabled={regionLocked}
              onChange={(e) =>
                setForm({ ...form, region: e.target.value as Region })
              }
            >
              {(["north", "east", "west", "south"] as Region[]).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {regionLocked && (
              <p className="mt-1 text-xs text-slate-muted">Set from ceremony cities</p>
            )}
          </label>
        ) : (
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-amber-900">
              Main region for RM assignment *
            </span>
            <p className="mb-2 text-xs text-amber-800">
              Ceremonies are in different regions. Choose which region owns this lead.
            </p>
            <select
              className="w-full rounded-lg border border-amber-300 px-3 py-2"
              value={assignmentRegion}
              onChange={(e) => {
                const r = e.target.value as Region;
                setAssignmentRegion(r);
                setForm((f) => ({ ...f, region: r }));
              }}
            >
              <option value="">Select region…</option>
              {uniqueRegions(ceremonies.map((c) => c.region)).map((r) => (
                <option key={r} value={r}>
                  {REGION_OPTIONS.find((o) => o.value === r)?.label ?? r}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm">
          <span className="mb-1 block text-slate-muted">Source</span>
          <select
            className="w-full rounded-lg border px-3 py-2"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="">Select source…</option>
            {leadSources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {source === "Other" && (
          <Input
            label="Source (other)"
            value={sourceOther}
            onChange={(e) => setSourceOther(e.target.value)}
          />
        )}
      </div>

      <div className="mt-6 space-y-4 rounded-lg border border-slate-200 p-4">
        <WhatsAppComposer
          audience="bride"
          leadId={lead.id}
          bridePhone={form.phone ?? lead.phone}
          context={{ brideName: form.brideName ?? lead.brideName, city: form.city ?? lead.city }}
          templatePool="rmBride"
        />
        <LeadAIAssistPanel leadId={lead.id} defaultContext="verification" />
      </div>

      <div className="mt-6">
        <CeremonyBudgetFields
          ceremonies={ceremonies}
          onChange={handleCeremoniesChange}
          quickOptions={ceremonyTypes}
          cityOptions={cities.map((c) => c.city)}
          requireCeremonyDates
          requireCeremonyLocations
          datesHint="Each ceremony needs a date and location (city) to verify"
        />
      </div>

      <div className="mt-4">
        <MakeupLookProfileFields
          value={makeupLook}
          onChange={setMakeupLook}
          showV2={false}
          defaultOpen={false}
          events={ceremonies.map((c) => ({ id: c.name, label: c.name }))}
        />
      </div>
    </SlideOver>
  );
}
