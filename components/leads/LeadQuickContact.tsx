"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";
import type { WhatsAppTemplatePool } from "@/lib/whatsapp/templates";

export function LeadQuickContact({
  leadId,
  brideName,
  phone,
  city,
  layout = "inline",
  variant = "compact",
  templatePool,
  onLogged,
}: {
  leadId: string;
  brideName: string;
  phone?: string | null;
  city?: string | null;
  layout?: "inline" | "stacked";
  variant?: "default" | "compact";
  templatePool?: WhatsAppTemplatePool;
  onLogged?: () => void;
}) {
  const [callOpen, setCallOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const hasPhone = Boolean(phone?.trim());
  const compact = variant === "compact";

  const callControl = compact ? (
    <button
      type="button"
      disabled={!hasPhone}
      onClick={() => setCallOpen((v) => !v)}
      className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
    >
      Call
    </button>
  ) : (
    <Button size="sm" variant="secondary" disabled={!hasPhone} onClick={() => setCallOpen((v) => !v)}>
      Call
    </Button>
  );

  const waControl = compact ? (
    <button
      type="button"
      disabled={!hasPhone}
      onClick={() => setWaOpen(true)}
      className="text-xs font-medium text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
    >
      WhatsApp
    </button>
  ) : (
    <Button size="sm" variant="secondary" disabled={!hasPhone} onClick={() => setWaOpen(true)}>
      WhatsApp
    </Button>
  );

  return (
    <div
      className={
        layout === "stacked"
          ? "relative space-y-1"
          : compact
            ? "relative inline-flex flex-wrap items-center gap-1.5"
            : "relative flex flex-wrap items-center gap-1"
      }
      onClick={(e) => e.stopPropagation()}
    >
      {hasPhone ? (
        <>
          {callControl}
          {compact ? <span className="text-xs text-slate-300">·</span> : null}
          {waControl}
        </>
      ) : (
        <span className="text-xs text-slate-muted">—</span>
      )}
      {callOpen && hasPhone ? (
        <div
          className={
            compact
              ? "absolute left-0 top-full z-10 mt-1 flex items-center gap-2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1.5 shadow-md"
              : "flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5"
          }
        >
          <a href={`tel:${phone}`} className="text-sm font-medium text-accent hover:underline">
            {phone}
          </a>
          <span className="text-slate-300">|</span>
          <a href={`tel:${phone}`} className="text-xs font-medium text-brand hover:underline">
            Dial
          </a>
        </div>
      ) : null}

      <Modal open={waOpen} onClose={() => setWaOpen(false)} title={`WhatsApp — ${brideName}`}>
        <WhatsAppComposer
          audience="bride"
          leadId={leadId}
          bridePhone={phone}
          context={{ brideName, city: city ?? undefined }}
          templatePool={templatePool}
          allowCustomMessage
          onLogged={() => {
            onLogged?.();
            setWaOpen(false);
          }}
        />
      </Modal>
    </div>
  );
}
