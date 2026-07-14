"use client";

import { Badge } from "@/components/ui/Badge";
import {
  truncateWhatsAppPreview,
  whatsAppMessagePreview,
  whatsAppTemplateLabel,
} from "@/lib/whatsapp/comms-display";

type Entry = {
  id: string;
  source: "sales" | "rm";
  entryType: string;
  description: string;
  createdAt: string;
  actorName?: string | null;
  metadata?: Record<string, unknown>;
};

function entryLabel(entryType: string): string {
  const map: Record<string, string> = {
    callLogged: "Call",
    whatsappLogged: "WhatsApp",
    emailLogged: "Email",
    stageChanged: "Stage",
    noteAdded: "Note",
    onboardingUpdated: "Onboarding",
    trainingUpdated: "Training",
    activationUpdated: "Activation",
    callyzerSynced: "Callyzer",
  };
  return map[entryType] ?? entryType;
}

function entryIcon(entryType: string): string {
  const map: Record<string, string> = {
    callLogged: "📞",
    whatsappLogged: "💬",
    emailLogged: "✉️",
    stageChanged: "➡️",
    noteAdded: "📝",
    onboardingUpdated: "📋",
    trainingUpdated: "🎯",
    activationUpdated: "✅",
    callyzerSynced: "📞",
  };
  return map[entryType] ?? "•";
}

function renderMeta(meta?: Record<string, unknown>) {
  if (!meta || Object.keys(meta).length === 0) return null;
  const occurredAt = typeof meta.occurredAt === "string" ? meta.occurredAt : null;
  const durationSec = typeof meta.durationSec === "number" ? meta.durationSec : null;
  const outcome = typeof meta.outcome === "string" ? meta.outcome : null;
  const direction = typeof meta.direction === "string" ? meta.direction : null;
  const chips: string[] = [];
  if (occurredAt) chips.push(`At ${new Date(occurredAt).toLocaleString("en-IN")}`);
  if (durationSec != null) chips.push(`Duration ${durationSec}s`);
  if (direction) chips.push(`Direction ${direction}`);
  if (outcome) chips.push(`Outcome ${outcome}`);
  if (typeof meta.fromStage === "string" && typeof meta.toStage === "string") {
    chips.push(`${meta.fromStage} → ${meta.toStage}`);
  }
  if (typeof meta.nextTouchPoint === "string" && meta.nextTouchPoint) {
    chips.push(`Next touch ${new Date(meta.nextTouchPoint).toLocaleDateString("en-IN")}`);
  }
  const templateLabel = whatsAppTemplateLabel(meta);
  const messagePreview = whatsAppMessagePreview(meta);
  if (templateLabel) chips.push(`Template: ${templateLabel}`);
  if (typeof meta.rejectionReason === "string" && meta.rejectionReason) chips.push(`Reason ${meta.rejectionReason}`);
  if (Array.isArray(meta.changedFields) && meta.changedFields.length) chips.push(`Updated: ${meta.changedFields.join(", ")}`);
  if (Array.isArray(meta.tasksCreated) && meta.tasksCreated.length) chips.push(`Tasks created: ${meta.tasksCreated.length}`);
  if (!chips.length && !messagePreview) return null;
  return (
    <>
      {chips.length ? (
        <p className="mt-1 text-xs text-slate-muted">{chips.join(" • ")}</p>
      ) : null}
      {messagePreview ? (
        <p className="mt-1 rounded-md border border-slate-100 bg-slate-50 p-2 text-xs text-slate-700 whitespace-pre-wrap">
          {truncateWhatsAppPreview(messagePreview, 320)}
        </p>
      ) : null}
    </>
  );
}

export function CommsTimeline({
  sales,
  prior,
  onLoadMoreSales,
  onLoadMorePrior,
  canLoadMoreSales,
  canLoadMorePrior,
}: {
  sales: Entry[];
  prior: Entry[];
  onLoadMoreSales?: () => void;
  onLoadMorePrior?: () => void;
  canLoadMoreSales?: boolean;
  canLoadMorePrior?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {sales.map((e) => (
          <div key={e.id} className="rounded-lg border border-slate-200 p-3">
            <div className="mb-1 flex items-center gap-2">
              <Badge>{entryIcon(e.entryType)} {entryLabel(e.entryType)}</Badge>
              <span className="text-xs text-slate-muted">{new Date(e.createdAt).toLocaleString("en-IN")}</span>
              {e.actorName ? <span className="text-xs text-slate-muted">by {e.actorName}</span> : null}
            </div>
            <p className="text-sm text-text">{e.description}</p>
            {renderMeta(e.metadata)}
          </div>
        ))}
        {canLoadMoreSales ? (
          <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={onLoadMoreSales}>
            Load more sales entries
          </button>
        ) : null}
      </div>

      {prior.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prior History (from RM + Commission CRM)</p>
          {prior.map((e) => (
            <div key={e.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1 flex items-center gap-2">
                <Badge variant="muted">🕘 RM History</Badge>
                <span className="text-xs text-slate-muted">{new Date(e.createdAt).toLocaleString("en-IN")}</span>
                {e.actorName ? <span className="text-xs text-slate-muted">by {e.actorName}</span> : null}
              </div>
              <p className="text-sm text-slate-700">{e.description}</p>
              {renderMeta(e.metadata)}
            </div>
          ))}
          {canLoadMorePrior ? (
            <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={onLoadMorePrior}>
              Load more prior history
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
