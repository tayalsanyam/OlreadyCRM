"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { LEAD_EXIT_LABELS } from "@/lib/lead-exit";

interface ReactivateLeadModalProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  brideName: string;
  handoverReason?: string | null;
  /** Opens re-verification — does not push the lead straight into verified. */
  onConfirm: (note: string | null) => void;
}

export function ReactivateLeadModal({
  open,
  onClose,
  brideName,
  handoverReason,
  onConfirm,
}: ReactivateLeadModalProps) {
  const [note, setNote] = useState("");

  function submit() {
    onConfirm(note.trim() || null);
    onClose();
    setNote("");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${LEAD_EXIT_LABELS.reactivate} — ${brideName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>{LEAD_EXIT_LABELS.reactivate}</Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-muted">
        Confirm reopening this lead. You&apos;ll complete re-verification next — routing
        (portal, commission, or RM) is chosen there, not on this step.
      </p>
      {handoverReason && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <span className="font-medium">Previous closure:</span> {handoverReason}
        </p>
      )}
      <label className="block text-sm">
        <span className="text-slate-muted">Note (optional)</span>
        <textarea
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why is this lead being reopened?"
        />
      </label>
    </Modal>
  );
}
