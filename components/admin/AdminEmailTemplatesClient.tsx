"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import {
  TICKET_EMAIL_TEMPLATE_CATEGORY_OPTIONS,
  TICKET_EMAIL_TEMPLATE_SAMPLES,
} from "@/lib/ticket-email-template-samples";

type Template = {
  id: string;
  category: string | null;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  approvalTier: number;
  requiresAdminApproval: boolean;
  active: boolean;
};

const DEFAULT_SAMPLE = TICKET_EMAIL_TEMPLATE_SAMPLES[0];

const EMPTY_FORM = {
  category: "",
  name: "",
  subjectTemplate: "",
  bodyTemplate: "",
  approvalTier: "0",
  requiresAdminApproval: false,
};

function categoryLabel(category: string | null) {
  if (!category) return "General";
  return (
    TICKET_EMAIL_TEMPLATE_CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? category
  );
}

function sampleForCategory(category: string) {
  const normalized = category || null;
  return (
    TICKET_EMAIL_TEMPLATE_SAMPLES.find((s) => s.category === normalized) ??
    TICKET_EMAIL_TEMPLATE_SAMPLES.find((s) => s.category === null) ??
    DEFAULT_SAMPLE
  );
}

export function AdminEmailTemplatesClient() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    void fetch("/api/admin/grievances/email-templates")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          toast(json.error, "error");
          return;
        }
        setTemplates(json.data ?? []);
      })
      .catch(() => toast("Could not load templates", "error"));
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, Template[]>();
    for (const t of templates) {
      const key = t.category ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (!a) return -1;
      if (!b) return 1;
      return a.localeCompare(b);
    });
  }, [templates]);

  const startEdit = (t: Template) => {
    setEditingId(t.id);
    setForm({
      category: t.category ?? "",
      name: t.name,
      subjectTemplate: t.subjectTemplate,
      bodyTemplate: t.bodyTemplate,
      approvalTier: String(t.approvalTier),
      requiresAdminApproval: t.requiresAdminApproval,
    });
  };

  const startNew = () => {
    setEditingId("new");
    setForm({
      category: "",
      name: DEFAULT_SAMPLE.name,
      subjectTemplate: DEFAULT_SAMPLE.subjectTemplate,
      bodyTemplate: DEFAULT_SAMPLE.bodyTemplate,
      approvalTier: String(DEFAULT_SAMPLE.approvalTier),
      requiresAdminApproval: DEFAULT_SAMPLE.requiresAdminApproval,
    });
  };

  const loadSampleForForm = () => {
    const sample = sampleForCategory(form.category);
    setForm((f) => ({
      ...f,
      name: sample.name,
      subjectTemplate: sample.subjectTemplate,
      bodyTemplate: sample.bodyTemplate,
      approvalTier: String(sample.approvalTier),
      requiresAdminApproval: sample.requiresAdminApproval,
    }));
    toast("Sample content loaded — edit and save");
  };

  const save = async () => {
    setLoading(true);
    const payload = {
      category: form.category || null,
      name: form.name,
      subjectTemplate: form.subjectTemplate,
      bodyTemplate: form.bodyTemplate,
      approvalTier: Number(form.approvalTier) || 0,
      requiresAdminApproval: form.requiresAdminApproval,
      active: true,
    };

    const res =
      editingId && editingId !== "new"
        ? await fetch(`/api/admin/grievances/email-templates/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/grievances/email-templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

    setLoading(false);
    const json = await res.json();
    if (!res.ok) {
      toast(json.error ?? "Save failed", "error");
      return;
    }
    toast("Template saved");
    setEditingId(null);
    setForm(EMPTY_FORM);
    load();
  };

  const deactivate = async (id: string) => {
    const res = await fetch(`/api/admin/grievances/email-templates/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast("Could not deactivate", "error");
      return;
    }
    toast("Template deactivated");
    load();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand">Care email templates</h1>
          <p className="text-sm text-slate-muted">
            Templates used in the Grievance Centre email composer. Edit here; care agents pick them on
            each ticket. Variables: {"{{ticket_number}}"}, {"{{party_name}}"}, {"{{mua_name}}"},
            {" {{bride_name}}"}, {"{{resolution}}"}, {"{{next_steps}}"}
          </p>
        </div>
        <Button onClick={startNew}>New template</Button>
      </div>

      {(editingId === "new" || editingId) && (
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">{editingId === "new" ? "New template" : "Edit template"}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Select
              label="Category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              options={TICKET_EMAIL_TEMPLATE_CATEGORY_OPTIONS}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={loadSampleForForm}>
              Load sample for category
            </Button>
          </div>
          <Input
            label="Subject template"
            value={form.subjectTemplate}
            onChange={(e) => setForm((f) => ({ ...f, subjectTemplate: e.target.value }))}
          />
          <div>
            <label className="mb-1 block text-sm font-medium">Body template</label>
            <textarea
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
              rows={10}
              value={form.bodyTemplate}
              onChange={(e) => setForm((f) => ({ ...f, bodyTemplate: e.target.value }))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Input
              label="Approval tier (0–3)"
              type="number"
              value={form.approvalTier}
              onChange={(e) => setForm((f) => ({ ...f, approvalTier: e.target.value }))}
              className="w-32"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.requiresAdminApproval}
                onChange={(e) =>
                  setForm((f) => ({ ...f, requiresAdminApproval: e.target.checked }))
                }
              />
              Requires admin approval
            </label>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={loading}>
              {loading ? "Saving…" : "Save"}
            </Button>
            <Button variant="secondary" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Card className="divide-y divide-slate-100 p-0">
        {templates.length === 0 ? (
          <p className="p-4 text-sm text-slate-muted">
            No templates yet. Run the latest database migration or create one above.
          </p>
        ) : (
          grouped.map(([categoryKey, items]) => (
            <div key={categoryKey || "general"}>
              <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-muted">
                {categoryLabel(categoryKey || null)}
              </div>
              {items.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-50 p-4 last:border-b-0"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t.name}</span>
                      {!t.active && <Badge variant="critical">Inactive</Badge>}
                      {t.requiresAdminApproval && <Badge variant="hot">Needs approval</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-slate-muted">{t.subjectTemplate}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => startEdit(t)}>
                      Edit
                    </Button>
                    {t.active && (
                      <Button size="sm" variant="secondary" onClick={() => deactivate(t.id)}>
                        Deactivate
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
