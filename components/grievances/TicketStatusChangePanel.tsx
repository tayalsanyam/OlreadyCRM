"use client";

import { useEffect, useState } from "react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { WhatsAppComposer } from "@/components/whatsapp/WhatsAppComposer";
import { AdminStaffPicker } from "@/components/grievances/StaffPicker";
import {
  statusRequiresNextFollowUp,
  ticketStatusLabel,
  ticketStatusesForParty,
} from "@/lib/ticket-status";
import type { RaisedByType, TicketStatus } from "@/lib/types";
import { fromDbTicketStatus } from "@/lib/ticket-db-mappers";

type Props = {
  open: boolean;
  onClose: () => void;
  ticketId: string;
  currentStatus: TicketStatus | string;
  ticketNumber: string;
  assignedAdminId?: string | null;
  assignedAdminName?: string | null;
  muaName?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  city?: string | null;
  raisedByType?: RaisedByType | string;
  onDone: () => void;
};

export function TicketStatusChangePanel({
  open,
  onClose,
  ticketId,
  currentStatus,
  ticketNumber,
  assignedAdminId,
  assignedAdminName,
  muaName,
  phone,
  whatsapp,
  city,
  raisedByType = "mua",
  onDone,
}: Props) {
  const normalized =
    typeof currentStatus === "string" && currentStatus.includes("_")
      ? fromDbTicketStatus(currentStatus)
      : (currentStatus as TicketStatus);

  const [toStatus, setToStatus] = useState<TicketStatus>(normalized);
  const [note, setNote] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [loopInAdmin, setLoopInAdmin] = useState(false);
  const [adminId, setAdminId] = useState("");
  const [adminBrief, setAdminBrief] = useState("");
  const [adminDueAt, setAdminDueAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setToStatus(normalized);
    setNote("");
    setNextFollowUpAt("");
    setLoopInAdmin(false);
    setAdminId(assignedAdminId ?? "");
    setAdminBrief("");
    setAdminDueAt("");
    setError(null);
  }, [open, normalized, assignedAdminId]);

  const needsFollowUp = statusRequiresNextFollowUp(toStatus) && toStatus !== normalized;
  const statusChanging = toStatus !== normalized;

  const submitStatus = async () => {
    if (!statusChanging) {
      setError("Pick a new status, or use Loop in admin only");
      return;
    }
    if (needsFollowUp && !nextFollowUpAt) {
      setError("Next follow-up date is required for this status");
      return;
    }
    if (loopInAdmin && !adminId) {
      setError("Select an admin to loop in");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/tickets/${ticketId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: toStatus,
          note: note.trim() || undefined,
          nextFollowUpAt: nextFollowUpAt || undefined,
          loopInAdminId: loopInAdmin ? adminId : undefined,
          adminBrief: loopInAdmin ? adminBrief.trim() || undefined : undefined,
          adminDueAt: loopInAdmin ? adminDueAt || nextFollowUpAt || undefined : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Status update failed");
        return;
      }
      onDone();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const submitLoopInOnly = async () => {
    if (!adminId) {
      setError("Select an admin to loop in");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/tickets/${ticketId}/loop-in-admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminId,
          brief: adminBrief.trim() || undefined,
          dueAt: adminDueAt || nextFollowUpAt || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Loop-in failed");
        return;
      }
      onDone();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const statusOptions = ticketStatusesForParty(raisedByType)
    .filter((s) => s !== normalized)
    .map((s) => ({
      value: s,
      label: ticketStatusLabel(s, raisedByType),
    }));

  return (
    <SlideOver open={open} onClose={onClose} title={`Update status — ${ticketNumber}`} wide>
      <div className="space-y-4 p-4">
        <p className="text-sm text-slate-muted">
          Current: <span className="font-medium text-brand">{ticketStatusLabel(normalized, raisedByType)}</span>
          {assignedAdminName && (
            <span className="mt-1 block text-xs">
              Admin watching: <span className="font-medium text-brand">{assignedAdminName}</span>
            </span>
          )}
        </p>

        <Select
          label="Move to"
          value={toStatus}
          onChange={(e) => setToStatus(e.target.value as TicketStatus)}
          options={[
            { value: normalized, label: ticketStatusLabel(normalized, raisedByType) },
            ...statusOptions,
          ]}
        />

        <div>
          <label className="mb-1 block text-sm font-medium">Internal note</label>
          <textarea
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={3}
            placeholder="What changed, what was verified, next steps…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {needsFollowUp && (
          <Input
            label="Next follow-up (creates care task)"
            type="datetime-local"
            value={nextFollowUpAt}
            onChange={(e) => setNextFollowUpAt(e.target.value)}
          />
        )}

        <div className="rounded-lg border border-brand/20 bg-brand/5 p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-brand">Loop in admin</p>
              <p className="text-xs text-slate-muted">
                Like senior call on sales — admin tracks this ticket in parallel while care keeps the
                stage. Admin gets task + notifications until resolved.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={loopInAdmin}
                onChange={(e) => setLoopInAdmin(e.target.checked)}
              />
              Enable
            </label>
          </div>

          {(loopInAdmin || !statusChanging) && (
            <>
              <AdminStaffPicker
                enabled={open}
                value={adminId}
                onChange={setAdminId}
              />
              <div>
                <label className="mb-1 block text-sm font-medium">Brief for admin</label>
                <textarea
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  rows={2}
                  placeholder="Why admin input is needed, what to check…"
                  value={adminBrief}
                  onChange={(e) => setAdminBrief(e.target.value)}
                />
              </div>
              <Input
                label="Admin due by"
                type="datetime-local"
                value={adminDueAt}
                onChange={(e) => setAdminDueAt(e.target.value)}
              />
            </>
          )}
        </div>

        {(whatsapp || phone) && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-medium uppercase text-slate-muted">WhatsApp (optional)</p>
            <WhatsAppComposer
              audience="mua"
              phone={phone}
              whatsapp={whatsapp ?? phone}
              ticketId={ticketId}
              templatePool="care"
              allowCustomMessage
              context={{
                muaName: muaName ?? "there",
                city: city ?? undefined,
                ticketNumber,
              }}
              onLogged={() => {}}
            />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-col gap-2">
          <Button onClick={submitStatus} disabled={submitting || !statusChanging} className="w-full">
            {submitting ? "Updating…" : "Update status & schedule task"}
          </Button>
          <Button
            variant="secondary"
            onClick={submitLoopInOnly}
            disabled={submitting || !adminId}
            className="w-full"
          >
            {submitting ? "Saving…" : "Loop in admin only (keep current stage)"}
          </Button>
        </div>
      </div>
    </SlideOver>
  );
}
