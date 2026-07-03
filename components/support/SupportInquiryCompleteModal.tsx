"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

type Props = {
  inquiryId: string;
  displayId: string;
  name: string;
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
  apiPath?: string;
  allowFollowUp?: boolean;
};

export function SupportInquiryCompleteModal({
  inquiryId,
  displayId,
  name,
  open,
  onClose,
  onCompleted,
  apiPath = `/api/my/support-inquiries/${inquiryId}`,
  allowFollowUp = true,
}: Props) {
  const { toast } = useToast();
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!summary.trim()) {
      toast("Notes are required", "error");
      return;
    }
    setLoading(true);
    try {
      const isAdminApi = apiPath.includes("/admin/");
      const res = await fetch(apiPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isAdminApi
            ? { action: "complete", summary, outcome: outcome || undefined, nextFollowUpAt: nextFollowUpAt || undefined }
            : { summary, outcome: outcome || undefined, nextFollowUpAt: nextFollowUpAt || undefined },
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Failed to complete", "error");
        return;
      }
      toast(nextFollowUpAt ? "Completed — follow-up scheduled" : "Completed");
      onCompleted();
      onClose();
      setSummary("");
      setOutcome("");
      setNextFollowUpAt("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Complete ${displayId}`}>
      <div className="space-y-4 p-1">
        <p className="text-sm text-slate-muted">{name}</p>
        <input
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="Outcome (reached, no answer, interested…)"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
        />
        <textarea
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          rows={4}
          placeholder="What you did, findings, and handoff notes (visible to admin)"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
        {allowFollowUp && (
          <Input
            label="Schedule follow-up (optional)"
            type="datetime-local"
            value={nextFollowUpAt}
            onChange={(e) => setNextFollowUpAt(e.target.value)}
          />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? "Saving…" : "Complete"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
