"use client";

import { useState } from "react";
import Link from "next/link";
import { cn, formatDate } from "@/lib/utils";
import { GrievanceTaskCompleteModal } from "@/components/grievances/GrievanceTaskCompleteModal";
import { CrmTaskCompleteModal, DealDiscountApprovalModal } from "@/components/admin/AdminTaskActions";
import { OpsTaskCompleteModal } from "@/components/ops/OpsTaskCompleteModal";
import {
  discountStageLogIdFromTask,
  isDealDiscountAdminTask,
  type AdminDiscountTaskDetails,
} from "@/lib/sales-deal-discount-shared";

export type AdminTaskListItem = {
  id: string;
  kind: "crm" | "team" | "care" | "support";
  displayId: string;
  title: string;
  status: string;
  dueAt: string | null;
  assigneeId?: string;
  assigneeName?: string;
  assignedByName?: string | null;
  taskType?: string | null;
  leadId?: string | null;
  muaId?: string | null;
  meta?: string | null;
  link?: string | null;
  discountDetails?: AdminDiscountTaskDetails;
};

const KIND_LABEL: Record<AdminTaskListItem["kind"], string> = {
  crm: "CRM",
  team: "Assignment",
  care: "Grievance",
  support: "Support",
};

const KIND_STYLE: Record<AdminTaskListItem["kind"], string> = {
  crm: "bg-blue-50 text-blue-800",
  team: "bg-violet-50 text-violet-800",
  care: "bg-amber-50 text-amber-900",
  support: "bg-teal-50 text-teal-900",
};

export function AdminTaskItemList({
  tasks,
  emptyLabel = "No open tasks.",
  dateLabel = "due",
  currentUserId,
  onChanged,
  onInspect,
  openViaInspector = false,
}: {
  tasks: AdminTaskListItem[];
  emptyLabel?: string;
  dateLabel?: "due" | "completed";
  currentUserId?: string;
  onChanged?: () => void;
  onInspect?: (task: AdminTaskListItem) => void;
  /** Team standing: View opens inspector for every task kind */
  openViaInspector?: boolean;
}) {
  const [crmTask, setCrmTask] = useState<AdminTaskListItem | null>(null);
  const [careTask, setCareTask] = useState<AdminTaskListItem | null>(null);
  const [teamTask, setTeamTask] = useState<AdminTaskListItem | null>(null);

  if (tasks.length === 0) {
    return <p className="text-sm text-slate-muted">{emptyLabel}</p>;
  }

  function workspaceHref(t: AdminTaskListItem): string | null {
    if (t.kind === "team") return `/tasks/ops/${t.id}?from=admin`;
    if (t.kind === "care") return `/tasks/care/${t.id}`;
    if (t.kind === "support") return `/tasks/support/${t.id}`;
    return null;
  }

  function canComplete(t: AdminTaskListItem): boolean {
    return Boolean(currentUserId && t.assigneeId === currentUserId && t.status !== "done");
  }

  return (
    <>
      <ul className="space-y-2">
        {tasks.map((t) => {
          const href = workspaceHref(t) ?? t.link;
          const mine = canComplete(t);
          const showInspect = openViaInspector && onInspect;
          const isDiscountTask = isDealDiscountAdminTask(t);
          return (
            <li
              key={`${t.kind}-${t.id}`}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                      KIND_STYLE[t.kind],
                    )}
                  >
                    {KIND_LABEL[t.kind]}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase text-slate-600">
                    {t.status.replace(/_/g, " ")}
                  </span>
                  <span className="font-mono text-xs text-slate-muted">{t.displayId}</span>
                </div>
                <p className="text-sm font-medium">{t.title}</p>
                {t.assignedByName && t.kind === "team" && (
                  <p className="text-xs text-slate-muted">Assigned by {t.assignedByName}</p>
                )}
                {t.meta && <p className="text-xs text-slate-muted">{t.meta}</p>}
              </div>
              <div className="text-right text-xs">
                {t.dueAt ? (
                  <p className="text-slate-muted">
                    {dateLabel === "completed" ? "Completed" : "Due"}{" "}
                    {formatDate(t.dueAt.slice(0, 10))}
                  </p>
                ) : (
                  <p className="text-slate-muted">
                    {dateLabel === "completed" ? "Completed date unknown" : "No due date"}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap justify-end gap-2">
                  {showInspect ? (
                    <button
                      type="button"
                      className="text-accent hover:underline"
                      onClick={() => onInspect(t)}
                    >
                      View
                    </button>
                  ) : t.kind === "crm" ? (
                    <button
                      type="button"
                      className="text-accent hover:underline"
                      onClick={() => onInspect?.(t)}
                    >
                      View
                    </button>
                  ) : href ? (
                    <Link href={href} className="text-accent hover:underline">
                      Open
                    </Link>
                  ) : null}
                  {showInspect && href && (
                    <Link href={href} className="text-slate-muted hover:underline">
                      Open
                    </Link>
                  )}
                  {mine && t.kind === "crm" && (
                    <button
                      type="button"
                      className="font-medium text-brand hover:underline"
                      onClick={() => setCrmTask(t)}
                    >
                      {isDiscountTask ? "Review discount" : "Complete"}
                    </button>
                  )}
                  {mine && t.kind === "care" && (
                    <button
                      type="button"
                      className="font-medium text-brand hover:underline"
                      onClick={() => setCareTask(t)}
                    >
                      Complete
                    </button>
                  )}
                  {mine && t.kind === "team" && (
                    <button
                      type="button"
                      className="font-medium text-brand hover:underline"
                      onClick={() => setTeamTask(t)}
                    >
                      Complete
                    </button>
                  )}
                  {mine && t.kind === "support" && href && (
                    <Link href={href} className="font-medium text-brand hover:underline">
                      Complete
                    </Link>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {crmTask && isDealDiscountAdminTask(crmTask) && discountStageLogIdFromTask(crmTask) ? (
        <DealDiscountApprovalModal
          stageLogId={discountStageLogIdFromTask(crmTask)!}
          displayId={crmTask.displayId}
          title={crmTask.title}
          details={crmTask.discountDetails}
          open={Boolean(crmTask)}
          onClose={() => setCrmTask(null)}
          onCompleted={() => {
            onChanged?.();
            setCrmTask(null);
          }}
        />
      ) : null}

      {crmTask && !isDealDiscountAdminTask(crmTask) ? (
        <CrmTaskCompleteModal
          taskId={crmTask.id}
          displayId={crmTask.displayId}
          title={crmTask.title}
          taskType={crmTask.taskType}
          open={Boolean(crmTask)}
          onClose={() => setCrmTask(null)}
          onCompleted={() => {
            onChanged?.();
            setCrmTask(null);
          }}
        />
      ) : null}

      {careTask && (
        <GrievanceTaskCompleteModal
          taskId={careTask.id}
          taskType={careTask.taskType ?? "admin_review"}
          title={careTask.title}
          open={Boolean(careTask)}
          onClose={() => setCareTask(null)}
          onCompleted={() => {
            onChanged?.();
            setCareTask(null);
          }}
        />
      )}

      {teamTask && (
        <OpsTaskCompleteModal
          taskId={teamTask.id}
          displayId={teamTask.displayId}
          title={teamTask.title}
          open={Boolean(teamTask)}
          onClose={() => setTeamTask(null)}
          onCompleted={() => {
            onChanged?.();
            setTeamTask(null);
          }}
          apiPath={`/api/my/ops-tasks/${teamTask.id}`}
          allowAttachments
        />
      )}
    </>
  );
}
