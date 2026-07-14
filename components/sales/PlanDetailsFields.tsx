"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/Input";
import {
  formatLeadBudgetTiers,
  LEAD_BUDGET_OPTIONS,
  parseLeadBudgetTiers,
  PLAN_DEFAULT_CAP,
  PLAN_OPTIONS,
  type SalesPlanDetailsInput,
} from "@/lib/sales-plan-details";
import { REGION_OPTIONS, resolveMuaRegions } from "@/lib/mua-region";
import {
  GEO_BUNDLE_OPTIONS,
  canonicalCityName,
  citiesForLegalState,
  deriveLegalStatesFromCities,
  findCatalogCity,
  isCatalogBundleRow,
  legalStateForCity,
  resolveGeoBundle,
} from "@/lib/geo-bundles";
import { normalizeOnboardingCities } from "@/lib/onboarding-cities";
import { StateRegionGuideTrigger } from "@/components/sales/StateRegionGuideSlideOver";
import { cn } from "@/lib/utils";
import type { CityRegion, Region } from "@/lib/types";

const PAN_INDIA_STATES = "__pan_india_states__";
const METRO_BUNDLE_PICK = "__metro_bundle__";

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function SelectionChips({
  items,
  onRemove,
  emptyHint,
  readOnly = false,
}: {
  items: string[];
  onRemove?: (item: string) => void;
  emptyHint?: string;
  readOnly?: boolean;
}) {
  if (items.length === 0) {
    return emptyHint ? <p className="mt-1 text-xs text-slate-muted">{emptyHint}</p> : null;
  }
  return (
    <div className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand"
        >
          {item}
          {!readOnly && onRemove ? (
            <button
              type="button"
              className="leading-none text-brand/70 hover:text-brand"
              aria-label={`Remove ${item}`}
              onClick={() => onRemove(item)}
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function YesNoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null | undefined;
  onChange: (next: boolean) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-text">{label} *</p>
      <div className="flex gap-2">
        {[
          { v: true, l: "Yes" },
          { v: false, l: "No" },
        ].map(({ v, l }) => (
          <button
            key={l}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              "rounded-full px-3 py-1 text-xs",
              value === v ? "bg-brand text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PlanDetailsFields({
  value,
  onChange,
  artistCity,
  artistRegions,
  hidePlanField = false,
  showDealConfirmFields = false,
}: {
  value: SalesPlanDetailsInput;
  onChange: (next: SalesPlanDetailsInput) => void;
  artistCity?: string;
  artistRegions?: Region[];
  hidePlanField?: boolean;
  showDealConfirmFields?: boolean;
}) {
  const [cityOptions, setCityOptions] = useState<CityRegion[]>([]);
  const [statePick, setStatePick] = useState("");
  const [cityPick, setCityPick] = useState("");
  const valueRef = useRef(value);
  valueRef.current = value;

  const artistHomeRegions = useMemo(
    () => resolveMuaRegions(artistRegions ?? [], artistCity ?? ""),
    [artistRegions, artistCity],
  );

  useEffect(() => {
    void fetch("/api/cities")
      .then((r) => r.json())
      .then((j: { data?: CityRegion[] }) => setCityOptions(j.data ?? []))
      .catch(() => setCityOptions([]));
  }, []);

  const cities = value.cities ?? [];
  const states = value.states ?? [];
  const selectedBudgetTiers = parseLeadBudgetTiers(value.leadBudget);

  const allStateOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of cityOptions) {
      if (c.state?.trim()) set.add(c.state.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [cityOptions]);

  const allStatesSelected =
    allStateOptions.length > 0 && allStateOptions.every((s) => states.includes(s));

  const derivedRegions = useMemo(
    () => deriveRegionsFromStates(cityOptions, states),
    [cityOptions, states],
  );

  const rowsForScope = useMemo(
    () =>
      cityOptions.filter(
        (c) =>
          !isCatalogBundleRow(c) &&
          c.state &&
          states.includes(c.state.trim()),
      ),
    [cityOptions, states],
  );

  const cityAddOptions = useMemo(
    () =>
      unique(
        rowsForScope.filter((c) => {
          const canon = canonicalCityName(c.city);
          return !cities.some((picked) => canonicalCityName(picked) === canon);
        }).map((c) => canonicalCityName(c.city)),
      ).sort((a, b) => a.localeCompare(b)),
    [rowsForScope, cities],
  );

  function deriveRegions(cityNames: string[]): Region[] {
    const set = new Set<Region>();
    for (const city of cityNames) {
      const row = findCatalogCity(cityOptions, city);
      if (row) {
        set.add(row.region as Region);
        continue;
      }
      if (resolveGeoBundle(city)) set.add("north");
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function applySelection(nextCities: string[]) {
    const cleanedCities = normalizeOnboardingCities(nextCities);
    const nextStates = deriveLegalStatesFromCities(cityOptions, cleanedCities);
    const nextRegions = deriveRegionsFromStates(cityOptions, nextStates);
    onChange({
      ...valueRef.current,
      regions: nextRegions.length ? nextRegions : deriveRegions(cleanedCities),
      states: nextStates,
      cities: cleanedCities,
    });
  }

  function addState(s: string) {
    if (!s || states.includes(s)) return;
    const nextCities = unique([...cities, ...citiesForLegalState(cityOptions, s)]);
    applySelection(nextCities);
  }

  function addMetroBundle(bundle: string) {
    const bundleCities = resolveGeoBundle(bundle);
    if (!bundleCities) return;
    const nextCities = unique([
      ...cities,
      ...bundleCities.map((c) => canonicalCityName(c)),
    ]);
    applySelection(nextCities);
  }

  function selectPanIndiaStates() {
    if (!allStateOptions.length) return;
    let nextCities = [...cities];
    for (const s of allStateOptions) {
      nextCities = unique([...nextCities, ...citiesForLegalState(cityOptions, s)]);
    }
    applySelection(nextCities);
  }

  function removeState(s: string) {
    const nextCities = cities.filter((c) => legalStateForCity(cityOptions, c) !== s);
    applySelection(nextCities);
  }

  function addCity(city: string) {
    if (!city) return;
    const bundle = resolveGeoBundle(city);
    const toAdd = bundle ? bundle.map(canonicalCityName) : [canonicalCityName(city)];
    applySelection(unique([...cities, ...toAdd]));
  }

  function removeCity(city: string) {
    const canon = canonicalCityName(city);
    applySelection(cities.filter((c) => canonicalCityName(c) !== canon));
  }

  function toggleBudgetTier(tier: string) {
    const current = parseLeadBudgetTiers(value.leadBudget);
    const next = current.includes(tier as (typeof LEAD_BUDGET_OPTIONS)[number])
      ? current.filter((t) => t !== tier)
      : [...current, tier as (typeof LEAD_BUDGET_OPTIONS)[number]];
    onChange({ ...value, leadBudget: formatLeadBudgetTiers(next) });
  }

  useEffect(() => {
    if (!states.length || cityOptions.length === 0) return;
    const computed = deriveRegionsFromStates(cityOptions, states);
    if (!computed.length) return;
    const stored = [...((value.regions ?? []) as Region[])].sort().join(",");
    const next = [...computed].sort().join(",");
    if (stored !== next) {
      onChange({ ...valueRef.current, regions: computed });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync regions when states/cities catalog loads
  }, [states.join(","), cityOptions.length]);

  useEffect(() => {
    if (states.length > 0 || !artistCity || cityOptions.length === 0) return;
    const bundle = resolveGeoBundle(artistCity);
    if (bundle) {
      applySelection(bundle.map(canonicalCityName));
      return;
    }
    const row = findCatalogCity(cityOptions, artistCity);
    if (!row || isCatalogBundleRow(row)) return;
    applySelection([canonicalCityName(row.city)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pre-fill artist home city once
  }, [artistCity, cityOptions.length, states.length]);

  const selectClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

  const artistRegionHint =
    artistHomeRegions.length > 0
      ? artistHomeRegions
          .map((r) => REGION_OPTIONS.find((o) => o.value === r)?.label ?? r)
          .join(", ")
      : null;

  const regionLabels = derivedRegions.map(
    (r) => REGION_OPTIONS.find((o) => o.value === r)?.label ?? r,
  );

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
      <p className="text-sm font-semibold text-brand">Plan details *</p>
      {!hidePlanField ? (
        <div>
          <label className="mb-1 block text-sm font-medium text-text">Plan *</label>
          <select
            className={selectClass}
            value={value.plan ?? ""}
            onChange={(e) => {
              const plan = e.target.value;
              onChange({
                ...value,
                plan,
                leadCap: PLAN_DEFAULT_CAP[plan] ?? value.leadCap,
              });
            }}
          >
            <option value="">Select</option>
            {PLAN_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <Input
        label="Lead Cap *"
        type="number"
        value={value.leadCap != null ? String(value.leadCap) : ""}
        onChange={(e) => onChange({ ...value, leadCap: Number(e.target.value) || null })}
      />
      <div>
        <label className="mb-1 block text-sm font-medium text-text">Lead Budget *</label>
        <p className="mb-2 text-xs text-slate-muted">
          Select all budget tiers this artist works with (e.g. Tier 1–4).
        </p>
        <div className="flex flex-wrap gap-2">
          {LEAD_BUDGET_OPTIONS.map((tier) => {
            const selected = selectedBudgetTiers.includes(tier);
            return (
              <button
                key={tier}
                type="button"
                onClick={() => toggleBudgetTier(tier)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  selected
                    ? "bg-brand text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                )}
              >
                {tier}
              </button>
            );
          })}
        </div>
        {selectedBudgetTiers.length === 0 ? (
          <p className="mt-1 text-xs text-amber-700">Select at least one tier.</p>
        ) : (
          <p className="mt-1 text-xs text-slate-muted">
            Selected: {formatLeadBudgetTiers(selectedBudgetTiers)}
          </p>
        )}
      </div>

      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <label className="text-sm font-medium text-text" htmlFor="plan-states">
            States *
          </label>
          <StateRegionGuideTrigger cityOptions={cityOptions} />
        </div>
        {allStateOptions.length === 0 ? (
          <p className="text-xs text-slate-muted">Loading state list…</p>
        ) : (
          <>
            <select
              id="plan-states"
              className={selectClass}
              value={statePick}
              disabled={allStatesSelected}
              onChange={(e) => {
                const s = e.target.value;
                if (s === PAN_INDIA_STATES) {
                  selectPanIndiaStates();
                } else if (s.startsWith(`${METRO_BUNDLE_PICK}:`)) {
                  addMetroBundle(s.slice(METRO_BUNDLE_PICK.length + 1));
                } else if (s) {
                  addState(s);
                }
                setStatePick("");
              }}
            >
              <option value="">
                {allStatesSelected ? "All states selected" : "Select state or metro…"}
              </option>
              {!allStatesSelected && GEO_BUNDLE_OPTIONS.length > 0 ? (
                <optgroup label="Metro bundles">
                  {GEO_BUNDLE_OPTIONS.map((bundle) => (
                    <option key={bundle} value={`${METRO_BUNDLE_PICK}:${bundle}`}>
                      {bundle}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {!allStatesSelected && allStateOptions.length > 1 ? (
                <option value={PAN_INDIA_STATES}>Pan India (all states)</option>
              ) : null}
              {allStateOptions
                .filter((s) => !states.includes(s))
                .map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
            </select>
            <SelectionChips
              items={states}
              onRemove={removeState}
              emptyHint="Pick a legal state or Delhi NCR bundle — cities fill in; remove any you don't cover."
            />
          </>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-text">Regions *</label>
        <p className="mb-1 text-xs text-slate-muted">
          Auto-derived from selected states
          {artistRegionHint ? (
            <>
              {" "}
              · Artist home: <strong>{artistRegionHint}</strong>
            </>
          ) : null}
        </p>
        <SelectionChips
          items={regionLabels}
          readOnly
          emptyHint="Select state(s) first — regions will appear here."
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-text" htmlFor="plan-cities">
          Cities *
        </label>
        {states.length === 0 ? (
          <p className="text-xs text-slate-muted">Select state(s) first.</p>
        ) : (
          <>
            <select
              id="plan-cities"
              className={selectClass}
              value={cityPick}
              disabled={cityAddOptions.length === 0}
              onChange={(e) => {
                const city = e.target.value;
                if (city) addCity(city);
                setCityPick("");
              }}
            >
              <option value="">
                {cityAddOptions.length === 0 ? "All cities selected" : "Add city back…"}
              </option>
              {cityAddOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-muted">
              {cities.length} selected
              {cities.length > 0 ? " — remove any city you want to exclude" : ""}
            </p>
            <SelectionChips
              items={[...cities].sort((a, b) => a.localeCompare(b))}
              onRemove={removeCity}
            />
          </>
        )}
      </div>

      {showDealConfirmFields ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-brand">Deal confirmation</p>
          <YesNoField
            label="RM Support"
            value={value.rmSupport}
            onChange={(rmSupport) => onChange({ ...value, rmSupport })}
          />
          <YesNoField
            label="Lead Reversal"
            value={value.leadReversal}
            onChange={(leadReversal) => onChange({ ...value, leadReversal })}
          />
          <YesNoField
            label="Social Media"
            value={value.hasSocialMedia}
            onChange={(hasSocialMedia) =>
              onChange({
                ...value,
                hasSocialMedia,
                socialMedia: hasSocialMedia ? value.socialMedia ?? "" : "",
              })
            }
          />
          {value.hasSocialMedia ? (
            <Input
              label="Social media handle / link *"
              value={value.socialMedia ?? ""}
              onChange={(e) => onChange({ ...value, socialMedia: e.target.value })}
              placeholder="@instagram or profile URL"
            />
          ) : null}
        </div>
      ) : (
        <Input
          label="Social Media *"
          value={value.socialMedia ?? ""}
          onChange={(e) => onChange({ ...value, socialMedia: e.target.value })}
        />
      )}
      <div className="grid gap-2 md:grid-cols-2">
        <Input
          label="Duration Start *"
          type="date"
          value={value.durationStart ?? ""}
          onChange={(e) => onChange({ ...value, durationStart: e.target.value })}
        />
        <Input
          label="Duration End *"
          type="date"
          value={value.durationEnd ?? ""}
          onChange={(e) => onChange({ ...value, durationEnd: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {[3, 6, 12].map((months) => (
          <button
            key={months}
            type="button"
            className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200"
            onClick={() => {
              if (!value.durationStart) return;
              const start = new Date(value.durationStart);
              const end = new Date(start);
              end.setMonth(end.getMonth() + months);
              onChange({ ...value, durationEnd: end.toISOString().slice(0, 10) });
            }}
          >
            +{months === 12 ? "1 year" : `${months} months`}
          </button>
        ))}
      </div>
      <Input
        label="Assured Bookings"
        type="number"
        value={value.assuredBookings != null ? String(value.assuredBookings) : ""}
        onChange={(e) => onChange({ ...value, assuredBookings: Number(e.target.value) || null })}
      />
      <Input
        label="Avg Revenue Target"
        type="number"
        value={value.avgRevenueTarget != null ? String(value.avgRevenueTarget) : ""}
        onChange={(e) => onChange({ ...value, avgRevenueTarget: Number(e.target.value) || null })}
      />
    </div>
  );
}

function deriveRegionsFromStates(cityOptions: CityRegion[], stateList: string[]): Region[] {
  if (!stateList.length) return [];
  const set = new Set<Region>();
  for (const c of cityOptions) {
    if (c.state?.trim() && stateList.includes(c.state.trim())) {
      set.add(c.region as Region);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
