"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  OPS_TASK_END_RATE_LABELS,
  type OpsTaskEndRate,
} from "@/lib/ops-task";
import { OPS_TASK_ATTACHMENT_ACCEPT } from "@/lib/ops-task-attachments";
import { uploadOpsTaskAttachments } from "@/components/ops/OpsTaskAttachmentsPanel";

type Props = {
  taskId: string;
  displayId: string;
  title: string;
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
  apiPath?: string;
  allowAttachments?: boolean;
};

const END_RATE_OPTIONS = (Object.entries(OPS_TASK_END_RATE_LABELS) as [OpsTaskEndRate, string][]).map(
  ([value, label]) => ({ value, label }),
);

export function OpsTaskCompleteModal({
  taskId,
  displayId,
  title,
  open,
  onClose,
  onCompleted,
  apiPath = `/api/my/ops-tasks/${taskId}`,
  allowAttachments = true,
}: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");
  const [endRate, setEndRate] = useState<OpsTaskEndRate>("resolved");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSummary("");
    setOutcome("");
    setEndRate("resolved");
    setNextFollowUpAt("");
    setPendingFiles([]);
  }, [open, taskId]);

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!summary.trim()) {
      toast("Completion notes are required", "error");
      return;
    }
    setLoading(true);
    try {
      if (allowAttachments && pendingFiles.length) {
        const uploadResult = await uploadOpsTaskAttachments(taskId, pendingFiles);
        if (!uploadResult.ok) {
          toast(uploadResult.error ?? "Could not attach files", "error");
          return;
        }
      }

      const isAdminApi = apiPath.includes("/admin/");
      const res = await fetch(apiPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isAdminApi
            ? {
                action: "complete",
                summary,
                outcome: outcome || undefined,
                endRate,
                nextFollowUpAt: nextFollowUpAt || undefined,
              }
            : { summary, outcome: outcome || undefined, endRate, nextFollowUpAt: nextFollowUpAt || undefined },
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
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Complete ${displayId}`} wide>
      <div className="space-y-4 p-1">
        <p className="text-sm text-slate-muted">{title}</p>
        <Select
          label="End result"
          value={endRate}
          onChange={(e) => setEndRate(e.target.value as OpsTaskEndRate)}
          options={END_RATE_OPTIONS}
        />
        <Input
          label="Short outcome (optional)"
          placeholder="Reached, agreed, needs escalation…"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
        />
        <div>
          <label className="mb-1 block text-sm font-medium">Completion notes *</label>
          <textarea
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={4}
            placeholder="Detailed notes — visible to the person who assigned this"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>

        {allowAttachments && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-brand">Attachments (optional)</p>
                <p className="text-xs text-slate-muted">
                  PDF, images, Word, Excel, or text — up to 10 MB each
                </p>
              </div>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                multiple
                accept={OPS_TASK_ATTACHMENT_ACCEPT}
                onChange={(e) => {
                  const list = e.target.files ? [...e.target.files] : [];
                  if (list.length) setPendingFiles((prev) => [...prev, ...list]);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => fileRef.current?.click()}
              >
                Choose files
              </Button>
            </div>
            {pendingFiles.length > 0 ? (
              <ul className="space-y-1">
                {pendingFiles.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 text-sm"
                  >
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      className="shrink-0 text-xs text-red-600 hover:underline"
                      onClick={() => removeFile(i)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-muted">No files selected yet.</p>
            )}
          </div>
        )}

        <Input
          label="Schedule follow-up (optional)"
          type="datetime-local"
          value={nextFollowUpAt}
          onChange={(e) => setNextFollowUpAt(e.target.value)}
        />

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? "Saving…" : "Complete task"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
