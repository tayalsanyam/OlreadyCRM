"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";
import type { PipelineStage } from "@/lib/types";

export function PipelineQuickContact({
  pipelineId,
  muaName,
  muaPhone,
  muaWhatsapp,
  muaCity,
  stage,
  layout = "inline",
  variant = "default",
  onLogged,
}: {
  pipelineId: string;
  muaName: string;
  muaPhone?: string | null;
  muaWhatsapp?: string | null;
  muaCity?: string | null;
  stage: PipelineStage;
  layout?: "inline" | "stacked";
  variant?: "default" | "compact";
  onLogged?: () => void;
}) {
  const [callOpen, setCallOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const hasPhone = Boolean(muaPhone?.trim());
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
          ? "relative space-y-1"
          : compact
            ? "relative inline-flex flex-wrap items-center gap-1.5"
            : "relative flex flex-wrap items-center gap-1"
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
          <a href={`tel:${muaPhone}`} className="text-sm font-medium text-accent hover:underline">
            {muaPhone}
          </a>
          <span className="text-slate-300">|</span>
          <a href={`tel:${muaPhone}`} className="text-xs font-medium text-brand hover:underline">
            Dial
          </a>
        </div>
      ) : null}

      <Modal open={waOpen} onClose={() => setWaOpen(false)} title={`WhatsApp — ${muaName}`}>
        <WhatsAppComposer
          audience="mua"
          pipelineId={pipelineId}
          pipelineStage={stage}
          phone={muaPhone}
          whatsapp={muaWhatsapp}
          context={{ muaName, city: muaCity ?? undefined }}
          templatePool="sales"
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
