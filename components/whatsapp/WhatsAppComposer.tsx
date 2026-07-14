"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import {
  defaultBrideTemplateIdResolved,
  defaultTemplateIdForPushStageResolved,
  defaultTemplateIdForSalesStageResolved,
  defaultCareTemplateIdResolved,
  defaultFeedbackTemplateIdResolved,
  getTemplateByIdResolved,
  templatesForPoolResolved,
} from "@/lib/whatsapp/config";
import type { WhatsAppTemplatePool } from "@/lib/whatsapp/templates";
import { CUSTOM_TEMPLATE_ID } from "@/lib/whatsapp/saved-templates";
import { truncateWhatsAppPreview } from "@/lib/whatsapp/comms-display";
import {
  buildWaMeUrl,
  renderWhatsAppTemplate,
  resolveMuaPhone,
  type WhatsAppContext,
} from "@/lib/whatsapp/render";
import { logLeadWhatsApp, logSalesWhatsApp, logCareWhatsApp } from "@/lib/whatsapp/log-client";
import { useWhatsAppTemplates } from "@/lib/whatsapp/use-whatsapp-templates";
import type { MuaPushStage, PipelineStage } from "@/lib/types";

type Audience = "mua" | "bride";

export type WhatsAppComposerProps = {
  audience?: Audience;
  dualAudience?: boolean;
  defaultAudience?: Audience;
  phone?: string | null;
  whatsapp?: string | null;
  bridePhone?: string | null;
  context?: WhatsAppContext;
  pipelineStage?: PipelineStage | null;
  pushStage?: MuaPushStage | null;
  pipelineId?: string | null;
  leadId?: string | null;
  muaId?: string | null;
  templatePool?: WhatsAppTemplatePool;
  className?: string;
  onLogged?: () => void;
  /** Allow free-text message + AI polish + save as team template. */
  allowCustomMessage?: boolean;
  templateRefreshKey?: number;
  onTemplatesChanged?: () => void;
  /** When set, logs to care ticket instead of sales/lead comms. */
  ticketId?: string | null;
  /** Override default template selection for this composer. */
  preferredTemplateId?: string;
};

function poolForAudience(
  audience: Audience,
  templatePool?: WhatsAppTemplatePool,
): WhatsAppTemplatePool {
  if (templatePool) return templatePool;
  return audience === "bride" ? "rmBride" : "sales";
}

export function WhatsAppComposer({
  audience: fixedAudience,
  dualAudience = false,
  defaultAudience = "mua",
  phone,
  whatsapp,
  bridePhone,
  context = {},
  pipelineStage,
  pushStage,
  pipelineId,
  leadId,
  muaId,
  templatePool,
  className = "",
  onLogged,
  allowCustomMessage = false,
  templateRefreshKey = 0,
  onTemplatesChanged,
  ticketId,
  preferredTemplateId,
}: WhatsAppComposerProps) {
  const { toast } = useToast();
  const waConfig = useWhatsAppTemplates(templateRefreshKey);
  const [dismissed, setDismissed] = useState(false);
  const [tab, setTab] = useState<Audience>(fixedAudience ?? defaultAudience);
  const audience = fixedAudience ?? tab;
  const pool = poolForAudience(
    audience,
    templatePool ?? (audience === "bride" ? "rmBride" : dualAudience ? "rmMua" : "sales"),
  );
  const templates = useMemo(
    () => templatesForPoolResolved(pool, waConfig.templates),
    [pool, waConfig.templates],
  );

  const defaultTemplateId = useMemo(() => {
    if (preferredTemplateId) return preferredTemplateId;
    if (pool === "feedback") {
      return defaultFeedbackTemplateIdResolved();
    }
    if (pool === "rmBride") {
      return defaultBrideTemplateIdResolved(pushStage, waConfig.rmPushBrideDefaults);
    }
    if (pool === "rmMua") {
      return defaultTemplateIdForPushStageResolved(pushStage, waConfig.rmPushStageDefaults);
    }
    if (pool === "care") {
      return defaultCareTemplateIdResolved();
    }
    return defaultTemplateIdForSalesStageResolved(pipelineStage, waConfig.salesStageDefaults);
  }, [pool, pipelineStage, pushStage, waConfig, preferredTemplateId]);

  const [templateId, setTemplateId] = useState(defaultTemplateId);
  const [customDraft, setCustomDraft] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [copied, setCopied] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);
  const [logging, setLogging] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTemplateId(defaultTemplateId);
  }, [defaultTemplateId]);

  if (dismissed) return null;

  const isCustom = allowCustomMessage && templateId === CUSTOM_TEMPLATE_ID;
  const template =
    !isCustom
      ? getTemplateByIdResolved(templateId, waConfig.templates) ?? templates[0]
      : null;

  const rawMessage = isCustom
    ? customDraft
    : template
      ? renderWhatsAppTemplate(template.body, context)
      : "";

  const rendered = isCustom ? renderWhatsAppTemplate(customDraft, context) : rawMessage;

  const activePhone =
    audience === "bride" ? bridePhone : resolveMuaPhone(whatsapp, phone);

  const waUrl = buildWaMeUrl(activePhone, rendered);
  const phoneMissing = !activePhone?.trim();
  const shouldLog = Boolean(pipelineId || leadId || ticketId);

  const messageLabel = isCustom
    ? "Custom message"
    : template?.saved
      ? `Saved: ${template.label}`
      : template?.label ?? "message";

  function handleTemplateChange(nextId: string) {
    if (nextId === CUSTOM_TEMPLATE_ID && !customDraft.trim() && template) {
      setCustomDraft(template.body);
    }
    setTemplateId(nextId);
  }

  async function handlePolish() {
    if (!customDraft.trim()) {
      toast("Write a message first", "error");
      return;
    }
    setPolishing(true);
    try {
      const res = await fetch("/api/whatsapp/polish-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: customDraft,
          audience,
          muaName: context.muaName,
          brideName: context.brideName,
        }),
      });
      const json = (await res.json()) as { data?: { polished?: string }; error?: string };
      if (!res.ok || !json.data?.polished) {
        toast(json.error ?? "Could not polish message", "error");
        return;
      }
      setCustomDraft(json.data.polished);
      toast("Message polished");
    } finally {
      setPolishing(false);
    }
  }

  async function handleSaveTemplate() {
    const label = saveLabel.trim();
    const body = customDraft.trim();
    if (label.length < 2) {
      toast("Enter a template name", "error");
      return;
    }
    if (body.length < 10) {
      toast("Message must be at least 10 characters", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/whatsapp/saved-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, body, pool }),
      });
      const json = (await res.json()) as { data?: { id: string }; error?: string };
      if (!res.ok || !json.data?.id) {
        toast(json.error ?? "Could not save template", "error");
        return;
      }
      toast("Template saved for the team");
      setSaveOpen(false);
      setSaveLabel("");
      setTemplateId(json.data.id);
      onTemplatesChanged?.();
      await waConfig.refetch();
    } finally {
      setSaving(false);
    }
  }

  async function handleOpen() {
    if (!waUrl || !rendered.trim()) return;
    setLogging(true);
    const desc = `WhatsApp opened (${audience === "bride" ? "Bride" : "MUA"}): ${messageLabel}`;
    const metadata = {
      templateId: isCustom ? CUSTOM_TEMPLATE_ID : templateId,
      templateLabel: messageLabel,
      messagePreview: truncateWhatsAppPreview(rendered),
      audience,
      custom: isCustom,
      ...(muaId ? { muaId } : {}),
    };
    let logged = true;
    try {
      if (ticketId) {
        logged = await logCareWhatsApp({ ticketId, description: desc, metadata });
      } else if (pipelineId) {
        logged = await logSalesWhatsApp({ pipelineId, description: desc, metadata });
      } else if (leadId) {
        logged = await logLeadWhatsApp({
          leadId,
          description: desc,
          muaId: audience === "mua" ? muaId : null,
          metadata,
        });
      }
    } finally {
      setLogging(false);
    }
    if (shouldLog && !logged) {
      toast("Could not log WhatsApp activity — opening message anyway", "error");
    } else if (logged && onLogged) {
      onLogged();
    }
    window.open(waUrl, "_blank", "noopener,noreferrer");
  }

  async function handleCopy() {
    if (!rendered) return;
    await navigator.clipboard.writeText(rendered);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopyImageUrl() {
    const url = template?.imageUrl?.trim();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setImageCopied(true);
    setTimeout(() => setImageCopied(false), 2000);
  }

  return (
    <div className={`space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-emerald-900">WhatsApp (optional)</p>
        <button
          type="button"
          className="text-xs text-slate-muted underline"
          onClick={() => setDismissed(true)}
        >
          Skip
        </button>
      </div>

      {dualAudience && !fixedAudience ? (
        <div className="flex gap-2">
          {(["mua", "bride"] as Audience[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setTab(a)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                tab === a
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {a === "mua" ? "MUA" : "Bride"}
            </button>
          ))}
        </div>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-text">Template</span>
        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          value={templateId}
          onChange={(e) => handleTemplateChange(e.target.value)}
          disabled={waConfig.loading}
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.saved ? `★ ${t.label}` : t.label}
            </option>
          ))}
          {allowCustomMessage ? (
            <option value={CUSTOM_TEMPLATE_ID}>Write my own…</option>
          ) : null}
        </select>
      </label>

      {isCustom ? (
        <div className="space-y-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-text">Your message</span>
            <textarea
              className="min-h-[140px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm whitespace-pre-wrap"
              placeholder="Write your message… Use {muaName}, {brideName}, {city} where helpful."
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={polishing || !customDraft.trim()}
              onClick={() => void handlePolish()}
            >
              {polishing ? "Checking…" : "AI spell-check"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!customDraft.trim()}
              onClick={() => setSaveOpen((o) => !o)}
            >
              Save as team template
            </Button>
          </div>
          {saveOpen ? (
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
              <Input
                label="Template name"
                value={saveLabel}
                onChange={(e) => setSaveLabel(e.target.value)}
                placeholder="e.g. Follow-up after portfolio share"
                className="min-w-[200px] flex-1"
              />
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => void handleSaveTemplate()}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-sm whitespace-pre-wrap text-text">
        {rendered || (
          <span className="text-slate-muted">
            {isCustom ? "Preview appears as you type…" : "—"}
          </span>
        )}
      </div>

      {template?.imageUrl ? (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-medium text-text">Template image</p>
          <img
            src={template.imageUrl}
            alt=""
            className="max-h-32 rounded border border-slate-100 object-contain"
          />
          <p className="text-xs text-amber-800">
            WhatsApp Web cannot attach images via link — open the chat, then attach this
            image manually (download or copy link).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => window.open(template.imageUrl!, "_blank", "noopener,noreferrer")}
            >
              Open image
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => void handleCopyImageUrl()}>
              {imageCopied ? "Link copied" : "Copy image link"}
            </Button>
          </div>
        </div>
      ) : null}

      {phoneMissing ? (
        <p className="text-xs text-amber-800">
          No {audience === "bride" ? "bride" : "MUA"} phone on file — you can still copy the message.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!waUrl || logging || !rendered.trim()}
          onClick={() => void handleOpen()}
        >
          {logging ? "Logging…" : "Open WhatsApp"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!rendered.trim()}
          onClick={() => void handleCopy()}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
