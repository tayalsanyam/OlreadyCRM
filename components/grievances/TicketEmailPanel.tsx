"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import {
  appendCommunicationLog,
  formatCallyzerAppendEntry,
  formatCommunicationAppendEntry,
  splitEmailBodyCoreAndAppendix,
} from "@/lib/ticket-email-content";
import { filterEmailTemplatesForTicket } from "@/lib/ticket-email-template-filter";
import type { TicketCommunicationRow } from "@/lib/ticket-communications";
import {
  MAX_EMAIL_ATTACHMENTS,
  TICKET_ATTACHMENT_ACCEPT,
} from "@/lib/ticket-attachments";
import { formatDate } from "@/lib/utils";
import {
  PendingEmailPreviewModal,
  type PendingEmailPreviewData,
} from "@/components/grievances/PendingEmailPreviewModal";

type Template = {
  id: string;
  name: string;
  category: string | null;
  approvalTier: number;
  requiresAdminApproval: boolean;
};

type EmailRow = {
  id: string;
  subject: string;
  bodyHtml?: string;
  toEmail: string;
  status: string;
  approvalTier: number;
  sentAt: string | null;
  createdAt: string;
  adminRevisionNote?: string | null;
  attachmentIds?: string[];
  sendChannel?: string | null;
};

type DeliveryMethod = "resend" | "gmail";

type TicketAttachment = {
  id: string;
  fileName: string;
  filePath: string;
  mimeType: string | null;
  attachmentCategory: string;
  visibility: string;
  createdAt: string;
};

type Props = {
  ticketId: string;
  ticketNumber?: string | null;
  ticketCategory?: string | null;
  raisedByType?: string | null;
  ticketStatus?: string | null;
  complaintText?: string | null;
  muaName?: string | null;
  brideName?: string | null;
  raisedByName?: string | null;
  defaultToEmail?: string | null;
  isAdmin?: boolean;
  suggestedDraft?: { subject: string; body: string } | null;
  onDraftApplied?: () => void;
  onWorkflowChange?: () => void;
};

export function TicketEmailPanel({
  ticketId,
  ticketNumber: ticketNumberProp,
  ticketCategory,
  raisedByType = "mua",
  ticketStatus,
  complaintText,
  muaName,
  brideName,
  raisedByName,
  defaultToEmail,
  isAdmin,
  suggestedDraft,
  onDraftApplied,
  onWorkflowChange,
}: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [ticketAttachments, setTicketAttachments] = useState<TicketAttachment[]>([]);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [toEmail, setToEmail] = useState(defaultToEmail ?? "");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [revisionEmailId, setRevisionEmailId] = useState<string | null>(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("gmail");
  const [ticketNumber, setTicketNumber] = useState<string | null>(ticketNumberProp ?? null);
  const [stableSubject, setStableSubject] = useState("");
  const [composerEmailId, setComposerEmailId] = useState<string | null>(null);
  const [previewEmail, setPreviewEmail] = useState<PendingEmailPreviewData | null>(null);
  const [commPickerOpen, setCommPickerOpen] = useState(false);
  const [commRows, setCommRows] = useState<TicketCommunicationRow[]>([]);
  const [callyzerCalls, setCallyzerCalls] = useState<
    {
      id: string;
      calledAt: string;
      direction: string | null;
      durationSec: number | null;
      outcome: string | null;
      staffName: string | null;
    }[]
  >([]);
  const [selectedCommKeys, setSelectedCommKeys] = useState<string[]>([]);
  const [commLoading, setCommLoading] = useState(false);

  const resetComposerSource = () => setComposerEmailId(null);

  const composerPayloadFor = (emailId: string) => {
    if (composerEmailId !== emailId) return {};
    return {
      bodyHtml,
      toEmail,
      attachmentIds: selectedAttachmentIds,
    };
  };

  const gmailComposeToasts = (compose: {
    hasAttachments?: boolean;
    appendixOmitted?: boolean;
  }) => {
    if (compose.appendixOmitted) {
      toast(
        "Gmail opened with the main message — copy the communication log from the composer and paste it before sending",
        "error"
      );
    } else if (compose.hasAttachments) {
      toast("Gmail opened — attach files from this ticket manually before sending", "error");
    } else {
      toast("Gmail opened — send from care@, then mark as sent here");
    }
  };

  useEffect(() => {
    if (ticketNumberProp) setTicketNumber(ticketNumberProp);
  }, [ticketNumberProp]);

  const openPreview = (e: EmailRow) => {
    if (!ticketNumber) return;
    setPreviewEmail({
      emailId: e.id,
      ticketId,
      ticketNumber,
      subject: e.subject,
      bodyHtml: e.bodyHtml ?? "",
      toEmail: e.toEmail,
      createdAt: e.createdAt,
      muaName,
      brideName,
      raisedByName,
      ticketStatus: ticketStatus ?? undefined,
      category: ticketCategory ?? undefined,
      complaintText,
      attachmentCount: e.attachmentIds?.length ?? 0,
    });
  };

  const handlePreviewActionComplete = () => {
    setPreviewEmail(null);
    onWorkflowChange?.();
    load();
  };

  const visibleTemplates = useMemo(
    () =>
      filterEmailTemplatesForTicket(templates, {
        raisedByType,
        ticketCategory,
      }),
    [templates, raisedByType, ticketCategory]
  );

  const load = useCallback(async () => {
    try {
      const [emailRes, attachRes] = await Promise.all([
        fetch(`/api/crm/tickets/${ticketId}/email`),
        fetch(`/api/crm/tickets/${ticketId}/attachments`),
      ]);
      const emailJson = await emailRes.json();
      const attachJson = await attachRes.json();

      if (!emailRes.ok || emailJson.error) {
        toast(emailJson.error ?? "Could not load email templates", "error");
      } else {
        setTemplates(emailJson.data?.templates ?? []);
        setEmails(emailJson.data?.emails ?? []);
        setTicketNumber(emailJson.data?.ticketNumber ?? null);
        setStableSubject(emailJson.data?.stableSubject ?? "");
      }

      if (attachRes.ok) {
        setTicketAttachments(attachJson.data ?? []);
      }
    } catch {
      toast("Could not load email data", "error");
    }
  }, [ticketId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (defaultToEmail) setToEmail(defaultToEmail);
  }, [defaultToEmail]);

  useEffect(() => {
    if (stableSubject) setSubject(stableSubject);
  }, [stableSubject]);

  useEffect(() => {
    if (!suggestedDraft) return;
    setBodyHtml(suggestedDraft.body);
    resetComposerSource();
    onDraftApplied?.();
  }, [suggestedDraft, onDraftApplied]);

  const runAiSuggest = async () => {
    setLoading(true);
    const res = await fetch(`/api/crm/tickets/${ticketId}/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "response_draft" }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast(json.error ?? "AI suggest failed", "error");
      return;
    }
    if (json.data?.emailDraft) {
      setBodyHtml(json.data.emailDraft.body);
      resetComposerSource();
      toast("AI draft loaded — review before submitting");
    } else {
      toast("AI output in activity log — copy manually if needed");
    }
  };

  const toggleAttachment = (attachmentId: string) => {
    setSelectedAttachmentIds((prev) => {
      if (prev.includes(attachmentId)) return prev.filter((id) => id !== attachmentId);
      if (prev.length >= MAX_EMAIL_ATTACHMENTS) {
        toast(`Maximum ${MAX_EMAIL_ATTACHMENTS} attachments per email`, "error");
        return prev;
      }
      return [...prev, attachmentId];
    });
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    const remaining = MAX_EMAIL_ATTACHMENTS - selectedAttachmentIds.length;
    if (remaining <= 0) {
      toast(`Maximum ${MAX_EMAIL_ATTACHMENTS} attachments per email`, "error");
      return;
    }
    setUploading(true);
    const newIds: string[] = [];
    for (const file of list.slice(0, remaining)) {
      const form = new FormData();
      form.append("file", file);
      form.append("category", "email_attachment");
      form.append("visibility", "shared");
      const res = await fetch(`/api/crm/tickets/${ticketId}/attachments`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? `Failed to upload ${file.name}`, "error");
        continue;
      }
      if (json.data?.id) {
        newIds.push(json.data.id as string);
        setTicketAttachments((prev) => [json.data as TicketAttachment, ...prev]);
      }
    }
    setUploading(false);
    if (newIds.length) {
      setSelectedAttachmentIds((prev) => [...prev, ...newIds].slice(0, MAX_EMAIL_ATTACHMENTS));
    }
  };

  const applyTemplate = async () => {
    if (!templateId) return;
    setLoading(true);
    const res = await fetch(`/api/crm/tickets/${ticketId}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "preview", templateId, toEmail }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast(json.error ?? "Failed to load template", "error");
      return;
    }
    const p = json.data?.preview;
    if (p) {
      setBodyHtml(p.bodyHtml);
      if (p.toEmail) setToEmail(p.toEmail);
      resetComposerSource();
    }
  };

  const openGmailCompose = async (emailId: string) => {
    const res = await fetch(`/api/crm/tickets/${ticketId}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "gmail_compose",
        emailId,
        ...composerPayloadFor(emailId),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast(json.error ?? "Could not open Gmail", "error");
      return null;
    }
    const compose = json.data?.gmailCompose;
    if (!compose?.url) {
      toast("Gmail compose link missing", "error");
      return null;
    }
    window.open(compose.url, "_blank", "noopener,noreferrer");
    gmailComposeToasts(compose);
    return compose.emailId as string;
  };

  const loadCommOptions = async () => {
    setCommLoading(true);
    try {
      const [commRes, callRes] = await Promise.all([
        fetch(`/api/crm/tickets/${ticketId}/communications`),
        fetch(`/api/crm/tickets/${ticketId}/callyzer-calls`),
      ]);
      const commJson = await commRes.json();
      const callJson = await callRes.json();
      if (commRes.ok) setCommRows(commJson.data?.communications ?? []);
      if (callRes.ok) setCallyzerCalls(callJson.data?.calls ?? []);
    } finally {
      setCommLoading(false);
    }
  };

  const toggleCommKey = (key: string) => {
    setSelectedCommKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const appendSelectedCommunications = () => {
    const entries = selectedCommKeys
      .map((key) => {
        if (key.startsWith("comm:")) {
          const id = key.slice(5);
          const row = commRows.find((r) => r.id === id);
          return row ? formatCommunicationAppendEntry(row) : null;
        }
        if (key.startsWith("call:")) {
          const id = key.slice(5);
          const call = callyzerCalls.find((c) => c.id === id);
          return call ? formatCallyzerAppendEntry(call) : null;
        }
        return null;
      })
      .filter((e): e is { label: string; text: string } => Boolean(e));

    if (!entries.length) {
      toast("Select at least one item to include", "error");
      return;
    }
    setBodyHtml((prev) => {
      const next = appendCommunicationLog(prev, entries);
      if (!composerEmailId) {
        const approved = emails.find((e) => e.status === "approved");
        if (approved?.bodyHtml) {
          const { core: composerCore } = splitEmailBodyCoreAndAppendix(prev);
          const { core: approvedCore } = splitEmailBodyCoreAndAppendix(approved.bodyHtml);
          if (composerCore.trim() === approvedCore.trim()) {
            setComposerEmailId(approved.id);
          }
        }
      }
      return next;
    });
    toast("Communication log appended (does not require re-approval)");
  };

  const submitForApprovalOrSend = async () => {
    if (!toEmail.trim() || !subject.trim() || !bodyHtml.trim()) {
      toast("To, subject, and body are required", "error");
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/crm/tickets/${ticketId}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send",
        emailId: composerEmailId ?? undefined,
        toEmail,
        subject: stableSubject || subject,
        bodyHtml,
        templateId: templateId || undefined,
        attachmentIds: selectedAttachmentIds,
        deliveryMethod,
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast(json.error ?? "Send failed", "error");
      return;
    }
    if (json.data?.pending) {
      toast("Submitted for admin review — send via Resend or Gmail after approval");
      resetComposerSource();
      onWorkflowChange?.();
    } else if (json.data?.sentViaResend) {
      toast("Email sent via Resend and added to the conversation thread");
      setSelectedAttachmentIds([]);
      resetComposerSource();
      onWorkflowChange?.();
    } else if (json.data?.gmailCompose?.url) {
      window.open(json.data.gmailCompose.url, "_blank", "noopener,noreferrer");
      gmailComposeToasts(json.data.gmailCompose);
      resetComposerSource();
      onWorkflowChange?.();
    } else {
      toast("Unexpected response", "error");
    }
    load();
  };

  const approveDraft = async (emailId: string) => {
    const res = await fetch(`/api/crm/tickets/${ticketId}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", emailId }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast(json.error ?? "Approve failed", "error");
      return;
    }
    toast("Approved — care agent can open in Gmail");
    onWorkflowChange?.();
    load();
  };

  const submitRevision = async () => {
    if (!revisionEmailId || !revisionNote.trim()) {
      toast("Enter feedback for care", "error");
      return;
    }
    const res = await fetch(`/api/crm/tickets/${ticketId}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "request_revision",
        emailId: revisionEmailId,
        revisionNote: revisionNote.trim(),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast(json.error ?? "Failed", "error");
      return;
    }
    toast("Revision requested — care agent notified");
    setRevisionEmailId(null);
    setRevisionNote("");
    onWorkflowChange?.();
    load();
  };

  const markGmailSent = async (email: EmailRow) => {
    setLoading(true);
    const res = await fetch(`/api/crm/tickets/${ticketId}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "mark_sent",
        emailId: email.id,
        ...composerPayloadFor(email.id),
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast(json.error ?? "Could not mark sent", "error");
      return;
    }
    toast("Marked as sent in CRM");
    onWorkflowChange?.();
    load();
  };

  const sendViaResend = async (email: EmailRow) => {
    setLoading(true);
    const res = await fetch(`/api/crm/tickets/${ticketId}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send_resend",
        emailId: email.id,
        ...composerPayloadFor(email.id),
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      toast(json.error ?? "Resend failed", "error");
      return;
    }
    toast("Email sent via Resend");
    onWorkflowChange?.();
    load();
  };

  const openApprovedInGmail = async (email: EmailRow) => {
    setLoading(true);
    await openGmailCompose(email.id);
    setLoading(false);
    load();
  };

  const loadApprovedIntoComposer = (email: EmailRow) => {
    setToEmail(email.toEmail);
    setSubject(stableSubject || email.subject);
    if (email.bodyHtml) setBodyHtml(email.bodyHtml);
    if (email.attachmentIds?.length) setSelectedAttachmentIds(email.attachmentIds);
    setComposerEmailId(email.id);
    toast("Approved draft loaded — send when ready (edits to the message need re-approval)");
  };

  const statusLabel = (status: string) => {
    if (status === "pending_approval") return "Pending admin review";
    if (status === "approved") return "Approved — Resend or Gmail";
    if (status === "revision_requested") return "Revision requested";
    if (status === "superseded") return "Superseded";
    return status;
  };

  const loadRevisionIntoComposer = (email: EmailRow) => {
    setToEmail(email.toEmail);
    setSubject(stableSubject || email.subject);
    if (email.bodyHtml) setBodyHtml(email.bodyHtml);
    if (email.attachmentIds?.length) setSelectedAttachmentIds(email.attachmentIds);
    setComposerEmailId(email.id);
    toast("Revision draft loaded — update and resubmit for approval");
  };

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h3 className="font-semibold text-brand">Email response</h3>
        <p className="mt-1 text-xs text-slate-muted">
          Subject stays fixed as <strong>ticket ID + category</strong> so Gmail threads all messages
          together. After admin approval, care can send without re-approval unless the message body
          is edited (adding communication history below does not count).
        </p>
      </div>

      {revisionEmailId && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-sm font-medium">Request revision</p>
          <textarea
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
            rows={3}
            value={revisionNote}
            onChange={(e) => setRevisionNote(e.target.value)}
            placeholder="What should care change before resubmitting?"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={submitRevision}>
              Send feedback to care
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRevisionEmailId(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <Select
        label="Template"
        value={templateId}
        onChange={(e) => setTemplateId(e.target.value)}
        options={[
          { value: "", label: "Custom / pick template…" },
          ...visibleTemplates.map((t) => ({
            value: t.id,
            label: `${t.name}${t.category ? ` (${t.category})` : ""}${t.requiresAdminApproval ? " — needs approval" : ""}`,
          })),
        ]}
      />

      {templates.length > 0 && visibleTemplates.length === 0 && (
        <p className="text-sm text-slate-muted">
          No templates match this ticket category. General templates are shown when category is unset.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={!templateId || loading} onClick={applyTemplate}>
          Apply template
        </Button>
        <Button size="sm" variant="secondary" disabled={loading} onClick={runAiSuggest}>
          AI suggest response
        </Button>
      </div>

      <Input label="To" value={toEmail} onChange={(e) => setToEmail(e.target.value)} />
      <Input
        label="Subject (fixed for threading)"
        value={stableSubject || subject}
        readOnly
        onChange={() => {}}
      />
      <div>
        <label className="mb-1 block text-sm font-medium">Body</label>
        <textarea
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
          rows={8}
          value={bodyHtml}
          onChange={(e) => {
            setBodyHtml(e.target.value);
            if (composerEmailId) {
              const { core } = splitEmailBodyCoreAndAppendix(e.target.value);
              const prior = emails.find((em) => em.id === composerEmailId);
              if (prior?.bodyHtml) {
                const priorCore = splitEmailBodyCoreAndAppendix(prior.bodyHtml).core;
                if (core.trim() !== priorCore.trim()) {
                  setComposerEmailId(null);
                }
              }
            }
          }}
        />
      </div>

      <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Include communication history</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setCommPickerOpen((v) => !v);
              if (!commPickerOpen && commRows.length === 0) void loadCommOptions();
            }}
          >
            {commPickerOpen ? "Hide" : "Show options"}
          </Button>
        </div>
        <p className="text-xs text-slate-muted">
          Append past emails, WhatsApp, in-person notes, or Callyzer calls below the message. This
          does not require admin re-approval.
        </p>
        {commPickerOpen && (
          <div className="space-y-2">
            {commLoading ? (
              <p className="text-xs text-slate-muted">Loading…</p>
            ) : (
              <>
                {commRows.map((r) => {
                  const key = `comm:${r.id}`;
                  return (
                    <label key={key} className="flex gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={selectedCommKeys.includes(key)}
                        onChange={() => toggleCommKey(key)}
                      />
                      <span>
                        {r.direction === "inbound" ? "Received" : "Sent"} · {r.channel} ·{" "}
                        {formatDate(r.createdAt)}
                      </span>
                    </label>
                  );
                })}
                {callyzerCalls.map((c) => {
                  const key = `call:${c.id}`;
                  return (
                    <label key={key} className="flex gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={selectedCommKeys.includes(key)}
                        onChange={() => toggleCommKey(key)}
                      />
                      <span>
                        Callyzer · {c.staffName ?? "—"} · {formatDate(c.calledAt)}
                      </span>
                    </label>
                  );
                })}
                {!commRows.length && !callyzerCalls.length && (
                  <p className="text-xs text-slate-muted">No communications logged yet.</p>
                )}
                <Button size="sm" variant="secondary" onClick={appendSelectedCommunications}>
                  Append selected to email
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={TICKET_ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              void uploadFiles(e.target.files);
              e.target.value = "";
            }
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? "Uploading…" : "Add attachments"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="self-center text-xs text-slate-muted">Send via</span>
        <Button
          type="button"
          size="sm"
          variant={deliveryMethod === "gmail" ? "primary" : "secondary"}
          onClick={() => setDeliveryMethod("gmail")}
        >
          Gmail
        </Button>
        <Button
          type="button"
          size="sm"
          variant={deliveryMethod === "resend" ? "primary" : "secondary"}
          onClick={() => setDeliveryMethod("resend")}
        >
          Resend
        </Button>
      </div>

      <Button onClick={submitForApprovalOrSend} disabled={loading || uploading}>
        {loading
          ? "Submitting…"
          : composerEmailId
            ? deliveryMethod === "resend"
              ? "Send approved email (Resend)"
              : "Send approved email (Gmail)"
            : deliveryMethod === "resend"
              ? "Submit for approval / send via Resend"
              : "Submit for approval / open in Gmail"}
      </Button>

      {emails.length > 0 && (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <p className="text-xs font-medium uppercase text-slate-muted">Email drafts &amp; history</p>
          {emails.map((e) => (
            <div key={e.id} className="rounded border border-slate-100 p-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{e.subject}</span>
                  <span className="ml-2 text-xs text-slate-muted">{e.toEmail}</span>
                </div>
                <Badge
                  variant={
                    e.status === "sent"
                      ? "success"
                      : e.status === "pending_approval"
                        ? "critical"
                        : e.status === "approved"
                          ? "active"
                          : "muted"
                  }
                >
                  {statusLabel(e.status)}
                </Badge>
              </div>
              {e.adminRevisionNote && (
                <p className="mt-1 text-xs text-amber-800">Admin: {e.adminRevisionNote}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {e.status === "pending_approval" && (
                  <Button size="sm" variant="secondary" onClick={() => openPreview(e)}>
                    Preview
                  </Button>
                )}
                {isAdmin && e.status === "pending_approval" && (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => approveDraft(e.id)}>
                      Approve for care to send
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setRevisionEmailId(e.id)}>
                      Request revision
                    </Button>
                  </>
                )}
                {e.status === "approved" && (
                  <>
                    <Button size="sm" onClick={() => sendViaResend(e)} disabled={loading}>
                      Send via Resend
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => openApprovedInGmail(e)} disabled={loading}>
                      Open in Gmail
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => markGmailSent(e)} disabled={loading}>
                      Mark Gmail sent
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => loadApprovedIntoComposer(e)}>
                      Load in composer
                    </Button>
                  </>
                )}
                {e.status === "revision_requested" && (
                  <Button size="sm" variant="secondary" onClick={() => loadRevisionIntoComposer(e)}>
                    Load in composer
                  </Button>
                )}
                {e.status === "sent" && e.sendChannel && (
                  <span className="text-xs text-slate-muted self-center">
                    via {e.sendChannel === "resend" ? "Resend" : "Gmail"}
                  </span>
                )}
                {e.status === "draft" && (
                  <Button size="sm" variant="secondary" onClick={() => openApprovedInGmail(e)} disabled={loading}>
                    Open in Gmail
                  </Button>
                )}
                <span className="text-xs text-slate-muted self-center">
                  {e.sentAt ? formatDate(e.sentAt) : formatDate(e.createdAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      <PendingEmailPreviewModal
        open={Boolean(previewEmail)}
        onClose={() => setPreviewEmail(null)}
        email={previewEmail}
        canReview={Boolean(isAdmin)}
        onActionComplete={isAdmin ? handlePreviewActionComplete : undefined}
        onDraftSaved={
          isAdmin
            ? (patch) => {
                setPreviewEmail((current) => (current ? { ...current, ...patch } : null));
                load();
              }
            : undefined
        }
      />
    </Card>
  );
}
