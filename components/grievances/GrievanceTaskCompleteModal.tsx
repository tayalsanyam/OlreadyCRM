"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import type { TicketStatus } from "@/lib/types";

type StatusOption = { value: TicketStatus; label: string };

type TaskContext = {
  allowedStatuses: StatusOption[];
  suggestedStatus: TicketStatus | null;
  canSendBack: boolean;
  isOperator: boolean;
  ticketStatus: TicketStatus;
  ticketNumber?: string;
  hasOpenPrimaryTask?: boolean;
  emailApproval?: boolean;
};

type Props = {
  taskId: string;
  taskType: string;
  title: string;
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
  ticketNumber?: string;
  allowedStatuses?: StatusOption[];
  suggestedStatus?: TicketStatus | null;
  canSendBack?: boolean;
  isOperator?: boolean;
  currentTicketStatus?: TicketStatus | string;
};

export function GrievanceTaskCompleteModal({
  taskId,
  taskType,
  title,
  open,
  onClose,
  onCompleted,
  ticketNumber: ticketNumberProp,
  allowedStatuses: allowedStatusesProp,
  suggestedStatus: suggestedStatusProp,
  canSendBack: canSendBackProp,
  isOperator: isOperatorProp,
  currentTicketStatus,
}: Props) {
  const { toast } = useToast();
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [ticketStatus, setTicketStatus] = useState("");
  const [sendBackNote, setSendBackNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"complete" | "send_back">("complete");
  const [ctx, setCtx] = useState<TaskContext | null>(null);
  const [ctxLoading, setCtxLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (
      allowedStatusesProp &&
      isOperatorProp !== undefined &&
      currentTicketStatus !== undefined
    ) {
      setCtx({
        allowedStatuses: allowedStatusesProp,
        suggestedStatus: suggestedStatusProp ?? null,
        canSendBack: canSendBackProp ?? false,
        isOperator: isOperatorProp,
        ticketStatus: currentTicketStatus as TicketStatus,
        ticketNumber: ticketNumberProp,
      });
      return;
    }

    setCtxLoading(true);
    void fetch(`/api/crm/care-tasks/${taskId}/context`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.data?.ticket) {
          setCtx(null);
          return;
        }
        setCtx({
          allowedStatuses: json.data.allowedStatuses ?? [],
          suggestedStatus: json.data.suggestedStatus ?? null,
          canSendBack: json.data.canSendBack ?? false,
          isOperator: json.data.isOperator ?? false,
          ticketStatus: json.data.ticket.status,
          ticketNumber: json.data.ticket.ticketNumber ?? ticketNumberProp,
          hasOpenPrimaryTask: Boolean(json.data.hasOpenPrimaryTask),
          emailApproval: Boolean(json.data.emailApproval),
        });
      })
      .catch(() => setCtx(null))
      .finally(() => setCtxLoading(false));
  }, [
    open,
    taskId,
    allowedStatusesProp,
    suggestedStatusProp,
    canSendBackProp,
    isOperatorProp,
    currentTicketStatus,
    ticketNumberProp,
  ]);

  const allowedStatuses = ctx?.allowedStatuses ?? allowedStatusesProp ?? [];
  const suggestedStatus = ctx?.suggestedStatus ?? suggestedStatusProp ?? null;
  const canSendBack = ctx?.canSendBack ?? canSendBackProp ?? false;
  const isOperator = ctx?.isOperator ?? isOperatorProp ?? false;
  const activeTicketStatus = (ctx?.ticketStatus ?? currentTicketStatus ?? "received") as TicketStatus;
  const ticketNumber = ctx?.ticketNumber ?? ticketNumberProp;

  const isExemptTask =
    taskType === "admin_review" ||
    ctx?.emailApproval === true ||
    ((taskType === "send_email" || taskType === "draft_response") &&
      !ctx?.hasOpenPrimaryTask);

  const mustContinue =
    isOperator && activeTicketStatus !== "closed" && !isExemptTask;

  const reset = () => {
    setSummary("");
    setOutcome("");
    setNextFollowUpAt("");
    setTicketStatus("");
    setSendBackNote("");
    setMode("complete");
  };

  const submit = async (sendBack: boolean) => {
    const note = sendBack ? sendBackNote.trim() || summary.trim() : summary.trim();
    if (!note) {
      toast(sendBack ? "Send-back note is required" : "Summary is required", "error");
      return;
    }

    const statusChoice = (ticketStatus ||
      (suggestedStatus && allowedStatuses.some((s) => s.value === suggestedStatus)
        ? suggestedStatus
        : "")) as TicketStatus | "";

    if (!sendBack && mustContinue) {
      const closing = statusChoice === "closed";
      const stageAdvanced = Boolean(statusChoice && statusChoice !== activeTicketStatus);
      if (!closing && !stageAdvanced && !nextFollowUpAt) {
        toast("Set a follow-up date or change the ticket stage before completing", "error");
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/crm/care-tasks/${taskId}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: note,
          outcome: outcome || undefined,
          nextFollowUpAt: sendBack ? undefined : nextFollowUpAt || undefined,
          ticketStatus:
            !sendBack && statusChoice && statusChoice !== activeTicketStatus
              ? statusChoice
              : !sendBack && statusChoice === "closed"
                ? "closed"
                : undefined,
          sendBack,
          sendBackNote: sendBack ? note : undefined,
          taskPayload: { taskType, completedVia: sendBack ? "send_back" : "modal" },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Failed to save", "error");
        return;
      }
      toast(
        sendBack
          ? "Sent back to care team"
          : statusChoice === "closed"
            ? "Task completed — ticket closed"
            : statusChoice && statusChoice !== activeTicketStatus
              ? "Task completed — stage updated & next task scheduled"
              : nextFollowUpAt
                ? "Task completed — follow-up scheduled"
                : "Task completed"
      );
      onCompleted();
      onClose();
      reset();
    } finally {
      setLoading(false);
    }
  };

  const statusValue =
    ticketStatus ||
    (suggestedStatus && allowedStatuses.some((s) => s.value === suggestedStatus)
      ? suggestedStatus
      : "");

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      title={mode === "send_back" ? `Send back: ${title}` : `Complete: ${title}`}
    >
      <div className="space-y-4 p-1">
        <p className="text-sm text-slate-muted capitalize">
          {taskType.replace(/_/g, " ")}
          {ticketNumber ? ` · Ticket ${ticketNumber}` : ""}
        </p>

        {ctxLoading && (
          <p className="text-sm text-slate-muted">Loading task context…</p>
        )}

        {mustContinue && mode === "complete" && (
          <p className="rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-sm text-slate-muted">
            Before finishing, schedule a <strong className="text-text">follow-up date</strong> or{" "}
            <strong className="text-text">advance the ticket stage</strong> (or close the ticket) so
            this case stays on your queue.
          </p>
        )}

        {mode === "send_back" ? (
          <textarea
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={4}
            placeholder="What does care need to review or follow up on?"
            value={sendBackNote}
            onChange={(e) => setSendBackNote(e.target.value)}
          />
        ) : (
          <>
            {taskType === "call_back" && (
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Outcome (reached, no answer, callback scheduled…)"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              />
            )}
            <textarea
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={4}
              placeholder="What you did, findings, and handoff notes (logged to ticket timeline)"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
            {allowedStatuses.length > 0 && (
              <Select
                label={
                  mustContinue
                    ? "Advance ticket stage (or set follow-up below)"
                    : "Advance ticket status (optional)"
                }
                value={statusValue}
                onChange={(e) => setTicketStatus(e.target.value)}
                options={[
                  { value: "", label: "No stage change" },
                  ...allowedStatuses.map((s) => ({ value: s.value, label: s.label })),
                ]}
              />
            )}
            <Input
              label={mustContinue ? "Next follow-up (required if stage unchanged)" : "Next follow-up"}
              type="datetime-local"
              value={nextFollowUpAt}
              onChange={(e) => setNextFollowUpAt(e.target.value)}
            />
          </>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {canSendBack && mode === "complete" && (
            <Button
              variant="secondary"
              onClick={() => setMode("send_back")}
              disabled={loading}
            >
              Send back to care
            </Button>
          )}
          {mode === "send_back" && (
            <Button variant="secondary" onClick={() => setMode("complete")} disabled={loading}>
              Cancel send-back
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Close
          </Button>
          {mode === "send_back" ? (
            <Button onClick={() => void submit(true)} disabled={loading}>
              {loading ? "Sending…" : "Send back"}
            </Button>
          ) : (
            <Button onClick={() => void submit(false)} disabled={loading || ctxLoading}>
              {loading ? "Saving…" : "Complete task"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
