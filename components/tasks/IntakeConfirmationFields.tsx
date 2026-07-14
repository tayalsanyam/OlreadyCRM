"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CeremonyBudgetFields,
  type CeremonyEntry,
} from "@/components/leads/CeremonyBudgetFields";
import { MakeupLookProfileFields } from "@/components/leads/MakeupLookProfileFields";
import { EMPTY_MAKEUP_LOOK, type MakeupLookProfileInput } from "@/lib/makeup-look";
import type { IntakeEventUpdate } from "@/lib/lead-intake-config";
import type { LeadEvent } from "@/lib/types";

function toCeremonyEntry(ev: LeadEvent): CeremonyEntry {
  return {
    name: ev.ceremonyType,
    budget: ev.budgetAmount ?? null,
    date: ev.eventDate?.slice(0, 10) ?? null,
    description: ev.description ?? null,
    location: ev.eventLocation ?? null,
    region: ev.region ?? null,
  };
}

function toIntakeEventUpdates(
  events: LeadEvent[],
  ceremonies: CeremonyEntry[]
): IntakeEventUpdate[] {
  return events.map((ev, i) => {
    const row = ceremonies[i] ?? toCeremonyEntry(ev);
    return {
      id: ev.id,
      ceremonyType: row.name,
      eventDate: row.date,
      eventLocation: row.location,
      budgetAmount: row.budget,
      description: row.description,
    };
  });
}

import type { IntakeConfirmationDraft } from "@/lib/lead-intake-config";

export function IntakeConfirmationFields({
  leadId,
  onChange,
}: {
  leadId: string;
  onChange: (draft: IntakeConfirmationDraft | null) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [ceremonies, setCeremonies] = useState<CeremonyEntry[]>([]);
  const [makeupOpen, setMakeupOpen] = useState(false);
  const [makeup, setMakeup] = useState<MakeupLookProfileInput>({ ...EMPTY_MAKEUP_LOOK });
  const [makeupTouched, setMakeupTouched] = useState(false);

  useEffect(() => {
    setLoading(true);
    void Promise.all([
      fetch(`/api/leads/${leadId}`).then((r) => r.json()),
      fetch(`/api/leads/${leadId}/makeup-look`).then((r) => r.json()),
    ])
      .then(([leadJson, makeupJson]) => {
        const evs = (leadJson.data?.events ?? []) as LeadEvent[];
        const open = evs.filter((e) => e.status !== "notNeeded");
        setEvents(open);
        setCeremonies(open.map(toCeremonyEntry));
        if (makeupJson.data) {
          setMakeup(makeupJson.data as MakeupLookProfileInput);
        }
      })
      .finally(() => setLoading(false));
  }, [leadId]);

  const makeupEvents = useMemo(
    () => events.map((e) => ({ id: e.id, label: e.ceremonyType })),
    [events]
  );

  useEffect(() => {
    if (loading) return;
    onChange({
      events: toIntakeEventUpdates(events, ceremonies),
      makeupLook: makeupTouched ? makeup : null,
    });
    // onChange is stable setState from parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, events, ceremonies, makeup, makeupTouched]);

  if (loading) {
    return (
      <p className="mb-4 text-sm text-slate-muted">Loading ceremonies &amp; look…</p>
    );
  }

  return (
    <div className="mb-4 space-y-4 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-text">Ceremonies &amp; budgets</p>
          <Link
            href={`/rm/leads/${leadId}`}
            className="text-xs font-medium text-accent hover:underline"
          >
            Open lead profile
          </Link>
        </div>
        {ceremonies.length > 0 ? (
          <CeremonyBudgetFields
            ceremonies={ceremonies}
            onChange={setCeremonies}
            requireCeremonyDates
            requireCeremonyLocations
            datesHint="Confirm or update dates and locations with the bride."
          />
        ) : (
          <p className="text-sm text-amber-800">
            No ceremonies on this lead — add them on the{" "}
            <Link href={`/rm/leads/${leadId}`} className="font-medium underline">
              lead profile
            </Link>
            .
          </p>
        )}
      </div>

      <div className="border-t border-slate-200 pt-3">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left text-sm font-medium text-text"
          onClick={() => setMakeupOpen((o) => !o)}
        >
          <span>Makeup look profile (optional)</span>
          <span className="text-xs text-slate-muted">{makeupOpen ? "Hide" : "Add / edit"}</span>
        </button>
        {makeupOpen && (
          <div className="mt-3">
            <MakeupLookProfileFields
              value={makeup}
              onChange={(next) => {
                setMakeup(next);
                setMakeupTouched(true);
              }}
              events={makeupEvents}
              leadId={leadId}
              defaultOpen
            />
          </div>
        )}
      </div>
    </div>
  );
}
