"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { categorySideGroup } from "@/lib/ticket-category-registry";

type CategoryRow = {
  category: string;
  label: string;
  description: string;
  raisedByType: string | null;
  defaultUrgency: string;
  defaultApprovalTier: number;
  requiresLedger: boolean;
  slaHours: number;
  active: boolean;
  showOnPublicSupport: boolean;
};

type SlaConfig = { highHours: number; mediumHours: number; lowHours: number };

const URGENCY_TIERS = ["high", "medium", "low"] as const;

const SIDE_OPTIONS = [
  { value: "mua", label: "MUA / artist intake" },
  { value: "bride", label: "Bride / lead intake" },
  { value: "other", label: "Other (public form)" },
  { value: "shared", label: "All sides (shared)" },
];

const URGENCY_OPTIONS = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

function sideBadgeVariant(side: ReturnType<typeof categorySideGroup>) {
  if (side === "bride") return "hot" as const;
  if (side === "mua") return "muted" as const;
  if (side === "other") return "tier2" as const;
  return "default" as const;
}

function sideLabel(side: ReturnType<typeof categorySideGroup>): string {
  if (side === "bride") return "Bride";
  if (side === "mua") return "MUA";
  if (side === "other") return "Other";
  return "Shared";
}

export function AdminGrievanceConfigClient() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"categories" | "sla">("sla");
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [sla, setSla] = useState<SlaConfig | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newCategory, setNewCategory] = useState({
    label: "",
    slug: "",
    description: "",
    raisedByType: "mua",
    defaultUrgency: "medium",
    defaultApprovalTier: 1,
    requiresLedger: false,
    showOnPublicSupport: true,
  });

  const load = useCallback(async () => {
    const [categoryRes, slaRes] = await Promise.all([
      fetch("/api/admin/grievances/category-config"),
      fetch("/api/admin/grievances/sla-config"),
    ]);
    const [categoryJson, slaJson] = await Promise.all([
      categoryRes.json().catch(() => ({})),
      slaRes.json().catch(() => ({})),
    ]);

    if (!categoryRes.ok) {
      toast(categoryJson.error ?? "Could not load issue categories", "error");
      setCategories([]);
    } else {
      setCategories(categoryJson.data ?? []);
    }

    if (!slaRes.ok) {
      toast(slaJson.error ?? "Could not load SLA settings", "error");
      setSla(null);
    } else {
      setSla(slaJson.data ?? null);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const categoriesByUrgency = useMemo(() => {
    const map: Record<string, CategoryRow[]> = { high: [], medium: [], low: [] };
    for (const row of categories.filter((c) => c.active)) {
      const tier = row.defaultUrgency as (typeof URGENCY_TIERS)[number];
      if (map[tier]) map[tier].push(row);
    }
    for (const tier of URGENCY_TIERS) {
      map[tier].sort((a, b) => a.label.localeCompare(b.label));
    }
    return map;
  }, [categories]);

  const saveSla = async () => {
    if (!sla) return;
    if (
      !Number.isFinite(sla.highHours) ||
      !Number.isFinite(sla.mediumHours) ||
      !Number.isFinite(sla.lowHours) ||
      sla.highHours < 1 ||
      sla.mediumHours < 1 ||
      sla.lowHours < 1
    ) {
      toast("Enter a positive number of hours for each urgency tier", "error");
      return;
    }
    const res = await fetch("/api/admin/grievances/sla-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sla),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(json.error ?? "SLA save failed", "error");
      return;
    }
    toast("SLA hours updated");
    load();
  };

  const patchCategory = async (
    category: string,
    patch: Partial<CategoryRow> & { raisedByType?: string | null }
  ) => {
    const payload: Record<string, unknown> = { category };
    if (patch.label !== undefined) payload.label = patch.label;
    if (patch.description !== undefined) payload.description = patch.description;
    if (patch.raisedByType !== undefined) {
      payload.raisedByType = patch.raisedByType === null ? "shared" : patch.raisedByType;
    }
    if (patch.defaultUrgency !== undefined) payload.defaultUrgency = patch.defaultUrgency;
    if (patch.defaultApprovalTier !== undefined) {
      payload.defaultApprovalTier = patch.defaultApprovalTier;
    }
    if (patch.requiresLedger !== undefined) payload.requiresLedger = patch.requiresLedger;
    if (patch.active !== undefined) payload.active = patch.active;
    if (patch.showOnPublicSupport !== undefined) {
      payload.showOnPublicSupport = patch.showOnPublicSupport;
    }

    const res = await fetch("/api/admin/grievances/category-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(json.error ?? "Update failed", "error");
      return false;
    }
    if (json.data) {
      setCategories((rows) =>
        rows.map((row) => (row.category === category ? { ...row, ...json.data } : row))
      );
    } else {
      load();
    }
    return true;
  };

  const createCategory = async () => {
    const res = await fetch("/api/admin/grievances/category-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: newCategory.slug || newCategory.label,
        label: newCategory.label,
        description: newCategory.description,
        raisedByType: newCategory.raisedByType === "shared" ? null : newCategory.raisedByType,
        defaultUrgency: newCategory.defaultUrgency,
        defaultApprovalTier: newCategory.defaultApprovalTier,
        requiresLedger: newCategory.requiresLedger,
        showOnPublicSupport: newCategory.showOnPublicSupport,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(json.error ?? "Could not create category", "error");
      return;
    }
    toast("Category added");
    setShowAdd(false);
    setNewCategory({
      label: "",
      slug: "",
      description: "",
      raisedByType: "mua",
      defaultUrgency: "medium",
      defaultApprovalTier: 1,
      requiresLedger: false,
      showOnPublicSupport: true,
    });
    load();
  };

  const groupedCategories = useMemo(() => {
    const groups: Record<"bride" | "mua" | "other" | "shared", CategoryRow[]> = {
      bride: [],
      mua: [],
      other: [],
      shared: [],
    };
    for (const row of categories) {
      groups[categorySideGroup(row.raisedByType, row.category)].push(row);
    }
    for (const key of Object.keys(groups) as Array<keyof typeof groups>) {
      groups[key].sort((a, b) => a.label.localeCompare(b.label));
    }
    return groups;
  }, [categories]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand">Care configuration</h1>
        <p className="text-sm text-slate-muted">
          Issue categories, urgency tiers, and SLA deadlines. Intake forms and the grievance inbox
          read from this configuration automatically.
        </p>
      </div>

      <div className="flex gap-2 border-b border-slate-100 pb-2">
        {(["sla", "categories"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm capitalize ${
              tab === t ? "bg-brand text-white" : "text-slate-muted hover:bg-slate-100"
            }`}
          >
            {t === "sla" ? "SLA & urgency" : "Issue categories"}
          </button>
        ))}
      </div>

      {tab === "sla" && sla && (
        <div className="space-y-6">
          <Card className="p-4 text-sm text-slate-muted">
            <p>
              Each issue category is assigned a <strong className="text-text">default urgency</strong>{" "}
              (high, medium, or low). New tickets use the SLA hours below for that urgency tier when
              calculating the deadline. Changing hours here updates all tickets in that tier going
              forward; existing ticket deadlines are unchanged.
            </p>
            <p className="mt-2">
              <strong className="text-text">Inbox filters</strong> list every active category from
              the Categories tab. New issues appear in intake forms for their assigned side (MUA,
              Bride, or Other) and in the shared filter dropdown when the slug matches.
            </p>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            {URGENCY_TIERS.map((tier) => {
              const hours =
                tier === "high"
                  ? sla.highHours
                  : tier === "low"
                    ? sla.lowHours
                    : sla.mediumHours;
              const setHours = (value: number) => {
                setSla((s) =>
                  s
                    ? {
                        ...s,
                        ...(tier === "high"
                          ? { highHours: value }
                          : tier === "low"
                            ? { lowHours: value }
                            : { mediumHours: value }),
                      }
                    : s
                );
              };
              const rows = categoriesByUrgency[tier] ?? [];

              return (
                <Card key={tier} className="flex flex-col p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-semibold capitalize text-brand">{tier} urgency</h2>
                    <Badge
                      variant={
                        tier === "high" ? "critical" : tier === "low" ? "muted" : "hot"
                      }
                    >
                      {rows.length} issues
                    </Badge>
                  </div>
                  <div className="mt-3">
                    <Input
                      label="Response deadline (hours)"
                      type="number"
                      min={1}
                      value={String(hours)}
                      onChange={(e) => setHours(Number(e.target.value))}
                    />
                  </div>
                  <div className="mt-4 flex-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-muted">
                      Categories in this tier
                    </p>
                    {rows.length === 0 ? (
                      <p className="mt-2 text-sm text-slate-muted">No categories assigned</p>
                    ) : (
                      <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                        {rows.map((c) => {
                          const side = categorySideGroup(c.raisedByType, c.category);
                          return (
                            <li
                              key={c.category}
                              className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2"
                            >
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-medium text-text">{c.label}</span>
                                <Badge variant={sideBadgeVariant(side)}>{sideLabel(side)}</Badge>
                              </div>
                              <p className="mt-1 font-mono text-xs text-slate-muted">{c.category}</p>
                              <div className="mt-2">
                                <Select
                                  value={c.defaultUrgency}
                                  onChange={async (e) => {
                                    await patchCategory(c.category, {
                                      defaultUrgency: e.target.value,
                                    });
                                  }}
                                  options={URGENCY_OPTIONS}
                                  className="text-xs"
                                />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button onClick={saveSla}>Save SLA hours</Button>
          </div>
        </div>
      )}

      {tab === "categories" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-muted">
              Add or edit issue types for MUA and bride intake. <strong className="text-text">Active</strong>{" "}
              controls care intake forms and inbox filters.{" "}
              <strong className="text-text">Public support</strong> controls whether a category
              appears on the /support submit form (care-only categories can stay active but hidden
              from the public page).
            </p>
            <Button variant="secondary" onClick={() => setShowAdd((v) => !v)}>
              {showAdd ? "Cancel" : "Add issue category"}
            </Button>
          </div>

          {showAdd && (
            <Card className="space-y-3 p-4">
              <h2 className="font-semibold text-brand">New issue category</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Display label"
                  value={newCategory.label}
                  onChange={(e) =>
                    setNewCategory((c) => ({ ...c, label: e.target.value }))
                  }
                  placeholder="e.g. Payment not received"
                />
                <Input
                  label="Slug (optional)"
                  value={newCategory.slug}
                  onChange={(e) =>
                    setNewCategory((c) => ({ ...c, slug: e.target.value }))
                  }
                  placeholder="Auto-generated from label"
                />
                <Select
                  label="Intake side"
                  value={newCategory.raisedByType}
                  onChange={(e) =>
                    setNewCategory((c) => ({ ...c, raisedByType: e.target.value }))
                  }
                  options={SIDE_OPTIONS}
                />
                <Select
                  label="Default urgency"
                  value={newCategory.defaultUrgency}
                  onChange={(e) =>
                    setNewCategory((c) => ({ ...c, defaultUrgency: e.target.value }))
                  }
                  options={URGENCY_OPTIONS}
                />
              </div>
              <Input
                label="Description (shown on intake)"
                value={newCategory.description}
                onChange={(e) =>
                  setNewCategory((c) => ({ ...c, description: e.target.value }))
                }
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newCategory.requiresLedger}
                  onChange={(e) =>
                    setNewCategory((c) => ({ ...c, requiresLedger: e.target.checked }))
                  }
                />
                Requires ledger investigation
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={newCategory.showOnPublicSupport}
                  onChange={(e) =>
                    setNewCategory((c) => ({ ...c, showOnPublicSupport: e.target.checked }))
                  }
                />
                Show on public /support submit form
              </label>
              <Button onClick={createCategory}>Create category</Button>
            </Card>
          )}

          {(["mua", "bride", "other", "shared"] as const).map((group) => {
            const rows = groupedCategories[group];
            const title =
              group === "bride"
                ? "Bride / lead issues"
                : group === "mua"
                  ? "MUA / artist issues"
                  : group === "other"
                    ? "Other (public form)"
                    : "Shared (all intake sides)";
            if (!rows.length) return null;

            return (
              <Card key={group} className="overflow-x-auto p-0">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h2 className="font-semibold text-brand">{title}</h2>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-slate-muted">
                      <th className="p-3">Label</th>
                      <th className="p-3">Slug</th>
                      <th className="p-3">Urgency</th>
                      <th className="p-3">Approval tier</th>
                      <th className="p-3">Ledger</th>
                      <th className="p-3">Active</th>
                      <th className="p-3">Public support</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.category} className="border-t border-slate-100">
                        <td className="p-3">
                          <span className="font-medium">{c.label}</span>
                          {c.description && (
                            <p className="mt-0.5 text-xs text-slate-muted">{c.description}</p>
                          )}
                        </td>
                        <td className="p-3 font-mono text-xs">{c.category}</td>
                        <td className="p-3">
                          <Select
                            value={c.defaultUrgency}
                            onChange={async (e) => {
                              await patchCategory(c.category, { defaultUrgency: e.target.value });
                            }}
                            options={URGENCY_OPTIONS}
                          />
                        </td>
                        <td className="p-3">{c.defaultApprovalTier}</td>
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={c.requiresLedger}
                            onChange={(e) =>
                              void patchCategory(c.category, { requiresLedger: e.target.checked })
                            }
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={c.active}
                            onChange={(e) =>
                              void patchCategory(c.category, { active: e.target.checked })
                            }
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={c.showOnPublicSupport}
                            disabled={!c.active}
                            title={
                              c.active
                                ? "Show on /support submit form"
                                : "Enable Active first"
                            }
                            onChange={(e) =>
                              void patchCategory(c.category, {
                                showOnPublicSupport: e.target.checked,
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-slate-muted">
        AI prompts and knowledge files:{" "}
        <Link href="/admin/ai" className="text-brand underline">
          AI Configuration
        </Link>
      </p>
    </div>
  );
}
