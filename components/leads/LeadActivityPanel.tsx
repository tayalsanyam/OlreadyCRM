"use client";

import { useState } from "react";
import { AddCeremonyModal } from "@/components/leads/AddCeremonyModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import type { AddCeremonyLeadDefaults } from "@/components/leads/AddCeremonyModal";
import type { LeadEvent } from "@/lib/types";

interface LeadActivityPanelProps {
  leadId: string;
  events: LeadEvent[];
  eventDate: string;
  leadDefaults: AddCeremonyLeadDefaults;
  onUpdated: () => void;
}

export function LeadActivityPanel({
  leadId,
  events,
  leadDefaults,
  onUpdated,
}: LeadActivityPanelProps) {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [addCeremonyOpen, setAddCeremonyOpen] = useState(false);

  async function addNote() {
    if (!note.trim()) {
      toast("Enter a note");
      return;
    }
    const res = await fetch(`/api/leads/${leadId}/comms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", description: note }),
    });
    if (res.ok) {
      toast("Note saved");
      setNote("");
      onUpdated();
    } else {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      toast(err.error ?? "Could not save note");
    }
  }

  return (
    <>
      <Card className="space-y-4">
        <h2 className="font-semibold text-brand">Notes &amp; ceremonies</h2>
        <p className="text-xs text-slate-muted">
          Calls and WhatsApp are tracked on Callyzer — use this for internal notes only.
        </p>
        <Input
          label="Note"
          placeholder="Internal note for this lead"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => void addNote()}>
            Save note
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setAddCeremonyOpen(true)}>
            Add ceremony
          </Button>
        </div>
      </Card>

      <AddCeremonyModal
        open={addCeremonyOpen}
        onClose={() => setAddCeremonyOpen(false)}
        leadId={leadId}
        leadDefaults={leadDefaults}
        existingEvents={events}
        onAdded={onUpdated}
      />
    </>
  );
}
