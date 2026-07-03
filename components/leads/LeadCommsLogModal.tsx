"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { COMM_ENTRY_LABELS } from "@/lib/lead-comms-export";
import { downloadLeadLogCsv } from "@/lib/download-lead-log";
import type { CommEntry } from "@/lib/types";

interface LeadCommsLogModalProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  brideName: string;
  displayId?: string;
}

export function LeadCommsLogModal({
  open,
  onClose,
  leadId,
  brideName,
  displayId,
}: LeadCommsLogModalProps) {
  const [comms, setComms] = useState<CommEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!leadId) return;
    setLoading(true);
    setError(null);
    void fetch(`/api/leads/${leadId}/comms?limit=100`)
      .then(async (r) => {
        const json = (await r.json()) as { data: CommEntry[] | null; error?: string | null };
        if (!r.ok) {
          setError(json.error ?? "Failed to load activity log");
          setComms([]);
          return;
        }
        setComms(json.data ?? []);
      })
      .catch(() => {
        setError("Failed to load activity log");
        setComms([]);
      })
      .finally(() => setLoading(false));
  }, [leadId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const exportLog = useCallback(async () => {
    setExporting(true);
    const err = await downloadLeadLogCsv(leadId);
    setExporting(false);
    if (err) setError(err);
  }, [leadId]);

  const title = displayId ? `${displayId} — ${brideName}` : brideName;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Activity log — ${title}`}
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={exporting || loading}
            onClick={() => void exportLog()}
          >
            {exporting ? "Exporting…" : "Export Lead Log"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : comms.length === 0 ? (
        <p className="text-sm text-slate-muted">No activity recorded yet.</p>
      ) : (
        <div className="max-h-[min(28rem,60vh)] space-y-2 overflow-y-auto pr-1">
          {comms.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge variant="muted">
                  {COMM_ENTRY_LABELS[c.entryType] ?? c.entryType}
                </Badge>
                <span className="text-xs text-slate-muted">
                  {new Date(c.createdAt).toLocaleString("en-IN")}
                </span>
                {c.actorName ? (
                  <span className="text-xs text-slate-muted">by {c.actorName}</span>
                ) : null}
              </div>
              <p className="text-sm text-text whitespace-pre-wrap">{c.description}</p>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
