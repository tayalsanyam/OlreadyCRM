"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EXIT_MARKED_BY_LABELS, LEAD_EXIT_LABELS, type ExitMarkedByRole } from "@/lib/lead-exit";

interface UploaderCloseLeadModalProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  brideName: string;
  exitNote?: string | null;
  exitMarkedByRole?: string | null;
  onSaved: () => void;
}

function exitMarkedByLabel(role: string | null | undefined): string | null {
  if (!role || !(role in EXIT_MARKED_BY_LABELS)) return null;
  return EXIT_MARKED_BY_LABELS[role as ExitMarkedByRole];
}

export function UploaderCloseLeadModal({
  open,
  onClose,
  leadId,
  brideName,
  exitNote,
  exitMarkedByRole,
  onSaved,
}: UploaderCloseLeadModalProps) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const markedBy = exitMarkedByLabel(exitMarkedByRole);

  async function submit() {
    if (note.trim().length < 5) return;
    setSaving(true);
    const res = await fetch(`/api/upload/leads/${leadId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "close_lead", note: note.trim() }),
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
      title={`${LEAD_EXIT_LABELS.closeLead} — ${brideName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving || note.trim().length < 5} onClick={() => void submit()}>
            {LEAD_EXIT_LABELS.closeLead}
          </Button>
        </>
      }
    >
      {exitNote ? (
        <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
          {markedBy ? (
            <span className="mb-1 block text-xs font-medium text-slate-muted">
              Marked by {markedBy}
            </span>
          ) : null}
          {exitNote}
        </p>
      ) : null}
      <p className="mb-3 text-sm text-slate-muted">
        Confirm this lead is closed and will not continue with Olready. Use re-verify if the
        bride should be active again.
      </p>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Closing note *</span>
        <textarea
          className="min-h-[100px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="Why this lead is closed (min 5 characters)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
    </Modal>
  );
}
