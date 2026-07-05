"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SlideOver } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";
import { apiErrorMessage } from "@/lib/api-json";
import { DealDiscountDetailsCard } from "@/components/admin/DealDiscountDetailsCard";
import {
  discountStageLogIdFromTask,
  formatDiscountTaskDisplayTitle,
  isDealDiscountAdminTask,
  type AdminDiscountTaskDetails,
} from "@/lib/sales-deal-discount-shared";
import { TASK_TYPE_LABELS, type TaskType } from "@/lib/types";
import { fromDbTaskType } from "@/lib/db-mappers";
import { CreateOpsTaskSlideOver } from "@/components/admin/CreateOpsTaskSlideOver";
import { OpsTaskCompleteModal } from "@/components/ops/OpsTaskCompleteModal";
import { opsTaskDefaultsFromAdminTask } from "@/lib/admin-task-ops-bridge";

export type AdminInspectorTask = {
  id: string;
  kind: "crm" | "team" | "care" | "support";
  displayId: string;
  title: string;
  status: string;
  dueAt: string | null;
  meta?: string | null;
  assigneeName?: string;
  assignedByName?: string | null;
  taskType?: string | null;
  leadId?: string | null;
  muaId?: string | null;
  assigneeId?: string;
  discountDetails?: AdminDiscountTaskDetails;
};

export function CrmTaskCompleteModal({
  taskId,
  displayId,
  title,
  taskType,
  open,
  onClose,
  onCompleted,
}: {
  taskId: string;
  displayId: string;
  title: string;
  taskType?: string | null;
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const mapped = taskType ? fromDbTaskType(taskType) : null;
  const typeLabel = mapped
    ? TASK_TYPE_LABELS[mapped as TaskType]
    : taskType?.replace(/_/g, " ");

  async function submit() {
    if (note.trim().length < 10) {
      toast("Add at least 10 characters of notes", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done", note: note.trim() }),
      });
      if (!res.ok) {
        toast(await apiErrorMessage(res, "Could not complete task"), "error");
        return;
      }
      toast("Task completed");
      setNote("");
      onCompleted();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <SlideOver open={open} onClose={onClose} title={`Complete ${displayId}`}>
      <div className="space-y-4">
        <p className="text-sm font-medium">{title}</p>
        {typeLabel && <p className="text-xs text-slate-muted capitalize">{typeLabel}</p>}
        <Input
          label="Completion notes (min 10 characters)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What did you review or decide?"
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : "Mark done"}
          </Button>
        </div>
      </div>
    </SlideOver>
  );
}

export function DealDiscountApprovalModal({
  stageLogId,
  displayId,
  title,
  details: initialDetails,
  open,
  onClose,
  onCompleted,
}: {
  stageLogId: string;
  displayId: string;
  title: string;
  details?: AdminDiscountTaskDetails;
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [details, setDetails] = useState<AdminDiscountTaskDetails | null>(initialDetails ?? null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialDetails) {
      setDetails(initialDetails);
      return;
    }
    setLoadingDetails(true);
    void fetch(`/api/admin/sales/discount-requests/${stageLogId}`)
      .then((r) => r.json())
      .then((j) => setDetails((j.data as AdminDiscountTaskDetails | null) ?? null))
      .finally(() => setLoadingDetails(false));
  }, [open, stageLogId, initialDetails]);

  async function submit(action: "approve" | "reject") {
    if (note.trim().length < 10) {
      toast("Add at least 10 characters of notes", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/sales/discount-requests/${stageLogId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: note.trim() }),
      });
      if (!res.ok) {
        toast(await apiErrorMessage(res, "Discount action failed"), "error");
        return;
      }
      toast(action === "approve" ? "Discount approved — deal closed" : "Discount rejected");
      setNote("");
      onCompleted();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <SlideOver open={open} onClose={onClose} title={`Review discount — ${displayId}`}>
      <div className="space-y-4">
        {loadingDetails ? (
          <p className="text-sm text-slate-muted">Loading discount details…</p>
        ) : details ? (
          <DealDiscountDetailsCard details={details} title={formatDiscountTaskDisplayTitle(title)} />
        ) : (
          <p className="text-sm font-medium">{formatDiscountTaskDisplayTitle(title)}</p>
        )}
        <p className="text-xs text-slate-muted">
          Approving applies the discounted net price and completes the pending deal close with the payment details
          submitted by sales.
        </p>
        <Input
          label="Review notes (min 10 characters)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why approve or reject this discount?"
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => void submit("reject")} disabled={saving}>
            Reject
          </Button>
          <Button onClick={() => void submit("approve")} disabled={saving}>
            {saving ? "Saving…" : "Approve & close"}
          </Button>
        </div>
      </div>
    </SlideOver>
  );
}

export function AdminTaskInspector({
  task,
  open,
  onClose,
  currentUserId,
  onChanged,
}: {
  task: AdminInspectorTask | null;
  open: boolean;
  onClose: () => void;
  currentUserId?: string;
  onChanged?: () => void;
}) {
  const [crmCompleteOpen, setCrmCompleteOpen] = useState(false);
  const [discountReviewOpen, setDiscountReviewOpen] = useState(false);
  const [teamCompleteOpen, setTeamCompleteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [inspectorDetails, setInspectorDetails] = useState<AdminDiscountTaskDetails | null>(null);
  const [loadingInspectorDetails, setLoadingInspectorDetails] = useState(false);

  const isDiscountTask = task ? isDealDiscountAdminTask(task) : false;
  const discountStageLogId = task ? discountStageLogIdFromTask(task) : null;

  useEffect(() => {
    if (!open || !task || !isDiscountTask) {
      setInspectorDetails(null);
      return;
    }
    if (task.discountDetails) {
      setInspectorDetails(task.discountDetails);
      return;
    }
    if (!discountStageLogId) return;
    setLoadingInspectorDetails(true);
    void fetch(`/api/admin/sales/discount-requests/${discountStageLogId}`)
      .then((r) => r.json())
      .then((j) => setInspectorDetails((j.data as AdminDiscountTaskDetails | null) ?? null))
      .finally(() => setLoadingInspectorDetails(false));
  }, [open, task, isDiscountTask, discountStageLogId]);

  const canComplete =
    task && currentUserId && task.assigneeId === currentUserId && task.status !== "done";

  const workspaceHref =
    task?.kind === "team"
      ? `/tasks/ops/${task.id}?from=admin`
      : task?.kind === "care"
        ? `/tasks/care/${task.id}`
        : task?.kind === "support"
          ? `/tasks/support/${task.id}`
          : null;

  const assignmentDefaults = useMemo(
    () => (task ? opsTaskDefaultsFromAdminTask(task) : null),
    [task],
  );

  return (
    <>
      <SlideOver open={open && !!task} onClose={onClose} title={task?.displayId ?? "Task"}>
        {task && (
          <div className="space-y-4 text-sm">
            <p className="text-lg font-semibold text-brand">
              {isDiscountTask ? formatDiscountTaskDisplayTitle(task.title) : task.title}
            </p>
            <p className="text-xs uppercase text-slate-muted">{task.status.replace(/_/g, " ")}</p>
            {isDiscountTask ? (
              loadingInspectorDetails ? (
                <p className="text-sm text-slate-muted">Loading discount details…</p>
              ) : inspectorDetails ? (
                <DealDiscountDetailsCard details={inspectorDetails} />
              ) : null
            ) : null}
            {task.assigneeName && (
              <p>
                <span className="text-slate-muted">Assignee:</span> {task.assigneeName}
              </p>
            )}
            {task.assignedByName && (
              <p>
                <span className="text-slate-muted">Assigned by:</span> {task.assignedByName}
              </p>
            )}
            {task.meta && !isDiscountTask ? (
              <p className="text-slate-muted">{task.meta}</p>
            ) : null}
            {task.dueAt && (
              <p>
                <span className="text-slate-muted">Due:</span>{" "}
                {new Date(task.dueAt).toLocaleDateString("en-IN")}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              {workspaceHref && (
                <Link href={workspaceHref} className="text-sm text-accent hover:underline">
                  Open workspace →
                </Link>
              )}
              {task.kind === "crm" && task.leadId && (
                <Link href={`/rm/leads/${task.leadId}`} className="text-sm text-accent hover:underline">
                  View lead profile →
                </Link>
              )}
              {isDiscountTask && discountStageLogId && (
                <Link href="/sales/pipeline" className="text-sm text-accent hover:underline">
                  Open sales pipeline →
                </Link>
              )}
              {task.status !== "done" && (
                <Button size="sm" variant="secondary" onClick={() => setAssignOpen(true)}>
                  Create assignment task
                </Button>
              )}
              {canComplete && task.kind === "crm" && (
                <Button
                  size="sm"
                  onClick={() => (isDiscountTask ? setDiscountReviewOpen(true) : setCrmCompleteOpen(true))}
                >
                  {isDiscountTask ? "Review discount" : "Complete task"}
                </Button>
              )}
              {canComplete && task.kind === "team" && (
                <Button size="sm" onClick={() => setTeamCompleteOpen(true)}>
                  Complete task
                </Button>
              )}
              {canComplete && task.kind !== "crm" && task.kind !== "team" && workspaceHref && (
                <Link href={workspaceHref}>
                  <Button size="sm">Complete in workspace</Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </SlideOver>

      {task?.kind === "crm" && isDiscountTask && discountStageLogId && (
        <DealDiscountApprovalModal
          stageLogId={discountStageLogId}
          displayId={task.displayId}
          title={task.title}
          details={task.discountDetails ?? inspectorDetails ?? undefined}
          open={discountReviewOpen}
          onClose={() => setDiscountReviewOpen(false)}
          onCompleted={() => onChanged?.()}
        />
      )}

      {task?.kind === "crm" && !isDiscountTask && (
        <CrmTaskCompleteModal
          taskId={task.id}
          displayId={task.displayId}
          title={task.title}
          taskType={task.taskType}
          open={crmCompleteOpen}
          onClose={() => setCrmCompleteOpen(false)}
          onCompleted={() => onChanged?.()}
        />
      )}

      {task?.kind === "team" && (
        <OpsTaskCompleteModal
          taskId={task.id}
          displayId={task.displayId}
          title={task.title}
          open={teamCompleteOpen}
          onClose={() => setTeamCompleteOpen(false)}
          onCompleted={() => onChanged?.()}
          apiPath={`/api/my/ops-tasks/${task.id}`}
          allowAttachments
        />
      )}

      {task && assignmentDefaults && (
        <CreateOpsTaskSlideOver
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
          onCreated={() => {
            onChanged?.();
            setAssignOpen(false);
          }}
          parentTaskId={assignmentDefaults.parentTaskId ?? undefined}
          defaultTitle={assignmentDefaults.defaultTitle}
          defaultDescription={assignmentDefaults.defaultDescription}
          defaultMuaId={assignmentDefaults.defaultMuaId}
          defaultLeadId={assignmentDefaults.defaultLeadId}
          createApiPath="/api/admin/ops-tasks"
        />
      )}
    </>
  );
}
