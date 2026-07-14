"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { GrievanceTaskCompleteModal } from "@/components/grievances/GrievanceTaskCompleteModal";
import { formatDate, cn } from "@/lib/utils";
import type { TicketStatus } from "@/lib/types";

type ContextData = {
  task: {
    id: string;
    displayId: string;
    taskType: string;
    status: string;
    priority: string;
    title: string;
    description: string | null;
    dueAt: string | null;
  };
  ticket: {
    ticketNumber: string;
    category: string;
    status: TicketStatus;
    urgency: string;
    complaintText: string;
    muaName: string | null;
    raisedByName: string | null;
    raisedByPhone: string | null;
    createdAt: string;
  };
  categories: string[];
  requiresLedger: boolean;
  hasLedger: boolean;
  attachments: { id: string; fileName: string; filePath: string; createdAt: string }[];
  taskAttachments: { id: string; fileName: string; filePath: string; createdAt: string }[];
  ledgerStats: { total: number; matched: number };
  isOperator: boolean;
  canSendBack: boolean;
  allowedStatuses: { value: TicketStatus; label: string }[];
  suggestedStatus: TicketStatus | null;
};

export function CareTaskWorkspaceClient({ taskId }: { taskId: string }) {
  const [data, setData] = useState<ContextData | null>(null);
  const [loading, setLoading] = useState(true);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    void fetch(`/api/crm/care-tasks/${taskId}/context`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
          setData(null);
        } else {
          setData(json.data);
          setError(null);
        }
        setLoading(false);
      });
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("category", "staff_document");
      const res = await fetch(`/api/crm/care-tasks/${taskId}/attachments`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Upload failed");
        return;
      }
      load();
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <p className="text-slate-muted">Loading care task…</p>;
  }

  if (error || !data) {
    return (
      <div>
        <p className="text-red-600">{error ?? "Task not found"}</p>
        <Link href="/rm/tasks?tab=crm" className="text-sm text-brand">
          Back to tasks
        </Link>
      </div>
    );
  }

  const { task, ticket } = data;
  const backHref =
    typeof window !== "undefined" && window.location.pathname.includes("/sales")
      ? "/sales/tasks"
      : "/rm/tasks?tab=crm";

  const dueOverdue =
    task.dueAt && new Date(task.dueAt).getTime() < Date.now() && task.status !== "done";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={backHref} className="text-sm text-brand hover:underline">
        ← Back to my tasks
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand">{task.displayId}</h1>
          <p className="text-sm text-slate-muted capitalize">
            {task.taskType.replace(/_/g, " ")} · Ticket {ticket.ticketNumber}
          </p>
        </div>
        {task.status !== "done" && (
          <Button onClick={() => setCompleteOpen(true)}>Complete or send back</Button>
        )}
      </div>

      <Card className="p-4">
        <h2 className="font-semibold text-brand">{task.title}</h2>
        {task.description && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{task.description}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge variant="muted">{task.priority}</Badge>
          <Badge variant="muted">{task.status.replace(/_/g, " ")}</Badge>
          <Badge variant="muted">Ticket: {ticket.status.replace(/([A-Z])/g, " $1").trim()}</Badge>
          {task.dueAt && (
            <span className={cn(dueOverdue && "font-medium text-red-600")}>
              Due {formatDate(task.dueAt)}
              {dueOverdue ? " (overdue)" : ""}
            </span>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 font-semibold text-brand">Ticket context</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-muted">MUA</dt>
            <dd>{ticket.muaName ?? ticket.raisedByName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-muted">Contact</dt>
            <dd>{ticket.raisedByPhone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-muted">Category</dt>
            <dd className="capitalize">{data.categories.join(", ").replace(/_/g, " ")}</dd>
          </div>
          <div>
            <dt className="text-slate-muted">Urgency</dt>
            <dd className="capitalize">{ticket.urgency}</dd>
          </div>
        </dl>
        <div className="mt-4">
          <p className="text-xs font-medium uppercase text-slate-muted">Complaint</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{ticket.complaintText}</p>
        </div>
        {data.requiresLedger && !data.hasLedger && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            This ticket may need a lead usage ledger. Attach proof or notes below; care will
            complete ledger matching.
          </p>
        )}
        {data.ledgerStats.total > 0 && (
          <p className="mt-2 text-xs text-slate-muted">
            Ledger on file: {data.ledgerStats.total} rows, {data.ledgerStats.matched} matched
          </p>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-brand">Your attachments</h2>
          {task.status !== "done" && (
            <label className="cursor-pointer">
              <span className="inline-flex rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200">
                {uploading ? "Uploading…" : "Upload file"}
              </span>
              <input
                type="file"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
        {data.taskAttachments.length === 0 ? (
          <p className="text-sm text-slate-muted">No files attached for this task yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.taskAttachments.map((a) => (
              <li key={a.id}>
                <a
                  href={a.filePath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  {a.fileName}
                </a>
                <span className="ml-2 text-xs text-slate-muted">{formatDate(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data.attachments.length > data.taskAttachments.length && (
        <Card className="p-4">
          <h2 className="mb-2 font-semibold text-brand">Other ticket documents</h2>
          <ul className="space-y-1 text-sm">
            {data.attachments
              .filter((a) => !data.taskAttachments.some((t) => t.id === a.id))
              .map((a) => (
                <li key={a.id}>
                  <a
                    href={a.filePath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    {a.fileName}
                  </a>
                </li>
              ))}
          </ul>
        </Card>
      )}

      <GrievanceTaskCompleteModal
        taskId={taskId}
        taskType={task.taskType}
        title={task.title}
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        onCompleted={load}
        ticketNumber={ticket.ticketNumber}
        allowedStatuses={data.allowedStatuses}
        suggestedStatus={data.suggestedStatus}
        canSendBack={data.canSendBack}
        isOperator={data.isOperator}
      />
    </div>
  );
}
