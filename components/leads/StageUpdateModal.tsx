"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";
import { MUA_PUSH_STAGE_LABELS, type MuaPushStage } from "@/lib/types";

interface StageUpdateModalProps {
  muaName: string;
  currentStage: MuaPushStage;
  newStage: MuaPushStage;
  leadId?: string;
  muaId?: string;
  muaPhone?: string | null;
  muaWhatsapp?: string | null;
  bridePhone?: string | null;
  brideName?: string;
  leadCity?: string | null;
  onConfirm: (note: string, followUpDate: string | null) => Promise<boolean>;
  onClose: () => void;
}

export function StageUpdateModal({
  muaName,
  currentStage,
  newStage,
  leadId,
  muaId,
  muaPhone,
  muaWhatsapp,
  bridePhone,
  brideName,
  leadCity,
  onConfirm,
  onClose,
}: StageUpdateModalProps) {
  const [note, setNote] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [busy, setBusy] = useState(false);

  const noteOk = note.trim().length >= 10;
  const dateOk = followUpDate.trim().length > 0;

  async function handleSubmit() {
    if (!noteOk || !dateOk) return;
    setBusy(true);
    try {
      const ok = await onConfirm(note.trim(), followUpDate);
      if (ok) onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Update: ${muaName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={busy || !noteOk || !dateOk}
          >
            Update stage →
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-muted">
        {MUA_PUSH_STAGE_LABELS[currentStage]} → {MUA_PUSH_STAGE_LABELS[newStage]}
      </p>

      {leadId ? (
        <WhatsAppComposer
          dualAudience
          defaultAudience="mua"
          phone={muaPhone}
          whatsapp={muaWhatsapp}
          bridePhone={bridePhone}
          leadId={leadId}
          muaId={muaId}
          pushStage={newStage}
          context={{
            muaName,
            brideName: brideName ?? undefined,
            city: leadCity ?? undefined,
          }}
          templatePool="rmMua"
          allowCustomMessage
          className="mb-4"
        />
      ) : null}

      <label className="mb-4 block text-sm">
        <span className="mb-1 block font-medium text-text">What happened? *</span>
        <textarea
          className="min-h-[100px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="e.g. Bride loved her portfolio, asked for pricing on wedding + mehndi"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {note.length > 0 && note.length < 10 && (
          <span className="mt-1 text-xs text-red-600">Min 10 characters</span>
        )}
      </label>
      <Input
        label="Next follow-up date *"
        type="date"
        value={followUpDate}
        min={new Date().toISOString().slice(0, 10)}
        onChange={(e) => setFollowUpDate(e.target.value)}
      />
      <p className="mt-1 text-xs text-slate-muted">
        A follow-up task will be scheduled for this date when you update the stage
      </p>
    </Modal>
  );
}
