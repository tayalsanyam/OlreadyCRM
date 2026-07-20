"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { SlideOver } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/Badge";
import { CapBar } from "@/components/muas/CapBar";
import { MuaQuickContact } from "@/components/muas/MuaQuickContact";
import { fromDbPlanTier } from "@/lib/db-mappers";
import {
  ADMIN_PLAN_TAG_LABELS,
  ADMIN_PLAN_TAG_OPTIONS,
  type AdminPlanTag,
} from "@/lib/admin-plan-tag";
import { cityPickerLabels } from "@/lib/city-catalog";
import { uniqueRegions, pickPrimaryCeremonyIndex } from "@/lib/ceremony-region";
import { isMuaAvailableToPush } from "@/lib/mua-push-availability";
import { isMuaNotOnPlan } from "@/lib/mua-active-plan";
import { REGION_OPTIONS } from "@/lib/mua-region";
import {
  MUA_PUSH_STAGE_LABELS,
  MUA_PUSH_STATUS_LABELS,
  PLAN_TIER_LABELS,
  type LeadEvent,
  type MuaPushStage,
  type MuaPushStatus,
  type PlanTier,
  type Region,
  type UrgencyBand,
} from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

interface AvailableMua {
  id: string;
  name: string;
  city: string;
  planTier: string | null;
  planExpiry: string | null;
  region: Region | null;
  weeklyCap: number;
  weeklyUsed: number;
  atWeeklyCap: boolean;
  adminPlanTag: AdminPlanTag | null;
  leadPushId?: string | null;
  leadPushStatus?: MuaPushStatus | null;
  leadPushStage?: MuaPushStage | null;
  leadPushEventLabels?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
}

type AvailabilityTab = "available" | "onLead" | "all";

type ExpiryFilter = "all" | "active" | "expiring" | "expired" | "none";
type AdminTagFilter = "all" | AdminPlanTag | "untagged";

const PLAN_TIERS = (Object.keys(PLAN_TIER_LABELS) as PlanTier[]).filter(
  (t) => t !== "prime",
);

const PLAN_TIER_BADGE: Record<PlanTier, string> = {
  highestPrivy: "bg-amber-100 text-amber-900",
  phoenix2: "bg-indigo-100 text-indigo-900",
  phoenix: "bg-blue-100 text-blue-800",
  pro: "bg-slate-200 text-slate-800",
  prime: "bg-gray-100 text-gray-600",
};

const ADMIN_TAG_BADGE: Record<AdminPlanTag, string> = {
  high_priority: "bg-red-100 text-red-800 ring-1 ring-red-200",
  low_priority: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
  hold: "bg-amber-100 text-amber-900 ring-1 ring-amber-200",
};

function expiryDays(planExpiry: string | null): number | null {
  if (!planExpiry) return null;
  return Math.ceil((new Date(planExpiry).getTime() - Date.now()) / 86400000);
}

function matchesExpiry(m: AvailableMua, filter: ExpiryFilter): boolean {
  if (filter === "all") return true;
  const days = expiryDays(m.planExpiry);
  if (filter === "active") return !!m.planTier && days !== null && days > 0;
  if (filter === "expiring") return days !== null && days >= 0 && days <= 30;
  if (filter === "expired") return days !== null && days < 0;
  if (filter === "none") return isMuaNotOnPlan(m);
  return true;
}

function FilterChip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-medium transition-all",
        active
          ? "bg-brand text-white shadow-sm ring-1 ring-brand/20"
          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
      <span className="shrink-0 pt-1 text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:w-20">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1">{children}</div>
    </div>
  );
}

interface PushMuaSlideOverProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  urgencyBand: UrgencyBand;
  events: LeadEvent[];
  commissionMode?: boolean;
  preselectedMuaId?: string;
  brideName?: string;
  leadCity?: string | null;
  pushBlocked?: boolean;
  pushBlockedMessage?: string;
  onPushed: () => void;
}

export function PushMuaSlideOver({
  open,
  onClose,
  leadId,
  urgencyBand,
  events,
  commissionMode,
  preselectedMuaId,
  brideName,
  leadCity,
  pushBlocked = false,
  pushBlockedMessage,
  onPushed,
}: PushMuaSlideOverProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [muas, setMuas] = useState<AvailableMua[]>([]);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [selectedMua, setSelectedMua] = useState<AvailableMua | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [bypassOpen, setBypassOpen] = useState(false);
  const [bypassReason, setBypassReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [tierFilter, setTierFilter] = useState<PlanTier | "">("");
  const [regionFilter, setRegionFilter] = useState<Region | "">("");
  const [cityFilter, setCityFilter] = useState("");
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("all");
  const [tagFilter, setTagFilter] = useState<AdminTagFilter>("all");
  const [availabilityTab, setAvailabilityTab] = useState<AvailabilityTab>("available");

  const openEventIdsKey = useMemo(
    () =>
      events
        .filter((e) => e.status === "open")
        .map((e) => e.id)
        .join(","),
    [events],
  );
  const openEvents = useMemo(
    () => events.filter((e) => e.status === "open"),
    [events],
  );

  const multiRegionCeremonies = useMemo(() => {
    if (commissionMode) return false;
    return uniqueRegions(openEvents.map((e) => e.region ?? null)).length > 1;
  }, [openEvents, commissionMode]);

  const selectMua = useCallback(
    (m: AvailableMua) => {
      if (!isMuaAvailableToPush(m)) return;
      if (multiRegionCeremonies && selectedEvents.length === 0) {
        setError("Select ceremonies in one region first");
        return;
      }
      setSelectedMua(m);
      const eventIds =
        selectedEvents.length > 0
          ? selectedEvents
          : openEvents.map((e) => e.id);
      if (selectedEvents.length === 0) {
        setSelectedEvents(eventIds);
      }
      setPrices(pricesFromEvents(openEvents, eventIds));
      setError(null);
    },
    [openEvents, selectedEvents, multiRegionCeremonies],
  );

  const selectedEventsKey = selectedEvents.join(",");
  const queryEventIdsKey = useMemo(() => {
    if (multiRegionCeremonies) {
      return selectedEventsKey;
    }
    return selectedEventsKey || openEventIdsKey;
  }, [multiRegionCeremonies, selectedEventsKey, openEventIdsKey]);

  const ceremonyRegions = useMemo(() => {
    const ids = queryEventIdsKey ? queryEventIdsKey.split(",").filter(Boolean) : [];
    return uniqueRegions(
      ids.map((id) => events.find((e) => e.id === id)?.region ?? null),
    );
  }, [queryEventIdsKey, events]);

  const prevOpenRef = useRef(false);

  // Reset form once when the panel opens (not on every render while open).
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (!justOpened) return;

    const defaultEventIds = defaultCeremonyIdsForPush(openEvents);
    const regions = uniqueRegions(
      defaultEventIds.map((id) => openEvents.find((e) => e.id === id)?.region ?? null),
    );

    setError(null);
    setSelectedMua(null);
    setSelectedEvents(defaultEventIds);
    setPrices(pricesFromEvents(openEvents, defaultEventIds));
    setSearch("");
    setTierFilter("");
    setRegionFilter(commissionMode ? "" : regions.length === 1 ? regions[0]! : "");
    setCityFilter("");
    setExpiryFilter("all");
    setTagFilter("all");
    setAvailabilityTab("available");
  }, [open, openEvents, commissionMode]);

  // Load cities once per open session.
  useEffect(() => {
    if (!open) return;
    void fetch("/api/cities")
      .then((r) => r.json())
      .then((json: { data?: Array<{ city: string }> | null }) => {
        setCityOptions(cityPickerLabels((json.data ?? []) as Parameters<typeof cityPickerLabels>[0]));
      })
      .catch(() => setCityOptions([]));
  }, [open]);

  // Fetch MUAs when panel is open or ceremony selection changes.
  useEffect(() => {
    if (!open) return;
    if (multiRegionCeremonies && !queryEventIdsKey) {
      setMuas([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    const q = new URLSearchParams({
      leadId,
      commission: commissionMode ? "true" : "false",
    });
    if (queryEventIdsKey) {
      q.set("eventIds", queryEventIdsKey);
    }

    void fetch(`/api/muas/available?${q.toString()}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((json: { data: AvailableMua[] | null; error?: string | null }) => {
        if (json.error) {
          setError(json.error);
          setMuas([]);
          return;
        }
        setError(null);
        const list = json.data ?? [];
        setMuas(list);
        if (preselectedMuaId) {
          const found = list.find((m) => m.id === preselectedMuaId);
          if (found && isMuaAvailableToPush(found)) selectMua(found);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Could not load MUAs");
        setMuas([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [
    open,
    leadId,
    commissionMode,
    preselectedMuaId,
    queryEventIdsKey,
    multiRegionCeremonies,
    selectMua,
  ]);

  const availabilityCounts = useMemo(
    () => ({
      available: muas.filter((m) => isMuaAvailableToPush(m)).length,
      onLead: muas.filter((m) => !isMuaAvailableToPush(m)).length,
      all: muas.length,
    }),
    [muas],
  );

  const cityChoices = useMemo(() => {
    const set = new Set(cityOptions);
    for (const m of muas) {
      if (m.city) set.add(m.city);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "en-IN"));
  }, [cityOptions, muas]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return muas.filter((m) => {
      if (availabilityTab === "available" && !isMuaAvailableToPush(m)) {
        return false;
      }
      if (availabilityTab === "onLead" && isMuaAvailableToPush(m)) {
        return false;
      }
      if (
        q &&
        !m.name.toLowerCase().includes(q) &&
        !m.city.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (tierFilter) {
        const tier = m.planTier ? fromDbPlanTier(m.planTier) : null;
        if (!tier || tier !== tierFilter) return false;
      }
      if (regionFilter && m.region !== regionFilter) return false;
      if (cityFilter && m.city !== cityFilter) return false;
      if (!matchesExpiry(m, expiryFilter)) return false;
      if (tagFilter === "untagged" && m.adminPlanTag) return false;
      if (
        tagFilter !== "all" &&
        tagFilter !== "untagged" &&
        m.adminPlanTag !== tagFilter
      ) {
        return false;
      }
      return true;
    });
  }, [muas, search, tierFilter, regionFilter, cityFilter, expiryFilter, tagFilter, availabilityTab]);

  const activeFilterCount = [
    tierFilter,
    regionFilter,
    cityFilter,
    expiryFilter !== "all" ? expiryFilter : "",
    tagFilter !== "all" ? tagFilter : "",
  ].filter(Boolean).length;

  function clearFilters() {
    setTierFilter("");
    setRegionFilter("");
    setCityFilter("");
    setExpiryFilter("all");
    setTagFilter("all");
    setSearch("");
  }

  function toggleEvent(id: string) {
    setSelectedMua(null);
    setSelectedEvents((prev) => {
      let next: string[];
      if (prev.includes(id)) {
        next = prev.filter((x) => x !== id);
      } else {
        const ev = openEvents.find((e) => e.id === id);
        if (!ev) return prev;
        if (multiRegionCeremonies) {
          const region = ev.region;
          const sameRegionOnly = prev.filter((pid) => {
            const p = openEvents.find((e) => e.id === pid);
            return p?.region === region;
          });
          next = [...sameRegionOnly, id];
        } else {
          next = [...prev, id];
        }
      }
      setPrices(pricesFromEvents(openEvents, next));
      return next;
    });
  }

  function ceremonyRegionLabel(region: Region | null | undefined): string {
    if (!region) return "Unknown region";
    return REGION_OPTIONS.find((r) => r.value === region)?.label ?? region;
  }

  async function submitPush(bypass?: string) {
    if (!selectedMua || !selectedEvents.length) {
      setError("Select MUA and at least one event");
      return;
    }
    const priceMap: Record<string, number> = {};
    for (const eid of selectedEvents) {
      const v = Number(prices[eid]);
      if (!v || v <= 0) {
        setError("Enter price for each selected event");
        return;
      }
      priceMap[eid] = v;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/leads/${leadId}/pushes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        muaId: selectedMua.id,
        eventIds: selectedEvents,
        prices: priceMap,
        urgencyBand,
        bypassReason: bypass,
      }),
    });
    const json = (await res.json()) as {
      error: string | null;
      data?: {
        id: string;
        emailNotification?: { status: string; message?: string };
      };
    };
    setSubmitting(false);
    if (!res.ok) {
      if (json.error?.includes("Bypass")) {
        setBypassOpen(true);
        return;
      }
      setError(json.error ?? "Push failed");
      return;
    }
    const emailNotification = json.data?.emailNotification;
    if (emailNotification?.status === "missing_email") {
      toast(emailNotification.message ?? "Email ID missing", "error");
    } else if (emailNotification?.status === "sent") {
      toast("Email sent to MUA", "success");
    }
    setBypassOpen(false);
    onPushed();
    onClose();
  }

  function pushStatusBadge(m: AvailableMua): { label: string; className: string } {
    if (!m.leadPushStatus) {
      return {
        label: "Not shared yet",
        className: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
      };
    }
    const statusLabel = MUA_PUSH_STATUS_LABELS[m.leadPushStatus] ?? m.leadPushStatus;
    if (m.leadPushStatus === "active" || m.leadPushStatus === "awaitingClose") {
      const stage = m.leadPushStage
        ? MUA_PUSH_STAGE_LABELS[m.leadPushStage]
        : statusLabel;
      return {
        label: `On lead · ${stage}`,
        className: "bg-amber-50 text-amber-900 ring-1 ring-amber-200",
      };
    }
    if (m.leadPushStatus === "booked") {
      return {
        label: "Booked on lead",
        className: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200",
      };
    }
    return {
      label: `Previously ${statusLabel.toLowerCase()}`,
      className: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
    };
  }

  function planLabel(m: AvailableMua): string {
    if (!m.planTier) return "Non-plan";
    const tier = fromDbPlanTier(m.planTier);
    if (!tier) return m.planTier;
    return PLAN_TIER_LABELS[tier] ?? m.planTier;
  }

function planTierClass(m: AvailableMua): string {
  const tier = m.planTier ? fromDbPlanTier(m.planTier) : null;
  return tier ? PLAN_TIER_BADGE[tier] : "bg-slate-100 text-slate-muted";
}

function defaultCeremonyIdsForPush(events: LeadEvent[]): string[] {
  if (events.length === 0) return [];
  const regions = uniqueRegions(events.map((e) => e.region ?? null));
  if (regions.length <= 1) return events.map((e) => e.id);

  const primaryIdx = pickPrimaryCeremonyIndex(
    events.map((e) => ({
      name: e.ceremonyType,
      date: e.eventDate,
      location: e.eventLocation,
      region: e.region,
    })),
  );
  const primaryRegion = events[primaryIdx]?.region ?? regions[0]!;
  return events.filter((e) => e.region === primaryRegion).map((e) => e.id);
}

function pricesFromEvents(events: LeadEvent[], eventIds: string[]): Record<string, string> {
  const initial: Record<string, string> = {};
  for (const ev of events) {
    if (!eventIds.includes(ev.id)) continue;
    if (ev.budgetAmount != null && ev.budgetAmount > 0) {
      initial[ev.id] = String(ev.budgetAmount);
    }
  }
  return initial;
}

  return (
    <>
      <SlideOver
        open={open}
        onClose={onClose}
        title="Push MUA Profile"
        wide
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={
                submitting ||
                pushBlocked ||
                !selectedMua ||
                !selectedEvents.length
              }
              onClick={() => void submitPush()}
            >
              {submitting ? "Pushing…" : "Push MUA"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {pushBlocked && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {pushBlockedMessage ??
                "Complete the bride confirmation call task before pushing MUAs."}
            </div>
          )}
          {multiRegionCeremonies ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                Ceremonies to push
              </h3>
              <p className="mt-1 text-xs text-amber-900/80">
                Ceremonies span multiple regions. Select only ceremonies in one region
                at a time — MUAs load for that region.
              </p>
              {openEvents.length === 0 ? (
                <p className="mt-2 text-sm text-slate-muted">No open ceremonies on this lead.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {openEvents.map((ev) => (
                    <label
                      key={ev.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3",
                        selectedEvents.includes(ev.id)
                          ? "border-accent ring-1 ring-accent/30"
                          : "border-slate-200",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={selectedEvents.includes(ev.id)}
                        onChange={() => toggleEvent(ev.id)}
                      />
                      <span className="flex-1 text-sm">
                        <span className="font-medium">{ev.ceremonyType}</span>
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium capitalize text-slate-700">
                          {ceremonyRegionLabel(ev.region)}
                        </span>
                        {ev.eventDate ? (
                          <span className="mt-0.5 block text-[11px] text-slate-muted">
                            {ev.eventDate.slice(0, 10)}
                            {ev.eventLocation ? ` · ${ev.eventLocation}` : ""}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {selectedEvents.length === 0 ? (
                <p className="mt-2 text-xs font-medium text-amber-800">
                  Pick at least one ceremony to load MUAs.
                </p>
              ) : ceremonyRegions.length === 1 ? (
                <p className="mt-2 text-xs text-amber-900/80">
                  Showing MUAs for{" "}
                  <span className="font-semibold capitalize">
                    {ceremonyRegionLabel(ceremonyRegions[0])}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}

          {!commissionMode && !multiRegionCeremonies && ceremonyRegions.length === 1 && (
            <p className="rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-slate-700">
              Showing MUAs for{" "}
              <span className="font-semibold capitalize text-brand">
                {ceremonyRegions[0]}
              </span>{" "}
              (ceremony location
              {openEvents.length === 1 && openEvents[0]?.eventLocation
                ? `: ${openEvents[0].eventLocation}`
                : ""}
              )
            </p>
          )}

          <Input
            label="Search MUA"
            placeholder="Name or city"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="rounded-xl border border-slate-200 bg-slate-50/60">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-brand"
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <span>
                Filters
                {activeFilterCount > 0 ? (
                  <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                    {activeFilterCount}
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-slate-muted">
                {filtersOpen ? "Hide" : "Show"}
              </span>
            </button>

            {filtersOpen && (
              <div className="space-y-3 border-t border-slate-200/80 px-3 pb-3 pt-3">
                <FilterRow label="Plan tier">
                  <FilterChip active={!tierFilter} onClick={() => setTierFilter("")}>
                    All
                  </FilterChip>
                  {PLAN_TIERS.map((t) => (
                    <FilterChip
                      key={t}
                      active={tierFilter === t}
                      onClick={() => setTierFilter(tierFilter === t ? "" : t)}
                    >
                      {PLAN_TIER_LABELS[t]}
                    </FilterChip>
                  ))}
                </FilterRow>

                <FilterRow label="Region">
                  <FilterChip
                    active={!regionFilter}
                    onClick={() => setRegionFilter("")}
                  >
                    All
                  </FilterChip>
                  {REGION_OPTIONS.map(({ value, label }) => (
                    <FilterChip
                      key={value}
                      active={regionFilter === value}
                      onClick={() =>
                        setRegionFilter(regionFilter === value ? "" : value)
                      }
                    >
                      {label}
                    </FilterChip>
                  ))}
                </FilterRow>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    label="City"
                    value={cityFilter}
                    onChange={(e) => setCityFilter(e.target.value)}
                    options={[
                      { value: "", label: "All cities" },
                      ...cityChoices.map((c) => ({ value: c, label: c })),
                    ]}
                  />
                  <Select
                    label="Admin tag"
                    value={tagFilter}
                    onChange={(e) =>
                      setTagFilter(e.target.value as AdminTagFilter)
                    }
                    options={[
                      { value: "all", label: "All tags" },
                      { value: "untagged", label: "No admin tag" },
                      ...ADMIN_PLAN_TAG_OPTIONS.filter((t) => t !== "hold").map(
                        (t) => ({
                          value: t,
                          label: ADMIN_PLAN_TAG_LABELS[t],
                        }),
                      ),
                    ]}
                  />
                </div>

                <FilterRow label="Plan status">
                  {(
                    [
                      ["all", "All"],
                      ["active", "Active"],
                      ["expiring", "Expiring ≤30d"],
                      ["expired", "Expired"],
                      ["none", "No plan"],
                    ] as const
                  ).map(([id, label]) => (
                    <FilterChip
                      key={id}
                      active={expiryFilter === id}
                      onClick={() => setExpiryFilter(id)}
                      className={
                        expiryFilter === id
                          ? "bg-amber-500 text-white ring-amber-500/20"
                          : undefined
                      }
                    >
                      {label}
                    </FilterChip>
                  ))}
                </FilterRow>

                {activeFilterCount > 0 && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-xs font-medium text-slate-muted hover:text-brand"
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ["available", "Available to push"],
                ["onLead", "Already on lead"],
                ["all", "All MUAs"],
              ] as const
            ).map(([id, label]) => (
              <FilterChip
                key={id}
                active={availabilityTab === id}
                onClick={() => {
                  setAvailabilityTab(id);
                  if (id === "onLead") setSelectedMua(null);
                }}
              >
                {label} ({availabilityCounts[id]})
              </FilterChip>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-muted">
            <span>
              {loading
                ? "Loading MUAs…"
                : `${filtered.length} shown`}
            </span>
            {selectedMua ? (
              <span className="font-medium text-brand">
                Selected: {selectedMua.name}
              </span>
            ) : availabilityTab === "onLead" ? (
              <span>Reference only — switch to Available to push</span>
            ) : (
              <span>Select a MUA below</span>
            )}
          </div>

          <div className="max-h-[min(520px,55vh)] space-y-2 overflow-y-auto pr-1">
            {!loading && filtered.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-muted">
                {availabilityTab === "available"
                  ? "No new MUAs to push — try All MUAs or adjust filters"
                  : "No MUAs match these filters"}
              </p>
            )}
            {filtered.map((m) => {
              const days = expiryDays(m.planExpiry);
              const selected = selectedMua?.id === m.id;
              const canSelect = isMuaAvailableToPush(m);
              const pushBadge = pushStatusBadge(m);

              return (
                <div
                  key={m.id}
                  className={cn(
                    "w-full rounded-xl border transition",
                    selected
                      ? "border-accent bg-accent/5 ring-2 ring-accent/30"
                      : "border-slate-200 bg-white",
                    canSelect && !selected && "hover:border-slate-300 hover:shadow-sm",
                  )}
                >
                  <div
                    role={canSelect ? "button" : undefined}
                    tabIndex={canSelect ? 0 : undefined}
                    onClick={() => canSelect && selectMua(m)}
                    onKeyDown={(e) => {
                      if (!canSelect) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectMua(m);
                      }
                    }}
                    className={cn(
                      "p-3",
                      canSelect && "cursor-pointer",
                      !canSelect && "cursor-default opacity-90",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="truncate font-medium text-text">{m.name}</p>
                          <MuaQuickContact
                            muaId={m.id}
                            muaName={m.name}
                            muaPhone={m.phone}
                            muaWhatsapp={m.whatsapp}
                            muaCity={m.city}
                            leadId={leadId}
                            pushStage={m.leadPushStage ?? "initialContact"}
                            brideName={brideName}
                            leadCity={leadCity}
                            templatePool="rmMua"
                            variant="compact"
                          />
                        </div>
                        <p className="mt-0.5 text-xs text-slate-muted">
                          {m.city}
                          {m.region ? ` · ${m.region}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            pushBadge.className,
                          )}
                        >
                          {pushBadge.label}
                        </span>
                        {m.adminPlanTag ? (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              ADMIN_TAG_BADGE[m.adminPlanTag],
                            )}
                          >
                            {ADMIN_PLAN_TAG_LABELS[m.adminPlanTag]}
                          </span>
                        ) : null}
                        {m.planTier ? (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-medium",
                              planTierClass(m),
                            )}
                          >
                            {planLabel(m)}
                          </span>
                        ) : (
                          <Badge variant="muted">Non-plan</Badge>
                        )}
                      </div>
                    </div>

                    {m.leadPushEventLabels ? (
                      <p className="mt-1.5 text-[11px] text-slate-muted line-clamp-2">
                        Ceremonies: {m.leadPushEventLabels}
                      </p>
                    ) : null}

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <CapBar used={m.weeklyUsed} cap={m.weeklyCap} />
                      {m.atWeeklyCap ? (
                        <span className="text-[10px] font-medium text-amber-700">
                          At weekly cap
                        </span>
                      ) : null}
                    </div>

                    {m.planExpiry ? (
                      <p className="mt-1.5 text-[11px] text-slate-muted">
                        Plan expires {formatDate(m.planExpiry.slice(0, 10))}
                        {days !== null && days <= 30 && days >= 0 ? (
                          <span className="ml-1 font-medium text-amber-700">
                            · {days}d left
                          </span>
                        ) : null}
                        {days !== null && days < 0 ? (
                          <span className="ml-1 font-medium text-red-600">
                            · expired
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>

                  {selected && canSelect && (
                    <div className="space-y-2 border-t border-accent/20 px-3 pb-3 pt-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-brand">
                        {multiRegionCeremonies ? "Pricing" : "Events & pricing"}
                      </h3>
                      {openEvents.length === 0 ? (
                        <p className="text-sm text-slate-muted">
                          No open ceremonies on this lead.
                        </p>
                      ) : multiRegionCeremonies ? (
                        selectedEvents.map((eventId) => {
                          const ev = openEvents.find((e) => e.id === eventId);
                          if (!ev) return null;
                          return (
                            <label
                              key={ev.id}
                              className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white p-3"
                            >
                              <span className="flex-1 text-sm">
                                <span className="font-medium">{ev.ceremonyType}</span>
                                {ev.eventDate ? (
                                  <span className="block text-[11px] text-slate-muted">
                                    {ev.eventDate.slice(0, 10)}
                                    {ev.eventLocation ? ` · ${ev.eventLocation}` : ""}
                                  </span>
                                ) : null}
                              </span>
                              <Input
                                type="number"
                                placeholder="Rs."
                                className="w-28"
                                value={prices[ev.id] ?? ""}
                                onChange={(e) =>
                                  setPrices((p) => ({ ...p, [ev.id]: e.target.value }))
                                }
                              />
                            </label>
                          );
                        })
                      ) : (
                        openEvents.map((ev) => (
                          <label
                            key={ev.id}
                            className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white p-3"
                          >
                            <input
                              type="checkbox"
                              checked={selectedEvents.includes(ev.id)}
                              onChange={() => toggleEvent(ev.id)}
                            />
                            <span className="flex-1 text-sm">
                              <span className="font-medium">{ev.ceremonyType}</span>
                              {ev.eventDate ? (
                                <span className="block text-[11px] text-slate-muted">
                                  {ev.eventDate.slice(0, 10)}
                                  {ev.eventLocation ? ` · ${ev.eventLocation}` : ""}
                                </span>
                              ) : null}
                            </span>
                            <Input
                              type="number"
                              placeholder="Rs."
                              className="w-28"
                              disabled={!selectedEvents.includes(ev.id)}
                              value={prices[ev.id] ?? ""}
                              onChange={(e) =>
                                setPrices((p) => ({ ...p, [ev.id]: e.target.value }))
                              }
                            />
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </SlideOver>

      <Modal
        open={bypassOpen}
        onClose={() => setBypassOpen(false)}
        title="Cap bypass required"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBypassOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void submitPush(bypassReason)}
              disabled={!bypassReason.trim()}
            >
              Confirm bypass
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-muted">
          This MUA is at weekly cap. Critical leads require a bypass reason
          (logged in ledger).
        </p>
        <Input
          label="Bypass reason"
          value={bypassReason}
          onChange={(e) => setBypassReason(e.target.value)}
        />
      </Modal>
    </>
  );
}
