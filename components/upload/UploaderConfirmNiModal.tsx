"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { LEAD_EXIT_LABELS, UPLOADER_CONFIRMATION_LABELS } from "@/lib/lead-exit";
import type { UploaderConfirmation } from "@/lib/types";

interface UploaderConfirmNiModalProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  brideName: string;
  handoverReason?: string | null;
  existingConfirmation?: UploaderConfirmation | null;
  onSaved: () => void;
}

export function UploaderConfirmNiModal({
  open,
  onClose,
  leadId,
  brideName,
  handoverReason,
  existingConfirmation,
  onSaved,
}: UploaderConfirmNiModalProps) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(action: "confirm_ni" | "flag_rm_error") {
    if (note.trim().length < 5) return;
    setSaving(true);
    const res = await fetch(`/api/upload/leads/${leadId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note: note.trim() }),
    });
    setSaving(false);
    if (res.ok) {
      onSaved();
      onClose();
      setNote("");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${LEAD_EXIT_LABELS.reviewAndConfirm} — ${brideName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            disabled={saving || note.trim().length < 5}
            onClick={() => void submit("flag_rm_error")}
          >
            {LEAD_EXIT_LABELS.flagRmError}
          </Button>
          <Button
            disabled={saving || note.trim().length < 5}
            onClick={() => void submit("confirm_ni")}
          >
            {LEAD_EXIT_LABELS.confirmNi}
          </Button>
        </>
      }
    >
      {handoverReason && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <span className="font-medium">RM / Commission handover:</span> {handoverReason}
        </p>
      )}
      {existingConfirmation && (
        <p className="mb-3 text-sm text-slate-muted">
          Previous: {UPLOADER_CONFIRMATION_LABELS[existingConfirmation]}
        </p>
      )}
      <p className="mb-3 text-sm text-slate-muted">
        Record why this lead is not interested, or flag if the RM/Commission agent was wrong.
        Use re-verify separately if the bride should re-enter the pipeline.
      </p>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Your note *</span>
        <textarea
          className="min-h-[100px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="Reason, call outcome, accountability note (min 5 characters)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
    </Modal>
  );
}
