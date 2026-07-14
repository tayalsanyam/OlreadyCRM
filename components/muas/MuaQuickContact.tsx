"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";
import type { PipelineStage, MuaPushStage } from "@/lib/types";
import type { WhatsAppTemplatePool } from "@/lib/whatsapp/templates";

export function MuaQuickContact({
  muaId,
  muaName,
  muaPhone,
  muaWhatsapp,
  muaCity,
  pipelineId,
  pipelineStage,
  leadId,
  pushStage,
  brideName,
  leadCity,
  templatePool,
  layout = "inline",
  variant = "compact",
  onLogged,
}: {
  muaId: string;
  muaName: string;
  muaPhone?: string | null;
  muaWhatsapp?: string | null;
  muaCity?: string | null;
  pipelineId?: string | null;
  pipelineStage?: PipelineStage | null;
  leadId?: string | null;
  pushStage?: MuaPushStage | null;
  brideName?: string | null;
  leadCity?: string | null;
  templatePool?: WhatsAppTemplatePool;
  layout?: "inline" | "stacked";
  variant?: "default" | "compact";
  onLogged?: () => void;
}) {
  const [callOpen, setCallOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const dialPhone = muaPhone?.trim() || muaWhatsapp?.trim() || "";
  const hasPhone = Boolean(dialPhone);
  const hasWa = Boolean((muaWhatsapp || muaPhone)?.trim());
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
      disabled={!hasWa}
      onClick={() => setWaOpen(true)}
      className="text-xs font-medium text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
    >
      WhatsApp
    </button>
  ) : (
    <Button size="sm" variant="secondary" disabled={!hasWa} onClick={() => setWaOpen(true)}>
      WhatsApp
    </Button>
  );

  return (
    <div
      className={
        layout === "stacked"
          ? "relative mt-1 space-y-1"
          : compact
            ? "relative mt-0.5 inline-flex flex-wrap items-center gap-1.5"
            : "relative mt-1 flex flex-wrap items-center gap-1"
      }
      onClick={(e) => e.stopPropagation()}
    >
      {hasPhone || hasWa ? (
        <>
          {callControl}
          {compact ? <span className="text-xs text-slate-300">·</span> : null}
          {waControl}
        </>
      ) : (
        <span className="text-xs text-slate-muted">No phone</span>
      )}
      {callOpen && hasPhone ? (
        <div
          className={
            compact
              ? "absolute left-0 top-full z-10 mt-1 flex items-center gap-2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1.5 shadow-md"
              : "flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5"
          }
        >
          <a href={`tel:${dialPhone}`} className="text-sm font-medium text-accent hover:underline">
            {dialPhone}
          </a>
          <span className="text-slate-300">|</span>
          <a href={`tel:${dialPhone}`} className="text-xs font-medium text-brand hover:underline">
            Dial
          </a>
        </div>
      ) : null}

      <Modal open={waOpen} onClose={() => setWaOpen(false)} title={`WhatsApp — ${muaName}`}>
        <WhatsAppComposer
          audience="mua"
          muaId={muaId}
          leadId={leadId ?? undefined}
          pipelineId={pipelineId ?? undefined}
          pipelineStage={pipelineStage ?? undefined}
          pushStage={pushStage ?? undefined}
          phone={muaPhone}
          whatsapp={muaWhatsapp}
          context={{
            muaName,
            brideName: brideName ?? undefined,
            city: leadCity ?? muaCity ?? undefined,
          }}
          templatePool={templatePool ?? "sales"}
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
