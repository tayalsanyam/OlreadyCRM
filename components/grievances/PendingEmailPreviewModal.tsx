"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { ticketStatusLabel } from "@/lib/ticket-status";
import { TICKET_CATEGORY_LABELS } from "@/lib/ticket-categories";
import { pendingEmailPartyLabel } from "@/lib/pending-email-approvals-types";
import {
  ticketEmailThreadToken,
  ticketConcernLabel,
  ticketStableEmailSubject,
} from "@/lib/ticket-email-thread";
import { formatDate } from "@/lib/utils";

export type PendingEmailPreviewData = {
  emailId: string;
  ticketId: string;
  ticketNumber: string;
  subject: string;
  bodyHtml: string;
  toEmail: string;
  createdAt?: string;
  createdByName?: string | null;
  muaName?: string | null;
  brideName?: string | null;
  raisedByName?: string | null;
  raisedByType?: string;
  ticketStatus?: string;
  category?: string;
  complaintText?: string | null;
  attachmentCount?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  email: PendingEmailPreviewData | null;
  canReview?: boolean;
  onActionComplete?: () => void;
  onDraftSaved?: (patch: Pick<PendingEmailPreviewData, "subject" | "bodyHtml" | "toEmail">) => void;
};

function stripStableTail(ticketNumber: string, subject: string): string {
  const token = ticketEmailThreadToken(ticketNumber);
  const trimmed = subject.trim();
  if (!trimmed.startsWith(token)) return trimmed;
  return trimmed.slice(token.length).trim();
}

export function PendingEmailPreviewModal({
  open,
  onClose,
  email,
  canReview = true,
  onActionComplete,
  onDraftSaved,
}: Props) {
  const { toast } = useToast();
  const [revisionMode, setRevisionMode] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editTo, setEditTo] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!email) return;
    const concern = ticketConcernLabel({
      category: email.category,
    });
    const stable = ticketStableEmailSubject(email.ticketNumber, concern);
    setEditSubject(stripStableTail(email.ticketNumber, stable));
    setEditBody(email.bodyHtml);
    setEditTo(email.toEmail);
    setDirty(false);
    setRevisionMode(false);
    setRevisionNote("");
  }, [email]);

  const resetRevision = () => {
    setRevisionMode(false);
    setRevisionNote("");
  };

  const handleClose = () => {
    if (dirty && canReview) {
      const leave = window.confirm("You have unsaved edits. Close without saving?");
      if (!leave) return;
    }
    resetRevision();
    onClose();
  };

  const saveEdits = async (): Promise<boolean> => {
    if (!email) return false;
    if (!editBody.trim() || !editTo.trim()) {
      toast("Body and To are required", "error");
      return false;
    }

    setLoading(true);
    const stable = ticketStableEmailSubject(
      email.ticketNumber,
      ticketConcernLabel({ category: email.category })
    );
    const res = await fetch(`/api/crm/tickets/${email.ticketId}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_pending",
        emailId: email.emailId,
        subject: stable,
        bodyHtml: editBody.trim(),
        toEmail: editTo.trim(),
      }),
    });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      toast(json.error ?? "Could not save draft", "error");
      return false;
    }

    const saved = json.data?.updated as
      | { subject: string; bodyHtml: string; toEmail: string }
      | undefined;
    const subject = saved?.subject ?? ticketStableEmailSubject(
      email.ticketNumber,
      ticketConcernLabel({ category: email.category })
    );
    const bodyHtml = saved?.bodyHtml ?? editBody.trim();
    const toEmail = saved?.toEmail ?? editTo.trim();

    setEditSubject(stripStableTail(email.ticketNumber, subject));
    setEditBody(bodyHtml);
    setEditTo(toEmail);
    setDirty(false);
    toast("Draft saved");
    onDraftSaved?.({ subject, bodyHtml, toEmail });
    return true;
  };

  const approve = async () => {
    if (!email) return;
    if (dirty) {
      const saved = await saveEdits();
      if (!saved) return;
    }

    setLoading(true);
    const res = await fetch(`/api/crm/tickets/${email.ticketId}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", emailId: email.emailId }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast(json.error ?? "Approve failed", "error");
      return;
    }
    toast("Approved — care can send via Resend or Gmail");
    resetRevision();
    onClose();
    onActionComplete?.();
  };

  const requestRevision = async () => {
    if (!email || !revisionNote.trim()) {
      toast("Enter feedback for care", "error");
      return;
    }
    if (dirty) {
      const saved = await saveEdits();
      if (!saved) return;
    }

    setLoading(true);
    const res = await fetch(`/api/crm/tickets/${email.ticketId}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "request_revision",
        emailId: email.emailId,
        revisionNote: revisionNote.trim(),
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast(json.error ?? "Failed", "error");
      return;
    }
    toast("Revision requested — care agent notified");
    resetRevision();
    onClose();
    onActionComplete?.();
  };

  if (!email) return null;

  const ticketHref = `/care/grievances/${email.ticketId}`;
  const threadToken = ticketEmailThreadToken(email.ticketNumber);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Email preview — ${email.ticketNumber}`}
      wide
      footer={
        !canReview ? (
          <Link
            href={ticketHref}
            className="inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            View full ticket
          </Link>
        ) : revisionMode ? (
          <>
            <Button variant="secondary" onClick={resetRevision} disabled={loading}>
              Back
            </Button>
            <Button onClick={requestRevision} disabled={loading || !revisionNote.trim()}>
              {loading ? "Sending…" : "Send feedback to care"}
            </Button>
          </>
        ) : (
          <>
            <Link
              href={ticketHref}
              className="mr-auto inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              View full ticket
            </Link>
            <Button
              variant="secondary"
              onClick={() => void saveEdits()}
              disabled={loading || !dirty}
            >
              {loading ? "Saving…" : "Save changes"}
            </Button>
            <Button variant="secondary" onClick={() => setRevisionMode(true)} disabled={loading}>
              Request revision
            </Button>
            <Button onClick={() => void approve()} disabled={loading}>
              {loading ? "Approving…" : "Approve for care to send"}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="critical">Pending admin review</Badge>
          {dirty && canReview && <Badge variant="hot">Unsaved edits</Badge>}
          {email.ticketStatus && (
            <Badge variant="muted">{ticketStatusLabel(email.ticketStatus)}</Badge>
          )}
          {email.category && (
            <Badge variant="muted">
              {TICKET_CATEGORY_LABELS[email.category] ?? email.category}
            </Badge>
          )}
        </div>

        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase text-slate-muted">Ticket</dt>
            <dd className="font-medium">
              <Link href={ticketHref} className="text-accent hover:underline">
                {email.ticketNumber}
              </Link>
              <span className="text-slate-muted">
                {" "}
                ·{" "}
                {pendingEmailPartyLabel({
                  raisedByType: email.raisedByType ?? "mua",
                  raisedByName: email.raisedByName ?? null,
                  muaName: email.muaName ?? null,
                  brideName: email.brideName ?? null,
                })}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-slate-muted">Submitted</dt>
            <dd>
              {email.createdByName ?? "Care"}{" "}
              {email.createdAt ? `· ${formatDate(email.createdAt)}` : ""}
            </dd>
          </div>
        </dl>

        {email.complaintText && !revisionMode && (
          <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
            <p className="text-xs font-medium uppercase text-slate-muted">Complaint summary</p>
            <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-slate-700">
              {email.complaintText}
            </p>
            <Link href={ticketHref} className="mt-2 inline-block text-xs text-accent hover:underline">
              Read full ticket →
            </Link>
          </div>
        )}

        {revisionMode ? (
          <div className="space-y-2">
            <p className="font-medium text-amber-900">Revision feedback for care</p>
            <textarea
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={5}
              value={revisionNote}
              onChange={(e) => setRevisionNote(e.target.value)}
              placeholder="What should care change before resubmitting?"
              autoFocus
            />
          </div>
        ) : canReview ? (
          <div className="space-y-3">
            <Input
              label="To"
              value={editTo}
              onChange={(e) => {
                setEditTo(e.target.value);
                setDirty(true);
              }}
            />
            <div>
              <label className="mb-1 block text-sm font-medium">Subject (fixed for threading)</label>
              <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {ticketEmailThreadToken(email.ticketNumber)}{" "}
                {ticketConcernLabel({
                  category: email.category,
                })}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Email body</label>
              <textarea
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                rows={14}
                value={editBody}
                onChange={(e) => {
                  setEditBody(e.target.value);
                  setDirty(true);
                }}
              />
            </div>
            {email.attachmentCount ? (
              <p className="text-xs text-slate-muted">
                {email.attachmentCount} attachment{email.attachmentCount === 1 ? "" : "s"} on draft —
                manage on the full ticket before sending.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium uppercase text-slate-muted">To</p>
              <p>{email.toEmail}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-slate-muted">Subject</p>
              <p className="font-medium">{email.subject}</p>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase text-slate-muted">Email body</p>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
                <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800">
                  {email.bodyHtml}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
