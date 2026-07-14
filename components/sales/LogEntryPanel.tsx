"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";
import type { PipelineStage } from "@/lib/types";

type Kind = "callLogged" | "emailLogged" | "noteAdded";

const CALL_OUTCOMES = ["Answered", "No Answer", "Voicemail", "Callback Requested"] as const;

export function LogEntryPanel({
  pipelineId,
  onSaved,
  whatsApp,
}: {
  pipelineId: string;
  onSaved: () => void;
  whatsApp?: {
    pipelineStage?: PipelineStage | null;
    muaName?: string | null;
    muaPhone?: string | null;
    muaWhatsapp?: string | null;
    muaCity?: string | null;
  };
}) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [durationMins, setDurationMins] = useState("");
  const [outcome, setOutcome] = useState("");
  const [subject, setSubject] = useState("");
  const noteTooShort = kind === "noteAdded" && description.trim().length > 0 && description.trim().length < 10;

  async function save() {
    if (!kind) return;
    const metadata: Record<string, unknown> = {};
    if (occurredAt) metadata.occurredAt = occurredAt;

    let finalDescription = description.trim();
    if (kind === "callLogged") {
      if (!occurredAt || !outcome) return;
      metadata.durationMins = Number(durationMins) || 0;
      metadata.durationSec = (Number(durationMins) || 0) * 60;
      metadata.outcome = outcome;
      metadata.direction = "outbound";
      if (!finalDescription) finalDescription = `Call — ${outcome}`;
    }
    if (kind === "emailLogged") {
      if (!occurredAt || !subject.trim() || !finalDescription) return;
      metadata.subject = subject.trim();
      metadata.direction = "outbound";
    }
    if (kind === "noteAdded" && (!finalDescription || finalDescription.length < 10)) return;

    const res = await fetch(`/api/sales/pipeline/${pipelineId}/comms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryType: kind, description: finalDescription, metadata }),
    });
    if (!res.ok) return;
    setKind(null);
    setDescription("");
    setOccurredAt("");
    setDurationMins("");
    setOutcome("");
    setSubject("");
    onSaved();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setKind("callLogged")}>Log Call</Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowWhatsApp((v) => !v)}
        >
          {showWhatsApp ? "Hide WhatsApp" : "WhatsApp"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setKind("emailLogged")}>Log Email</Button>
        <Button size="sm" variant="secondary" onClick={() => setKind("noteAdded")}>Add Note</Button>
      </div>

      {showWhatsApp ? (
        <WhatsAppComposer
          pipelineId={pipelineId}
          pipelineStage={whatsApp?.pipelineStage}
          phone={whatsApp?.muaPhone}
          whatsapp={whatsApp?.muaWhatsapp}
          context={{
            muaName: whatsApp?.muaName ?? undefined,
            city: whatsApp?.muaCity ?? undefined,
          }}
          templatePool="sales"
          allowCustomMessage
          onLogged={onSaved}
        />
      ) : null}

      <Modal
        open={Boolean(kind)}
        onClose={() => setKind(null)}
        title={kind === "callLogged" ? "Log Call" : kind === "emailLogged" ? "Log Email" : "Add Note"}
        footer={<><Button variant="secondary" onClick={() => setKind(null)}>Cancel</Button><Button disabled={noteTooShort} onClick={save}>Save</Button></>}
      >
        <div className="space-y-3">
          {kind !== "noteAdded" ? (
            <Input label="Date & time *" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          ) : null}

          {kind === "callLogged" ? (
            <>
              <Input label="Duration (minutes)" type="number" value={durationMins} onChange={(e) => setDurationMins(e.target.value)} />
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-text">Outcome *</span>
                <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                  <option value="">Select</option>
                  {CALL_OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
              <Input label="Notes" value={description} onChange={(e) => setDescription(e.target.value)} />
            </>
          ) : null}

          {kind === "emailLogged" ? (
            <>
              <Input label="Subject *" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-text">Brief summary *</span>
                <textarea className="min-h-[80px] rounded-lg border border-slate-200 px-3 py-2 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
              </label>
            </>
          ) : null}

          {kind === "noteAdded" ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-text">Note *</span>
              <textarea className="min-h-[96px] rounded-lg border border-slate-200 px-3 py-2 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
              {noteTooShort ? <span className="text-xs text-danger">Note must be at least 10 characters.</span> : null}
            </label>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
