"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface UploaderNoteModalProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  brideName: string;
  onSaved: () => void;
}

export function UploaderNoteModal({
  open,
  onClose,
  leadId,
  brideName,
  onSaved,
}: UploaderNoteModalProps) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (note.trim().length < 10) {
      setError("Note must be at least 10 characters");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/upload/leads/${leadId}/note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note.trim() }),
    });
    const json = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Could not save note");
      return;
    }
    setNote("");
    onSaved();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Add note — ${brideName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            {busy ? "Saving…" : "Save note"}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-muted">
        Log context on why the lead was marked not interested, or updates from a
        follow-up call. Visible in the lead activity timeline.
      </p>
      <textarea
        className="min-h-[120px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        placeholder="e.g. Bride said budget too high; may revisit in 2 months…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Modal>
  );
}
