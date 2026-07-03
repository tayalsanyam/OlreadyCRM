"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { LEAD_EXIT_LABELS } from "@/lib/lead-exit";

interface UploaderNotAnsweringCloseModalProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  brideName: string;
  notAnsweringNote?: string | null;
  onSaved: () => void;
}

export function UploaderNotAnsweringCloseModal({
  open,
  onClose,
  leadId,
  brideName,
  notAnsweringNote,
  onSaved,
}: UploaderNotAnsweringCloseModalProps) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(action: "move_to_not_interested" | "move_to_archived") {
    setSaving(true);
    const res = await fetch(`/api/upload/leads/${leadId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note: note.trim() || null }),
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
      title={`${LEAD_EXIT_LABELS.reviewAndRoute} — ${brideName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() => void submit("move_to_archived")}
          >
            {LEAD_EXIT_LABELS.moveToArchived}
          </Button>
          <Button disabled={saving} onClick={() => void submit("move_to_not_interested")}>
            {LEAD_EXIT_LABELS.moveToNotInterested}
          </Button>
        </>
      }
    >
      {notAnsweringNote && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <span className="font-medium">{LEAD_EXIT_LABELS.notAnswering} note:</span>{" "}
          {notAnsweringNote}
        </p>
      )}
      <p className="mb-3 text-sm text-slate-muted">
        After your call, close this lead as not interested in services, or archive without
        that handover. Use re-verify if the bride is reachable and should continue.
      </p>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Optional note</span>
        <textarea
          className="min-h-[80px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="Call outcome, next steps"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
    </Modal>
  );
}
