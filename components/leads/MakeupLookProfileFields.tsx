"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { MakeupLookOption, MakeupLookEventInput, MakeupLookProfileInput } from "@/lib/makeup-look";
import {
  BASE_COVERAGE,
  EMPTY_MAKEUP_EVENT,
  FINISH_PREFERENCE,
  LOOK_CLARITY,
  MAKEUP_INTENSITY,
  MAKEUP_LOOK_CATEGORY,
  MAKEUP_TECHNIQUE,
  REFERENCE_SOURCE,
  SKIN_VISIBILITY,
  summarizeMakeupLook,
} from "@/lib/makeup-look";
import { MakeupReferenceImages } from "@/components/leads/MakeupReferenceImages";

export type MakeupLookEventRef = { id: string; label: string };

function ChipGroup({
  label,
  options,
  multi,
  value,
  onChange,
  compact = false,
}: {
  label: string;
  options: MakeupLookOption[];
  multi: boolean;
  value: string | string[] | null | undefined;
  onChange: (next: string | string[] | null) => void;
  compact?: boolean;
}) {
  const selected = multi
    ? new Set(Array.isArray(value) ? value : [])
    : new Set(value ? [value as string] : []);

  function toggle(v: string) {
    if (multi) {
      const arr = Array.isArray(value) ? [...value] : [];
      onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    } else {
      onChange(selected.has(v) ? null : v);
    }
  }

  return (
    <div>
      <p className={cn("font-medium text-text", compact ? "mb-1 text-xs" : "mb-1.5 text-sm")}>
        {label}
      </p>
      <div className={cn("flex flex-wrap", compact ? "gap-1" : "gap-1.5")}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={cn(
              "rounded-full border font-medium transition-colors",
              compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
              selected.has(o.value)
                ? "border-brand bg-brand text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function CoreLookFields({
  value,
  onChange,
  compact = false,
}: {
  value: MakeupLookEventInput;
  onChange: (next: MakeupLookEventInput) => void;
  compact?: boolean;
}) {
  function patch(p: Partial<MakeupLookEventInput>) {
    onChange({ ...value, ...p });
  }

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      <ChipGroup
        label="Look category"
        options={MAKEUP_LOOK_CATEGORY}
        multi
        compact={compact}
        value={value.makeupLookCategory}
        onChange={(v) => patch({ makeupLookCategory: (v as string[]) ?? [] })}
      />
      <ChipGroup
        label="Technique"
        options={MAKEUP_TECHNIQUE}
        multi
        compact={compact}
        value={value.makeupTechniquePreference}
        onChange={(v) => patch({ makeupTechniquePreference: (v as string[]) ?? [] })}
      />
      <div className={cn("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
        <ChipGroup
          label="Coverage"
          options={BASE_COVERAGE}
          multi={false}
          compact={compact}
          value={value.baseCoveragePreference}
          onChange={(v) => patch({ baseCoveragePreference: v as string | null })}
        />
        <ChipGroup
          label="Intensity"
          options={MAKEUP_INTENSITY}
          multi={false}
          compact={compact}
          value={value.makeupIntensity}
          onChange={(v) => patch({ makeupIntensity: v as string | null })}
        />
        <ChipGroup
          label="Look clarity"
          options={LOOK_CLARITY}
          multi={false}
          compact={compact}
          value={value.lookClarity}
          onChange={(v) => patch({ lookClarity: v as string | null })}
        />
      </div>
      <ChipGroup
        label="Finish"
        options={FINISH_PREFERENCE}
        multi
        compact={compact}
        value={value.finishPreference}
        onChange={(v) => patch({ finishPreference: (v as string[]) ?? [] })}
      />
      <ChipGroup
        label="Skin visibility"
        options={SKIN_VISIBILITY}
        multi={false}
        compact={compact}
        value={value.skinVisibilityComfort}
        onChange={(v) => patch({ skinVisibilityComfort: v as string | null })}
      />
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium text-text">Notes</span>
        <textarea
          className="min-h-[48px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          value={value.lookNotes ?? ""}
          onChange={(e) => patch({ lookNotes: e.target.value || null })}
          placeholder="Brief notes for this look…"
        />
      </label>
    </div>
  );
}

export function MakeupLookProfileFields({
  value,
  onChange,
  events = [],
  leadId,
  showV2 = false,
  defaultOpen = false,
}: {
  value: MakeupLookProfileInput;
  onChange: (next: MakeupLookProfileInput) => void;
  events?: MakeupLookEventRef[];
  leadId?: string;
  showV2?: boolean;
  /** When false, section starts collapsed (verification slide-over). */
  defaultOpen?: boolean;
}) {
  const sameAll = value.sameLookAllEvents !== false;
  const summary = useMemo(() => summarizeMakeupLook(value), [value]);
  const perEvent = value.perEventLooks ?? {};

  function patch(p: Partial<MakeupLookProfileInput>) {
    onChange({ ...value, ...p });
  }

  function setSameAll(next: boolean) {
    onChange({
      ...value,
      sameLookAllEvents: next,
      ...(next ? {} : { perEventLooks: value.perEventLooks ?? {} }),
    });
  }

  function patchEvent(eventId: string, eventPatch: MakeupLookEventInput) {
    patch({
      perEventLooks: {
        ...perEvent,
        [eventId]: eventPatch,
      },
    });
  }

  const sharedCore: MakeupLookEventInput = {
    makeupLookCategory: value.makeupLookCategory,
    makeupTechniquePreference: value.makeupTechniquePreference,
    baseCoveragePreference: value.baseCoveragePreference,
    finishPreference: value.finishPreference,
    makeupIntensity: value.makeupIntensity,
    skinVisibilityComfort: value.skinVisibilityComfort,
    lookClarity: value.lookClarity,
    lookNotes: value.lookNotes,
  };

  function patchSharedCore(next: MakeupLookEventInput) {
    patch({
      makeupLookCategory: next.makeupLookCategory,
      makeupTechniquePreference: next.makeupTechniquePreference,
      baseCoveragePreference: next.baseCoveragePreference,
      finishPreference: next.finishPreference,
      makeupIntensity: next.makeupIntensity,
      skinVisibilityComfort: next.skinVisibilityComfort,
      lookClarity: next.lookClarity,
      lookNotes: next.lookNotes,
    });
  }

  return (
    <details
      className="rounded-lg border border-slate-200 bg-slate-50/50"
      open={defaultOpen}
    >
      <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-brand [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-center gap-2">
          <span>Makeup look profile</span>
          <span className="text-xs font-normal text-slate-muted">(optional)</span>
          {summary ? (
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
              {summary}
            </span>
          ) : null}
        </span>
      </summary>

      <div className="space-y-3 border-t border-slate-200 px-3 py-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSameAll(true)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              sameAll
                ? "border-brand bg-brand text-white"
                : "border-slate-200 bg-white text-slate-600",
            )}
          >
            Same for all events
          </button>
          <button
            type="button"
            onClick={() => setSameAll(false)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              !sameAll
                ? "border-brand bg-brand text-white"
                : "border-slate-200 bg-white text-slate-600",
            )}
          >
            Different per event
          </button>
        </div>

        {sameAll ? (
          <CoreLookFields value={sharedCore} onChange={patchSharedCore} compact />
        ) : events.length === 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Add ceremonies first — then set the makeup look for each one below.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-muted">
              Set look preferences for each ceremony (expand to fill in).
            </p>
            {events.map((ev) => {
              const evLook = perEvent[ev.id] ?? { ...EMPTY_MAKEUP_EVENT };
              const evSummary = summarizeMakeupLook({
                ...EMPTY_MAKEUP_EVENT,
                ...evLook,
                sameLookAllEvents: true,
              });
              return (
                <details
                  key={ev.id}
                  className="rounded-lg border border-slate-200 bg-white"
                >
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-text [&::-webkit-details-marker]:hidden">
                    {ev.label}
                    {evSummary ? (
                      <span className="ml-2 text-xs font-normal text-slate-muted">
                        — {evSummary}
                      </span>
                    ) : (
                      <span className="ml-2 text-xs font-normal text-amber-700">
                        — not set
                      </span>
                    )}
                  </summary>
                  <div className="border-t border-slate-100 px-3 py-3">
                    <CoreLookFields
                      compact
                      value={evLook}
                      onChange={(next) => patchEvent(ev.id, next)}
                    />
                  </div>
                </details>
              );
            })}
          </div>
        )}

        {showV2 ? (
          <>
            <ChipGroup
              label="Reference source"
              options={REFERENCE_SOURCE}
              multi
              compact
              value={value.referenceSource}
              onChange={(v) => patch({ referenceSource: (v as string[]) ?? [] })}
            />
            {leadId ? <MakeupReferenceImages leadId={leadId} /> : null}
          </>
        ) : sameAll ? (
          <label className="flex items-center gap-2 text-xs text-slate-muted">
            <input
              type="checkbox"
              checked={Boolean(value.referenceImagesUploaded)}
              onChange={(e) => patch({ referenceImagesUploaded: e.target.checked })}
            />
            Reference images shared with bride
          </label>
        ) : null}
      </div>
    </details>
  );
}
