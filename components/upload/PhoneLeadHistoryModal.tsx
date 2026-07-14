"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PreviousLeadsForPhonePanel } from "@/components/upload/PreviousLeadsForPhonePanel";
import { COMM_ENTRY_LABELS } from "@/lib/lead-comms-export";
import { downloadLeadLogCsv } from "@/lib/download-lead-log";
import type { CommEntry } from "@/lib/types";

export function PhoneLeadHistoryModal({
  open,
  onClose,
  leadId,
  phone,
  brideName,
  displayId,
  excludeLeadId,
}: {
  open: boolean;
  onClose: () => void;
  leadId: string;
  phone: string;
  brideName: string;
  displayId: string;
  excludeLeadId: string;
}) {
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
      title={`History — ${title}`}
      wide
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={exporting || loading || !leadId}
            onClick={() => void exportLog()}
          >
            {exporting ? "Exporting…" : "Export log"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-slate-muted">
        {displayId} · {phone}
      </p>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-brand">Activity on this lead</h3>
        {loading ? (
          <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : comms.length === 0 ? (
          <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-muted">
            No activity recorded yet.
          </p>
        ) : (
          <div className="max-h-[min(20rem,45vh)] space-y-2 overflow-y-auto pr-1">
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
                <p className="whitespace-pre-wrap text-sm text-text">{c.description}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 space-y-2 border-t border-slate-200 pt-5">
        <h3 className="text-sm font-semibold text-brand">Other leads on this phone</h3>
        <p className="text-xs text-slate-muted">
          Earlier enquiry records on the same number, if any.
        </p>
        <PreviousLeadsForPhonePanel
          phone={phone}
          excludeLeadId={excludeLeadId}
          immediate
          hideWhenEmpty
        />
      </section>
    </Modal>
  );
}
