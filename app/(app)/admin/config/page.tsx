"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  BUDGET_TIER_ORDER,
  DEFAULT_BUDGET_TIER_LIMITS,
  deriveBudgetTierRangeLabels,
  formatTierRangeLabel,
  type BudgetTierLimit,
} from "@/lib/budget-tier";
import type { BudgetTier, CityRegion, Plan, Region, SlaConfig } from "@/lib/types";
import { AdminConfigUsersNav } from "@/components/admin/AdminConfigUsersNav";
import { AdminExportCsvButton } from "@/components/admin/AdminExportCsvButton";
import { AdminMuaServicesPanel } from "@/components/admin/AdminMuaServicesPanel";
import { AdminWhatsAppTemplatesPanel } from "@/components/admin/AdminWhatsAppTemplatesPanel";
import { BUDGET_TIER_LABELS } from "@/lib/types";
import type { ResolvedWhatsAppConfig } from "@/lib/whatsapp/config";
import { resolveWhatsAppConfig } from "@/lib/whatsapp/config";

const REGIONS: Region[] = ["north", "east", "west", "south"];

export default function AdminConfigPage() {
  const { toast } = useToast();
  const [sla, setSla] = useState<SlaConfig | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [newCeremony, setNewCeremony] = useState("");
  const [newSource, setNewSource] = useState("");
  const [cities, setCities] = useState<CityRegion[]>([]);
  const [newCity, setNewCity] = useState("");
  const [newCityState, setNewCityState] = useState("");
  const [newCityRegion, setNewCityRegion] = useState<Region>("north");
  const [whatsappConfig, setWhatsappConfig] = useState<ResolvedWhatsAppConfig>(() =>
    resolveWhatsAppConfig(null),
  );

  const loadCities = () => {
    void fetch("/api/admin/cities")
      .then((r) => r.json())
      .then((json: { data: CityRegion[] }) => setCities(json.data ?? []));
  };

  useEffect(() => {
    void fetch("/api/admin/config")
      .then((r) => r.json())
      .then((json: { data: { sla: SlaConfig; plans: Plan[]; whatsapp?: ResolvedWhatsAppConfig } }) => {
        setSla(json.data.sla);
        setPlans(json.data.plans);
        if (json.data.whatsapp) setWhatsappConfig(json.data.whatsapp);
      });
    loadCities();
  }, []);

  async function saveSla() {
    if (!sla) return;
    await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: "sla", data: sla }),
    });
    toast("SLA settings saved");
  }

  async function savePlan(plan: Plan) {
    await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: "plans", data: plan }),
    });
    toast(`${plan.name} updated`);
  }

  async function reorderPlan(index: number, direction: -1 | 1) {
    const next = [...plans].sort((a, b) => a.sortOrder - b.sortOrder);
    const j = index + direction;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setPlans(next.map((p, i) => ({ ...p, sortOrder: i + 1 })));
    await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group: "planReorder",
        data: { order: next.map((p) => p.id) },
      }),
    });
    toast("Plan order updated");
  }

  async function saveBudgetTierLimits(
    limits: Record<BudgetTier, BudgetTierLimit>
  ) {
    await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: "budgetTierLimits", data: { limits } }),
    });
    if (sla) {
      setSla({
        ...sla,
        budgetTierLimits: limits,
        budgetTierRanges: deriveBudgetTierRangeLabels(limits),
      });
    }
    toast("Budget tier limits saved");
  }

  function updateTierLimit(
    tier: BudgetTier,
    field: "min" | "max",
    raw: string
  ) {
    if (!sla) return;
    const current =
      sla.budgetTierLimits?.[tier] ?? DEFAULT_BUDGET_TIER_LIMITS[tier];
    const next: BudgetTierLimit =
      field === "min"
        ? { ...current, min: Number(raw) || 0 }
        : {
            ...current,
            max: raw.trim() === "" ? null : Number(raw) || 0,
          };
    setSla({
      ...sla,
      budgetTierLimits: {
        ...(sla.budgetTierLimits ?? DEFAULT_BUDGET_TIER_LIMITS),
        [tier]: next,
      },
    });
  }

  async function saveLeadSources(sources: string[]) {
    await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: "leadSources", data: { sources } }),
    });
    if (sla) setSla({ ...sla, leadSources: sources });
    toast("Lead sources saved");
  }

  async function addCity() {
    const city = newCity.trim();
    if (!city) return;
    const res = await fetch("/api/admin/cities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city, region: newCityRegion, state: newCityState.trim() || undefined }),
    });
    if (res.ok) {
      setNewCity("");
      setNewCityState("");
      loadCities();
      toast("City added");
    }
  }

  async function updateCityRegion(city: string, region: Region) {
    await fetch(`/api/admin/cities/${encodeURIComponent(city)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ region }),
    });
    setCities((list) =>
      list.map((c) => (c.city === city ? { ...c, region } : c))
    );
    toast("City updated");
  }

  async function updateCityState(city: string, state: string) {
    await fetch(`/api/admin/cities/${encodeURIComponent(city)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: state.trim() || null }),
    });
    setCities((list) =>
      list.map((c) => (c.city === city ? { ...c, state: state.trim() || null } : c))
    );
    toast("State updated");
  }

  async function deleteCity(city: string) {
    await fetch(`/api/admin/cities/${encodeURIComponent(city)}`, {
      method: "DELETE",
    });
    setCities((list) => list.filter((c) => c.city !== city));
    toast("City removed");
  }

  async function saveCeremonies(types: string[]) {
    await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: "ceremonies", data: { ceremonyTypes: types } }),
    });
    if (sla) setSla({ ...sla, ceremonyTypes: types });
    toast("Ceremony types saved");
  }

  if (!sla) return <div className="h-64 animate-pulse rounded-xl bg-slate-200" />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <AdminConfigUsersNav />
      <h1 className="text-2xl font-bold text-brand">Configuration</h1>
      <Card className="space-y-4">
        <h2 className="font-semibold text-brand">SLA & caps</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Per-lead cap"
            type="number"
            value={sla.perLeadCap}
            onChange={(e) => setSla({ ...sla, perLeadCap: Number(e.target.value) })}
          />
          <Input
            label="Assignment window (days)"
            type="number"
            value={sla.assignmentWindowDays}
            onChange={(e) =>
              setSla({ ...sla, assignmentWindowDays: Number(e.target.value) })
            }
          />
          <Input
            label="Shift warning day"
            type="number"
            value={sla.shiftWarningDay}
            onChange={(e) => setSla({ ...sla, shiftWarningDay: Number(e.target.value) })}
          />
          <Input
            label="Critical max days"
            type="number"
            value={sla.criticalMaxDays}
            onChange={(e) =>
              setSla({ ...sla, criticalMaxDays: Number(e.target.value) })
            }
          />
          <Input
            label="Hot max days"
            type="number"
            value={sla.hotMaxDays}
            onChange={(e) => setSla({ ...sla, hotMaxDays: Number(e.target.value) })}
          />
          <Input
            label="Active max days"
            type="number"
            value={sla.activeMaxDays}
            onChange={(e) =>
              setSla({ ...sla, activeMaxDays: Number(e.target.value) })
            }
          />
          <Input
            label="Cap bypass threshold (days to event)"
            type="number"
            value={sla.capBypassDays}
            onChange={(e) =>
              setSla({ ...sla, capBypassDays: Number(e.target.value) })
            }
          />
          <Input
            label="Inactivity alert (hours)"
            type="number"
            value={sla.inactivityThresholdHours}
            onChange={(e) =>
              setSla({ ...sla, inactivityThresholdHours: Number(e.target.value) })
            }
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={sla.autoAssignEnabled ?? false}
            onChange={(e) =>
              setSla({ ...sla, autoAssignEnabled: e.target.checked })
            }
          />
          Auto-assign on lead creation
        </label>
        <Select
          label="Assignment method"
          value={sla.autoAssignBy ?? "least_load"}
          onChange={(e) => setSla({ ...sla, autoAssignBy: e.target.value })}
          options={[{ value: "least_load", label: "Least load" }]}
        />
        <Button onClick={saveSla}>Save SLA</Button>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold text-brand">Plan tiers</h2>
        <p className="mb-4 text-sm text-slate-muted">
          CRM plan tiers are internal. Public support pricing for Ask AI comes from{" "}
          <code className="rounded bg-slate-100 px-1">docs/RAG/plansrag.md</code> — edit that file
          when plans or prices change, then run AI knowledge sync.
        </p>
        <ul className="space-y-4">
          {[...plans]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((p, index) => (
            <li
              key={p.id}
              className="flex flex-wrap items-end gap-3 border-b border-slate-100 pb-4 last:border-0"
            >
              <div className="flex flex-col gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={index === 0}
                  onClick={() => void reorderPlan(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={index === plans.length - 1}
                  onClick={() => void reorderPlan(index, 1)}
                >
                  ↓
                </Button>
              </div>
              <Input
                label="Display name"
                className="min-w-[140px]"
                value={p.name}
                onChange={(e) =>
                  setPlans((list) =>
                    list.map((x) =>
                      x.id === p.id ? { ...x, name: e.target.value } : x
                    )
                  )
                }
              />
              <Input
                label="Weekly cap"
                type="number"
                className="w-28"
                value={p.weeklyCap}
                onChange={(e) =>
                  setPlans((list) =>
                    list.map((x) =>
                      x.id === p.id
                        ? { ...x, weeklyCap: Number(e.target.value) }
                        : x
                    )
                  )
                }
              />
              <Input
                label="Monthly push target"
                type="number"
                className="w-28"
                value={p.monthlyPushTarget ?? ""}
                onChange={(e) =>
                  setPlans((list) =>
                    list.map((x) =>
                      x.id === p.id
                        ? {
                            ...x,
                            monthlyPushTarget: Number(e.target.value) || null,
                          }
                        : x
                    )
                  )
                }
              />
              <Input
                label="Assured bookings"
                type="number"
                className="w-28"
                value={p.assuredBookings ?? ""}
                onChange={(e) =>
                  setPlans((list) =>
                    list.map((x) =>
                      x.id === p.id
                        ? {
                            ...x,
                            assuredBookings: Number(e.target.value) || 0,
                          }
                        : x
                    )
                  )
                }
              />
              <Input
                label="List price (INR)"
                type="number"
                className="w-32"
                value={p.listPriceInr ?? ""}
                onChange={(e) =>
                  setPlans((list) =>
                    list.map((x) =>
                      x.id === p.id
                        ? {
                            ...x,
                            listPriceInr: e.target.value ? Number(e.target.value) : null,
                          }
                        : x
                    )
                  )
                }
              />
              <Input
                label="Public summary (support AI)"
                className="min-w-[220px] flex-1"
                value={p.planSummary ?? ""}
                onChange={(e) =>
                  setPlans((list) =>
                    list.map((x) =>
                      x.id === p.id ? { ...x, planSummary: e.target.value || null } : x
                    )
                  )
                }
                placeholder="What's included — shown to support chat"
              />
              <label className="flex items-center gap-2 text-sm pb-2">
                <input
                  type="checkbox"
                  checked={p.active}
                  onChange={(e) =>
                    setPlans((list) =>
                      list.map((x) =>
                        x.id === p.id ? { ...x, active: e.target.checked } : x
                      )
                    )
                  }
                />
                Active
              </label>
              <Button size="sm" onClick={() => savePlan(p)}>
                Save
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="space-y-4">
        <h2 className="font-semibold text-brand">Budget tier limits (INR)</h2>
        <p className="text-sm text-slate-muted">
          Tier is set automatically from the sum of ceremony budgets at verification.
          Uploaders cannot pick a tier manually.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {BUDGET_TIER_ORDER.map((tier) => {
            const limit =
              sla.budgetTierLimits?.[tier] ?? DEFAULT_BUDGET_TIER_LIMITS[tier];
            return (
              <div key={tier} className="space-y-2 rounded-lg border border-slate-200 p-3">
                <h3 className="text-sm font-medium text-brand">
                  {BUDGET_TIER_LABELS[tier]}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Min"
                    type="number"
                    min={0}
                    value={String(limit.min)}
                    onChange={(e) => updateTierLimit(tier, "min", e.target.value)}
                  />
                  <Input
                    label="Max"
                    type="number"
                    min={0}
                    placeholder="No max"
                    value={limit.max === null ? "" : String(limit.max)}
                    onChange={(e) => updateTierLimit(tier, "max", e.target.value)}
                  />
                </div>
                <p className="text-xs text-slate-muted">
                  {formatTierRangeLabel(limit)}
                </p>
              </div>
            );
          })}
        </div>
        <Button
          onClick={() =>
            void saveBudgetTierLimits(
              (sla.budgetTierLimits ??
                DEFAULT_BUDGET_TIER_LIMITS) as Record<BudgetTier, BudgetTierLimit>
            )
          }
        >
          Save tier limits
        </Button>
      </Card>
      <Card className="space-y-4">
        <h2 className="font-semibold text-brand">Lead sources</h2>
        <div className="flex flex-wrap gap-2">
          {(sla.leadSources ?? []).map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-full bg-light-bg px-3 py-1 text-sm"
            >
              {s}
              <button
                type="button"
                className="text-slate-muted hover:text-danger"
                onClick={() =>
                  void saveLeadSources(
                    (sla.leadSources ?? []).filter((x) => x !== s)
                  )
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="New source"
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
          />
          <Button
            variant="secondary"
            onClick={() => {
              if (!newSource.trim()) return;
              void saveLeadSources([
                ...(sla.leadSources ?? []),
                newSource.trim(),
              ]);
              setNewSource("");
            }}
          >
            Add
          </Button>
        </div>
      </Card>
      <Card className="scroll-mt-6 space-y-4">
        <h2 id="mua-services" className="font-semibold text-brand">
          MUA service catalog
        </h2>
        <AdminMuaServicesPanel />
      </Card>
      <Card className="scroll-mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="cities" className="font-semibold text-brand">
            City–region mapping
          </h2>
          <AdminExportCsvButton apiPath="/api/admin/cities" label="Download cities CSV" />
        </div>
        <p className="text-sm text-slate-muted">
          Used to auto-fill region from event city on lead forms. State links city → region for multi-state plans.
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="City name"
            value={newCity}
            onChange={(e) => setNewCity(e.target.value)}
            className="min-w-[160px]"
          />
          <Input
            placeholder="State (e.g. Maharashtra)"
            value={newCityState}
            onChange={(e) => setNewCityState(e.target.value)}
            className="min-w-[180px]"
          />
          <select
            className="rounded-lg border px-3 py-2 text-sm capitalize"
            value={newCityRegion}
            onChange={(e) => setNewCityRegion(e.target.value as Region)}
          >
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => void addCity()}>
            Add city
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-muted">
                <th className="py-2 pr-4">City</th>
                <th className="py-2 pr-4">State</th>
                <th className="py-2 pr-4">Region</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {cities.map((c) => (
                <tr key={c.city} className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-medium">{c.city}</td>
                  <td className="py-2 pr-4">
                    <Input
                      value={c.state ?? ""}
                      onChange={(e) =>
                        setCities((list) =>
                          list.map((row) =>
                            row.city === c.city ? { ...row, state: e.target.value } : row,
                          ),
                        )
                      }
                      onBlur={(e) => void updateCityState(c.city, e.target.value)}
                      className="min-w-[140px] py-1 text-sm"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <select
                      className="rounded border px-2 py-1 capitalize"
                      value={c.region}
                      onChange={(e) =>
                        void updateCityRegion(c.city, e.target.value as Region)
                      }
                    >
                      {REGIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      onClick={() => void deleteCity(c.city)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold text-brand">Ceremony types</h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {sla.ceremonyTypes.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-full bg-light-bg px-3 py-1 text-sm"
            >
              {c}
              <button
                type="button"
                className="text-slate-muted hover:text-danger"
                onClick={() =>
                  void saveCeremonies(sla.ceremonyTypes.filter((x) => x !== c))
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="New ceremony"
            value={newCeremony}
            onChange={(e) => setNewCeremony(e.target.value)}
          />
          <Button
            variant="secondary"
            onClick={() => {
              if (!newCeremony.trim()) return;
              void saveCeremonies([...sla.ceremonyTypes, newCeremony.trim()]);
              setNewCeremony("");
            }}
          >
            Add
          </Button>
        </div>
      </Card>

      <AdminWhatsAppTemplatesPanel initial={whatsappConfig} />
    </div>
  );
}
