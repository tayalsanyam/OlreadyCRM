"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import {
  templatesForPoolResolved,
  type ResolvedWhatsAppConfig,
  type SavedWhatsAppTemplate,
  type WhatsAppConfig,
} from "@/lib/whatsapp/config";
import {
  PIPELINE_STAGE_ORDER,
  type MuaPushStage,
  type PipelineStage,
} from "@/lib/types";
import {
  WHATSAPP_TEMPLATE_POOLS,
  WHATSAPP_TEMPLATES,
  type WhatsAppTemplatePool,
} from "@/lib/whatsapp/templates";

const POOL_LABEL: Record<WhatsAppTemplatePool, string> = {
  sales: "Sales (MUA)",
  rmMua: "RM → MUA",
  rmBride: "RM → Bride",
  care: "Care (Grievance)",
  feedback: "Feedback (Bride)",
};

const PUSH_STAGES: { value: MuaPushStage; label: string }[] = [
  { value: "initialContact", label: "Initial contact" },
  { value: "offerSent", label: "Offer sent" },
  { value: "followUpDone", label: "Follow-up done" },
  { value: "negotiating", label: "Negotiating" },
  { value: "brideSelected", label: "Bride selected" },
];

type Props = {
  initial: ResolvedWhatsAppConfig;
};

export function AdminWhatsAppTemplatesPanel({ initial }: Props) {
  const { toast } = useToast();
  const [resolved, setResolved] = useState(initial);
  const [draftBodies, setDraftBodies] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const t of initial.templates) map[t.id] = t.body;
    return map;
  });
  const [draftImageUrls, setDraftImageUrls] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const t of initial.templates) {
      if (t.imageUrl) map[t.id] = t.imageUrl;
    }
    return map;
  });
  const [salesDefaults, setSalesDefaults] = useState(resolved.salesStageDefaults);
  const [rmMuaDefaults, setRmMuaDefaults] = useState(resolved.rmPushStageDefaults);
  const [rmBrideDefaults, setRmBrideDefaults] = useState(resolved.rmPushBrideDefaults);
  const [pool, setPool] = useState<WhatsAppTemplatePool>("sales");
  const [busy, setBusy] = useState(false);
  const [savedDrafts, setSavedDrafts] = useState<SavedWhatsAppTemplate[]>(
    () => initial.savedTemplates ?? [],
  );
  useEffect(() => {
    setSavedDrafts(initial.savedTemplates ?? []);
  }, [initial.savedTemplates]);

  const poolTemplates = useMemo(
    () => templatesForPoolResolved(pool, resolved.templates),
    [pool, resolved.templates],
  );

  const baselineById = useMemo(() => {
    return new Map(WHATSAPP_TEMPLATES.map((t) => [t.id, t.body]));
  }, []);

  async function saveTemplate(id: string) {
    setBusy(true);
    const body = draftBodies[id] ?? "";
    const imageUrl = draftImageUrls[id]?.trim() ?? "";
    const res = await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group: "whatsappConfig",
        data: {
          templateBodies: { [id]: body },
          templateImageUrls: { [id]: imageUrl },
        } satisfies WhatsAppConfig,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast("Could not save template", "error");
      return;
    }
    setResolved((prev) => ({
      ...prev,
      templates: prev.templates.map((t) =>
        t.id === id ? { ...t, body, imageUrl: imageUrl || null } : t,
      ),
    }));
    toast("Template saved");
  }

  async function resetTemplate(id: string) {
    const baseline = baselineById.get(id);
    if (!baseline) return;
    setDraftBodies((d) => ({ ...d, [id]: baseline }));
    setDraftImageUrls((d) => ({ ...d, [id]: "" }));
    setBusy(true);
    const res = await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group: "whatsappConfig",
        data: {
          templateBodies: { [id]: baseline },
          templateImageUrls: { [id]: "" },
        },
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast("Could not reset template", "error");
      return;
    }
    setResolved((prev) => ({
      ...prev,
      templates: prev.templates.map((t) =>
        t.id === id ? { ...t, body: baseline, imageUrl: null } : t,
      ),
    }));
    toast("Reset to default");
  }

  async function saveDefaults() {
    setBusy(true);
    const res = await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group: "whatsappConfig",
        data: {
          salesStageDefaults: salesDefaults,
          rmPushStageDefaults: rmMuaDefaults,
          rmPushBrideDefaults: rmBrideDefaults,
        } satisfies WhatsAppConfig,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast("Could not save defaults", "error");
      return;
    }
    setResolved((prev) => ({
      ...prev,
      salesStageDefaults: salesDefaults,
      rmPushStageDefaults: rmMuaDefaults,
      rmPushBrideDefaults: rmBrideDefaults,
    }));
    toast("Stage defaults saved");
  }

  async function saveSavedTemplate(entry: SavedWhatsAppTemplate) {
    const draft = savedDrafts.find((t) => t.id === entry.id);
    if (!draft) return;
    setBusy(true);
    const res = await fetch(`/api/whatsapp/saved-templates/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: draft.label,
        body: draft.body,
        pool: draft.pool,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast("Could not save team template", "error");
      return;
    }
    const json = (await res.json()) as { data?: SavedWhatsAppTemplate };
    if (json.data) {
      setSavedDrafts((rows) => rows.map((t) => (t.id === entry.id ? json.data! : t)));
      setResolved((prev) => ({
        ...prev,
        savedTemplates: (prev.savedTemplates ?? []).map((t) =>
          t.id === entry.id ? json.data! : t,
        ),
        templates: prev.templates.map((t) =>
          t.id === entry.id
            ? {
                ...t,
                label: json.data!.label,
                body: json.data!.body,
                pool: json.data!.pool,
              }
            : t,
        ),
      }));
    }
    toast("Team template updated");
  }

  async function deleteSavedTemplate(id: string) {
    if (!confirm("Remove this saved template for everyone?")) return;
    setBusy(true);
    const res = await fetch(`/api/whatsapp/saved-templates/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      toast("Could not delete template", "error");
      return;
    }
    setSavedDrafts((rows) => rows.filter((t) => t.id !== id));
    setResolved((prev) => ({
      ...prev,
      savedTemplates: (prev.savedTemplates ?? []).filter((t) => t.id !== id),
      templates: prev.templates.filter((t) => t.id !== id),
    }));
    toast("Template removed");
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h2 className="mb-3 text-lg font-semibold text-brand">Default template by stage</h2>
        <p className="mb-3 text-sm text-slate-muted">
          Pick which message opens first when completing a task or changing stage.
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          <DefaultMap
            title="Sales pipeline"
            rows={PIPELINE_STAGE_ORDER.map((stage) => ({
              key: stage,
              label: stage,
              value: salesDefaults[stage] ?? "",
              options: templatesForPoolResolved("sales", resolved.templates),
            }))}
            onChange={(stage, templateId) =>
              setSalesDefaults((d) => ({ ...d, [stage as PipelineStage]: templateId }))
            }
          />
          <DefaultMap
            title="RM push → MUA"
            rows={PUSH_STAGES.map(({ value, label }) => ({
              key: value,
              label,
              value: rmMuaDefaults[value] ?? "",
              options: templatesForPoolResolved("rmMua", resolved.templates),
            }))}
            onChange={(stage, templateId) =>
              setRmMuaDefaults((d) => ({ ...d, [stage as MuaPushStage]: templateId }))
            }
          />
          <DefaultMap
            title="RM push → Bride"
            rows={PUSH_STAGES.map(({ value, label }) => ({
              key: value,
              label,
              value: rmBrideDefaults[value] ?? "",
              options: templatesForPoolResolved("rmBride", resolved.templates),
            }))}
            onChange={(stage, templateId) =>
              setRmBrideDefaults((d) => ({ ...d, [stage as MuaPushStage]: templateId }))
            }
          />
        </div>
        <div className="mt-3">
          <Button size="sm" disabled={busy} onClick={() => void saveDefaults()}>
            Save stage defaults
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-lg font-semibold text-brand">Team saved templates</h2>
        <p className="mb-4 text-sm text-slate-muted">
          Messages saved by RMs appear here with a ★ in pickers. Review wording and fix if needed.
        </p>
        {savedDrafts.length === 0 ? (
          <p className="text-sm text-slate-muted">No team templates yet.</p>
        ) : (
          <div className="space-y-4">
            {savedDrafts.map((t) => (
              <div key={t.id} className="rounded-lg border border-amber-200 bg-amber-50/30 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-brand">★ {t.label}</p>
                  <p className="text-xs text-slate-muted">
                    {POOL_LABEL[t.pool]} · {t.createdByName} ·{" "}
                    {new Date(t.createdAt).toLocaleDateString("en-IN")}
                  </p>
                </div>
                <Input
                  label="Name"
                  value={savedDrafts.find((d) => d.id === t.id)?.label ?? t.label}
                  onChange={(e) =>
                    setSavedDrafts((rows) =>
                      rows.map((r) => (r.id === t.id ? { ...r, label: e.target.value } : r)),
                    )
                  }
                  className="mb-2"
                />
                <label className="mb-2 flex flex-col gap-1 text-xs">
                  <span className="font-medium text-slate-muted">Pool</span>
                  <select
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={savedDrafts.find((d) => d.id === t.id)?.pool ?? t.pool}
                    onChange={(e) =>
                      setSavedDrafts((rows) =>
                        rows.map((r) =>
                          r.id === t.id
                            ? { ...r, pool: e.target.value as WhatsAppTemplatePool }
                            : r,
                        ),
                      )
                    }
                  >
                    {WHATSAPP_TEMPLATE_POOLS.map((p) => (
                      <option key={p} value={p}>
                        {POOL_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </label>
                <textarea
                  className="min-h-[120px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm whitespace-pre-wrap"
                  value={savedDrafts.find((d) => d.id === t.id)?.body ?? t.body}
                  onChange={(e) =>
                    setSavedDrafts((rows) =>
                      rows.map((r) => (r.id === t.id ? { ...r, body: e.target.value } : r)),
                    )
                  }
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy} onClick={() => void saveSavedTemplate(t)}>
                    Save changes
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void deleteSavedTemplate(t.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-lg font-semibold text-brand">Message templates</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {WHATSAPP_TEMPLATE_POOLS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPool(p)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                pool === p
                  ? "border-brand bg-brand text-white"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {POOL_LABEL[p]}
            </button>
          ))}
        </div>
        <div className="space-y-4">
          {poolTemplates.map((t) => (
            <div key={t.id} className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold text-brand">{t.label}</p>
              <p className="mb-2 text-xs text-slate-muted">{t.id}</p>
              <textarea
                className="min-h-[140px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm whitespace-pre-wrap"
                value={draftBodies[t.id] ?? t.body}
                onChange={(e) => setDraftBodies((d) => ({ ...d, [t.id]: e.target.value }))}
              />
              <label className="mt-2 flex flex-col gap-1 text-xs">
                <span className="font-medium text-slate-muted">
                  Optional image URL (attach manually in WhatsApp)
                </span>
                <input
                  type="url"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="https://… brochure, portfolio, or reference image"
                  value={draftImageUrls[t.id] ?? t.imageUrl ?? ""}
                  onChange={(e) =>
                    setDraftImageUrls((d) => ({ ...d, [t.id]: e.target.value }))
                  }
                />
                <span className="text-slate-muted">
                  wa.me cannot send images automatically — staff attach after opening chat.
                </span>
              </label>
              {(draftImageUrls[t.id] || t.imageUrl) ? (
                <img
                  src={draftImageUrls[t.id] || t.imageUrl || ""}
                  alt=""
                  className="mt-2 max-h-28 rounded border border-slate-200 object-contain"
                />
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => void saveTemplate(t.id)}>
                  Save
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void resetTemplate(t.id)}>
                  Reset to built-in
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function DefaultMap({
  title,
  rows,
  onChange,
}: {
  title: string;
  rows: { key: string; label: string; value: string; options: { id: string; label: string }[] }[];
  onChange: (key: string, templateId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="mb-2 text-sm font-semibold text-text">{title}</p>
      <div className="space-y-2">
        {rows.map((row) => (
          <label key={row.key} className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-slate-muted">{row.label}</span>
            <select
              className="rounded border border-slate-200 px-2 py-1.5 text-sm"
              value={row.value || row.options[0]?.id || ""}
              onChange={(e) => onChange(row.key, e.target.value)}
            >
              {row.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}
