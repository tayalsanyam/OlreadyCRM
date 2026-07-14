import type { AdminTaskOverviewItem } from "@/lib/admin-tasks-overview";

const KIND_LABEL: Record<AdminTaskOverviewItem["kind"], string> = {
  crm: "CRM",
  team: "Assignment",
  care: "Grievance",
  support: "Support",
};

export function opsTaskDefaultsFromAdminTask(task: {
  id: string;
  kind: AdminTaskOverviewItem["kind"];
  displayId: string;
  title: string;
  meta?: string | null;
  leadId?: string | null;
  muaId?: string | null;
}) {
  const kind = KIND_LABEL[task.kind];
  const lines = [
    `Referenced ${kind} task ${task.displayId}: ${task.title}`,
    task.meta ? `Context: ${task.meta}` : null,
  ].filter(Boolean);

  return {
    defaultTitle: `Assignment — ${task.displayId}`,
    defaultDescription: lines.join("\n"),
    defaultLeadId: task.leadId ?? null,
    defaultMuaId: task.muaId ?? null,
    parentTaskId: task.kind === "team" ? task.id : null,
  };
}
