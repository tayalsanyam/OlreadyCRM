"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import type {
  FeedbackConnectionStatus,
  FeedbackMuaType,
} from "@/lib/types";

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  brideName: string;
  onSubmitted: () => void;
}

export function FeedbackModal({
  open,
  onClose,
  leadId,
  brideName,
  onSubmitted,
}: FeedbackModalProps) {
  const [muaType, setMuaType] = useState<FeedbackMuaType>("olready");
  const [nonOlreadyName, setNonOlreadyName] = useState("");
  const [valuableOptions, setValuableOptions] = useState<"" | "yes" | "no">("");
  const [referencesNote, setReferencesNote] = useState("");
  const [improvementsNote, setImprovementsNote] = useState("");
  const [connectionStatus, setConnectionStatus] =
    useState<FeedbackConnectionStatus>("connected");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (muaType === "non_olready" && !nonOlreadyName.trim()) {
      setError("Enter the MUA name");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/leads/${leadId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        muaType,
        nonOlreadyMuaName: muaType === "non_olready" ? nonOlreadyName.trim() : null,
        valuableOptions:
          valuableOptions === "" ? null : valuableOptions === "yes",
        referencesNote: referencesNote.trim() || null,
        improvementsNote: improvementsNote.trim() || null,
        connectionStatus,
      }),
    });
    const json = (await res.json()) as { error?: string | null };
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Could not save feedback");
      return;
    }
    onSubmitted();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Post-event feedback"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Later
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            {busy ? "Saving…" : "Submit feedback"}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-muted">
        All ceremonies for <strong>{brideName}</strong> are in the past. Share how
        the bride experience went.
      </p>
      <Select
        label="Who did she book with?"
        value={muaType}
        onChange={(e) => setMuaType(e.target.value as FeedbackMuaType)}
        options={[
          { value: "olready", label: "Olready MUA" },
          { value: "non_olready", label: "Non-Olready MUA" },
        ]}
        className="mb-4"
      />
      {muaType === "non_olready" && (
        <Input
          label="MUA name"
          value={nonOlreadyName}
          onChange={(e) => setNonOlreadyName(e.target.value)}
          className="mb-4"
        />
      )}
      <Select
        label="Connection status"
        value={connectionStatus}
        onChange={(e) =>
          setConnectionStatus(e.target.value as FeedbackConnectionStatus)
        }
        options={[
          { value: "connected", label: "Connected" },
          { value: "not_answered", label: "Did not answer" },
          { value: "not_interested", label: "Not interested" },
        ]}
        className="mb-4"
      />
      <Select
        label="Were Olready options valuable?"
        value={valuableOptions}
        onChange={(e) => setValuableOptions(e.target.value as "" | "yes" | "no")}
        options={[
          { value: "", label: "—" },
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ]}
        className="mb-4"
      />
      <Input
        label="References / referrals"
        value={referencesNote}
        onChange={(e) => setReferencesNote(e.target.value)}
        className="mb-4"
      />
      <Input
        label="What could we improve?"
        value={improvementsNote}
        onChange={(e) => setImprovementsNote(e.target.value)}
      />
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </Modal>
  );
}
