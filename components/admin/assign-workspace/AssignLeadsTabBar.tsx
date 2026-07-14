"use client";

import type { AdminExitCounts } from "@/lib/admin-exit-leads-shared";
import type { AssignWorkspaceTab } from "@/lib/admin-assign-workspace-url";
import { cn } from "@/lib/utils";

interface Props {
  tab: AssignWorkspaceTab;
  unassignedCount: number;
  assignedCount: number;
  exitCounts: AdminExitCounts | null;
  onTabChange: (tab: AssignWorkspaceTab) => void;
}

export function AssignLeadsTabBar({
  tab,
  unassignedCount,
  assignedCount,
  exitCounts,
  onTabChange,
}: Props) {
  const tabs: { id: AssignWorkspaceTab; label: string; count?: number; review?: boolean }[] = [
    { id: "unassigned", label: "Unassigned", count: unassignedCount },
    { id: "assigned", label: "Assigned", count: assignedCount },
    {
      id: "uploader_review",
      label: "Review",
      count: exitCounts?.uploaderReview,
      review: true,
    },
    { id: "closed", label: "Closed", count: exitCounts?.closed },
  ];

  return (
    <div className="flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map(({ id, label, count, review }) => (
        <button
          key={id}
          type="button"
          onClick={() => onTabChange(id)}
          className={cn(
            "border-b-2 px-4 py-2 text-sm font-medium transition-colors -mb-px",
            tab === id
              ? review
                ? "border-red-500 text-red-700"
                : "border-brand text-brand"
              : "border-transparent text-slate-muted hover:text-brand"
          )}
        >
          {label}
          {count != null && count > 0 ? (
            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-600">
              {count.toLocaleString("en-IN")}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
