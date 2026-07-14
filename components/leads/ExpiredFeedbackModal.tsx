"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { FEEDBACK_NEGATIVE_REASONS, FEEDBACK_MAX_UNREACHABLE_ATTEMPTS } from "@/lib/feedback-constants";
import type { FeedbackUnreachableAttemptKind } from "@/lib/feedback-constants";
import { MuaSearchPicker } from "@/components/muas/MuaSearchPicker";
import { isValidPhone10, PHONE_ERROR } from "@/lib/validation";
import type {
  Booking,
  FeedbackEngageAgain,
  FeedbackMuaType,
  FeedbackServiceSentiment,
  LeadEvent,
  MuaPushWithDetails,
} from "@/lib/types";

type MuaOption = { id: string; label: string; city?: string | null; displayId?: string | null };

type ReferralRow = { name: string; phone: string };

interface ExpiredFeedbackModalProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  brideName: string;
  unreachableAttemptCount?: number;
  onSubmitted: () => void;
}

export function ExpiredFeedbackModal({
  open,
  onClose,
  leadId,
  brideName,
  unreachableAttemptCount: unreachableAttemptCountProp,
  onSubmitted,
}: ExpiredFeedbackModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreachableAttemptCount, setUnreachableAttemptCount] = useState(
    unreachableAttemptCountProp ?? 0,
  );
  const [muaOptions, setMuaOptions] = useState<MuaOption[]>([]);
  const [cities, setCities] = useState<{ city: string }[]>([]);

  const [muaType, setMuaType] = useState<FeedbackMuaType>("olready");
  const [olreadyMuaId, setOlreadyMuaId] = useState("");
  const [olreadyMuaLabel, setOlreadyMuaLabel] = useState("");
  const [nonOlreadyName, setNonOlreadyName] = useState("");
  const [prospectPhone, setProspectPhone] = useState("");
  const [prospectInsta, setProspectInsta] = useState("");
  const [prospectCity, setProspectCity] = useState("");
  const [serviceSentiment, setServiceSentiment] =
    useState<FeedbackServiceSentiment>("positive");
  const [negativeReasons, setNegativeReasons] = useState<string[]>([]);
  const [negativeOther, setNegativeOther] = useState("");
  const [recommendationsNote, setRecommendationsNote] = useState("");
  const [referralsNote, setReferralsNote] = useState("");
  const [olreadyServiceNote, setOlreadyServiceNote] = useState("");
  const [muaServiceNote, setMuaServiceNote] = useState("");
  const [olreadyRating, setOlreadyRating] = useState<number | null>(null);
  const [muaRating, setMuaRating] = useState<number | null>(null);
  const [engageAgain, setEngageAgain] = useState<FeedbackEngageAgain>("yes");
  const [engageAgainNote, setEngageAgainNote] = useState("");
  const [referralRows, setReferralRows] = useState<ReferralRow[]>([
    { name: "", phone: "" },
  ]);
  const [followUpAt, setFollowUpAt] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [showFullForm, setShowFullForm] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [leadEvents, setLeadEvents] = useState<LeadEvent[]>([]);
  const [eventId, setEventId] = useState("");
  const [scheduleKind, setScheduleKind] =
    useState<FeedbackUnreachableAttemptKind>("busy");

  const reset = useCallback(() => {
    setError(null);
    setShowFullForm(false);
    setScheduleOpen(false);
    setScheduleKind("busy");
    setMuaType("olready");
    setOlreadyMuaId("");
    setOlreadyMuaLabel("");
    setNonOlreadyName("");
    setProspectPhone("");
    setProspectInsta("");
    setProspectCity("");
    setServiceSentiment("positive");
    setNegativeReasons([]);
    setNegativeOther("");
    setRecommendationsNote("");
    setReferralsNote("");
    setOlreadyServiceNote("");
    setMuaServiceNote("");
    setOlreadyRating(null);
    setMuaRating(null);
    setEngageAgain("yes");
    setEngageAgainNote("");
    setReferralRows([{ name: "", phone: "" }]);
    setFollowUpAt("");
    setFollowUpNote("");
    setLeadEvents([]);
    setEventId("");
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    if (unreachableAttemptCountProp != null) {
      setUnreachableAttemptCount(unreachableAttemptCountProp);
    } else {
      void fetch(`/api/leads/${leadId}/feedback`)
        .then((r) => r.json())
        .then((json: { unreachableAttempts?: number }) => {
          setUnreachableAttemptCount(json.unreachableAttempts ?? 0);
        })
        .catch(() => setUnreachableAttemptCount(0));
    }
    void Promise.all([
      fetch(`/api/leads/${leadId}`).then((r) => r.json()),
      fetch(`/api/leads/${leadId}/pushes`).then((r) => r.json()),
      fetch("/api/cities").then((r) => r.json()),
    ]).then(([leadJson, pushJson, citiesJson]) => {
      const events = (leadJson.data?.events ?? []) as LeadEvent[];
      const bookings = (leadJson.data?.bookings ?? []) as Booking[];
      const pushes = (pushJson.data ?? []) as MuaPushWithDetails[];

      const activeEvents = events.filter(
        (e) =>
          e.status !== "notNeeded" && (e.status as string) !== "not_needed"
      );
      setLeadEvents(activeEvents);
      setEventId(activeEvents.length === 1 ? activeEvents[0]!.id : "");

      const pushByMuaId = new Map<string, MuaPushWithDetails>();
      for (const p of pushes) {
        if (p.muaId && !pushByMuaId.has(p.muaId)) {
          pushByMuaId.set(p.muaId, p);
        }
      }

      const opts = new Map<string, MuaOption>();
      for (const b of bookings) {
        if (!b.cancelled && b.muaId) {
          const push = pushByMuaId.get(b.muaId);
          opts.set(b.muaId, {
            id: b.muaId,
            label: push?.muaName ?? b.muaId,
            city: push?.muaCity ?? null,
          });
        }
      }
      for (const p of pushes) {
        if (p.muaId && !opts.has(p.muaId)) {
          opts.set(p.muaId, {
            id: p.muaId,
            label: p.muaName,
            city: p.muaCity ?? null,
          });
        }
      }
      setMuaOptions([...opts.values()]);
      setCities(citiesJson.data ?? []);
    });
  }, [open, leadId, reset, unreachableAttemptCountProp]);

  const cityOptions = useMemo(
    () => [
      { value: "", label: "— City (optional) —" },
      ...cities.map((c) => ({ value: c.city, label: c.city })),
    ],
    [cities]
  );

  const ceremonyOptions = useMemo(
    () => [
      { value: "", label: "— Select ceremony —" },
      ...leadEvents.map((e) => ({
        value: e.id,
        label: formatCeremonyLabel(e),
      })),
    ],
    [leadEvents]
  );

  async function finishFeedbackSubmit() {
    onSubmitted();
    onClose();
  }

  async function postJson(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/leads/${leadId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { error?: string | null };
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Could not save");
      return false;
    }
    await finishFeedbackSubmit();
    return true;
  }

  async function quickDeclined() {
    await postJson({ connectionStatus: "not_interested", muaType: "olready" });
  }

  async function scheduleUnreachable() {
    if (!followUpAt) {
      setError("Pick a call-back date");
      return;
    }
    await postJson({
      busyCallbackOnly: true,
      followUpAt,
      followUpNote: followUpNote.trim() || null,
      attemptKind: scheduleKind,
    });
  }

  async function closeNoContact() {
    await postJson({
      closeNoContactOnly: true,
      followUpNote: followUpNote.trim() || null,
    });
  }

  function openSchedule(kind: FeedbackUnreachableAttemptKind) {
    setScheduleKind(kind);
    setScheduleOpen(true);
    setError(null);
  }

  const canCloseNoContact =
    unreachableAttemptCount >= FEEDBACK_MAX_UNREACHABLE_ATTEMPTS;

  function toggleReason(value: string) {
    setNegativeReasons((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]
    );
  }

  async function submitFull() {
    const referrals = referralRows
      .map((r) => ({ name: r.name.trim(), phone: r.phone.trim() }))
      .filter((r) => r.name && r.phone);
    for (const r of referrals) {
      if (!isValidPhone10(r.phone)) {
        setError(PHONE_ERROR);
        return;
      }
    }
    if (muaType === "olready" && !olreadyMuaId) {
      setError("Select the Olready MUA");
      return;
    }
    if (muaType === "olready" && leadEvents.length > 1 && !eventId) {
      setError("Select which ceremony she booked this MUA for");
      return;
    }
    if (muaType === "non_olready" && !nonOlreadyName.trim()) {
      setError("Enter the outside MUA name");
      return;
    }
    const needsNegative =
      serviceSentiment === "negative" || serviceSentiment === "mixed";
    if (needsNegative && negativeReasons.length === 0 && !negativeOther.trim()) {
      setError("Select at least one issue or describe in Other");
      return;
    }

    await postJson({
      connectionStatus: "connected",
      eventId: muaType === "olready" ? eventId || null : null,
      muaType,
      olreadyMuaId: muaType === "olready" ? olreadyMuaId : null,
      nonOlreadyMuaName: muaType === "non_olready" ? nonOlreadyName.trim() : null,
      prospectPhone: prospectPhone.trim() || null,
      prospectInsta: prospectInsta.trim() || null,
      prospectCity: prospectCity || null,
      serviceSentiment,
      negativeReasons: needsNegative ? negativeReasons : [],
      negativeReasonOther: negativeOther.trim() || null,
      recommendationsNote: recommendationsNote.trim() || null,
      referralsNote: referralsNote.trim() || null,
      olreadyServiceNote: olreadyServiceNote.trim() || null,
      muaServiceNote: muaServiceNote.trim() || null,
      engageAgain,
      engageAgainNote: engageAgainNote.trim() || null,
      referrals,
      olreadyRating,
      muaRating: muaType === "olready" ? muaRating : null,
      followUpRequested: Boolean(followUpAt),
      followUpAt: followUpAt || null,
      followUpNote: followUpNote.trim() || null,
      valuableOptions:
        serviceSentiment === "positive" || serviceSentiment === "mixed"
          ? true
          : serviceSentiment === "negative"
            ? false
            : null,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Feedback — ${brideName}`}
      footer={
        showFullForm ? (
          <>
            <Button variant="ghost" onClick={() => setShowFullForm(false)}>
              Back
            </Button>
            <Button disabled={busy} onClick={() => void submitFull()}>
              {busy ? "Saving…" : "Save feedback"}
            </Button>
          </>
        ) : scheduleOpen ? (
          <>
            <Button variant="ghost" onClick={() => setScheduleOpen(false)}>
              Back
            </Button>
            <Button disabled={busy} onClick={() => void scheduleUnreachable()}>
              Schedule call-back
            </Button>
          </>
        ) : null
      }
    >
      {!showFullForm && !scheduleOpen && (
        <div className="space-y-4">
          <p className="text-sm text-slate-muted">
            Post-event lead — log the call outcome. Busy, callback, and no-contact
            attempts need a follow-up date.
            {unreachableAttemptCount > 0 ? (
              <span className="mt-1 block text-xs">
                Call-back attempts so far: {unreachableAttemptCount} /{" "}
                {FEEDBACK_MAX_UNREACHABLE_ATTEMPTS}
              </span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => openSchedule("busy")}
            >
              Busy
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => openSchedule("callback")}
            >
              Callback requested
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => openSchedule("no_contact")}
            >
              No contact / didn&apos;t answer
            </Button>
            <Button disabled={busy} onClick={() => setShowFullForm(true)}>
              Connected — full feedback
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void quickDeclined()}
            >
              Doesn&apos;t want to give feedback
            </Button>
            {canCloseNoContact ? (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void closeNoContact()}
              >
                Closed — no contact
              </Button>
            ) : null}
          </div>
        </div>
      )}

      {scheduleOpen && (
        <div className="space-y-4">
          <p className="text-sm text-slate-muted">
            Scheduling a call-back for:{" "}
            <strong>
              {scheduleKind === "busy"
                ? "Busy"
                : scheduleKind === "callback"
                  ? "Callback requested"
                  : "No contact / didn't answer"}
            </strong>
          </p>
          <Input
            label="Call-back date"
            type="date"
            value={followUpAt}
            onChange={(e) => setFollowUpAt(e.target.value)}
          />
          <Input
            label="Note (optional)"
            value={followUpNote}
            onChange={(e) => setFollowUpNote(e.target.value)}
          />
        </div>
      )}

      {showFullForm && (
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <Select
            label="Who did she book with?"
            value={muaType}
            onChange={(e) => setMuaType(e.target.value as FeedbackMuaType)}
            options={[
              { value: "olready", label: "Olready MUA" },
              { value: "non_olready", label: "Someone else" },
            ]}
          />
          {muaType === "olready" && leadEvents.length > 1 && (
            <Select
              label="Which ceremony did she book this MUA for?"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              options={ceremonyOptions}
            />
          )}
          {muaType === "olready" && (
            <MuaSearchPicker
              label="Olready MUA"
              value={olreadyMuaId}
              selectedLabel={olreadyMuaLabel}
              suggestedOptions={muaOptions}
              onChange={(id, name) => {
                setOlreadyMuaId(id);
                setOlreadyMuaLabel(name);
              }}
            />
          )}
          {muaType === "non_olready" && (
            <>
              <Input
                label="MUA name"
                value={nonOlreadyName}
                onChange={(e) => setNonOlreadyName(e.target.value)}
              />
              <Input
                label="MUA phone (optional)"
                value={prospectPhone}
                onChange={(e) => setProspectPhone(e.target.value)}
              />
              <Input
                label="Instagram (optional)"
                value={prospectInsta}
                onChange={(e) => setProspectInsta(e.target.value)}
              />
              <Select
                label="City (optional)"
                value={prospectCity}
                onChange={(e) => setProspectCity(e.target.value)}
                options={cityOptions}
              />
              <p className="text-xs text-slate-muted">
                Saved to MUA Prospects for recruitment (admin queue). Optional phone, Insta, city.
              </p>
            </>
          )}

          <Select
            label="How was our service?"
            value={serviceSentiment}
            onChange={(e) =>
              setServiceSentiment(e.target.value as FeedbackServiceSentiment)
            }
            options={[
              { value: "positive", label: "Positive" },
              { value: "negative", label: "Negative" },
              { value: "mixed", label: "Mixed" },
            ]}
          />

          <RatingRow
            label="Rate Olready (1–5)"
            value={olreadyRating}
            onChange={setOlreadyRating}
          />
          <Input
            label="Olready service note"
            value={olreadyServiceNote}
            onChange={(e) => setOlreadyServiceNote(e.target.value)}
          />
          {muaType === "olready" && olreadyMuaId && (
            <>
              <RatingRow
                label="Rate the MUA's service (1–5)"
                value={muaRating}
                onChange={setMuaRating}
              />
              <Input
                label="MUA service note"
                value={muaServiceNote}
                onChange={(e) => setMuaServiceNote(e.target.value)}
              />
            </>
          )}

          {(serviceSentiment === "negative" ||
            serviceSentiment === "mixed") && (
            <div>
              <p className="mb-2 text-sm font-medium text-brand">What went wrong?</p>
              <div className="flex flex-col gap-2">
                {FEEDBACK_NEGATIVE_REASONS.map((r) => (
                  <label
                    key={r.value}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={negativeReasons.includes(r.value)}
                      onChange={() => toggleReason(r.value)}
                    />
                    {r.label}
                  </label>
                ))}
              </div>
              {negativeReasons.includes("other") && (
                <Input
                  label="Other (please specify)"
                  value={negativeOther}
                  onChange={(e) => setNegativeOther(e.target.value)}
                  className="mt-2"
                />
              )}
            </div>
          )}

          {(serviceSentiment === "positive" ||
            serviceSentiment === "mixed") && (
            <>
              <Input
                label="Recommendations"
                value={recommendationsNote}
                onChange={(e) => setRecommendationsNote(e.target.value)}
              />
              <Input
                label="Friends / family for upcoming events"
                value={referralsNote}
                onChange={(e) => setReferralsNote(e.target.value)}
              />
              <p className="-mt-2 text-xs text-slate-muted">
                Phones in this note are parsed into upload-queue referrals. If there is no
                phone, a follow-up task is created on your Tasks tab to collect it from the
                bride.
              </p>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="mb-2 text-sm font-medium text-brand">
                  New bride leads — friends / family (name + phone)
                </p>
                {referralRows.map((row, idx) => (
                  <div key={idx} className="mb-2 grid gap-2 sm:grid-cols-2">
                    <Input
                      label="Name"
                      value={row.name}
                      onChange={(e) => {
                        const next = [...referralRows];
                        next[idx] = { ...next[idx]!, name: e.target.value };
                        setReferralRows(next);
                      }}
                    />
                    <Input
                      label="Phone"
                      value={row.phone}
                      onChange={(e) => {
                        const next = [...referralRows];
                        next[idx] = { ...next[idx]!, phone: e.target.value };
                        setReferralRows(next);
                      }}
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setReferralRows((r) => [...r, { name: "", phone: "" }])
                  }
                >
                  + Add referral
                </Button>
              </div>
              <Select
                label="Engage Olready again for party / other services?"
                value={engageAgain}
                onChange={(e) =>
                  setEngageAgain(e.target.value as FeedbackEngageAgain)
                }
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "maybe", label: "Maybe" },
                  { value: "no", label: "No" },
                ]}
              />
              <Input
                label="Notes on future engagement (optional)"
                value={engageAgainNote}
                onChange={(e) => setEngageAgainNote(e.target.value)}
              />
            </>
          )}

          <div className="border-t border-slate-200 pt-3">
            <p className="mb-2 text-sm font-medium text-brand">
              Follow-up on this bride (optional)
            </p>
            <Input
              label="Call-back date"
              type="date"
              value={followUpAt}
              onChange={(e) => setFollowUpAt(e.target.value)}
            />
            <Input
              label="Note"
              value={followUpNote}
              onChange={(e) => setFollowUpNote(e.target.value)}
              className="mt-2"
            />
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </Modal>
  );
}

function formatCeremonyLabel(event: LeadEvent): string {
  const date = event.eventDate ?? "Date TBD";
  return `${event.ceremonyType} — ${date}`;
}

function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-brand">{label}</p>
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            className={`h-9 w-9 rounded-lg border text-sm font-medium transition ${
              value === n
                ? "border-brand bg-brand text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-brand"
            }`}
          >
            {n}
          </button>
        ))}
        {value != null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-slate-muted underline"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
