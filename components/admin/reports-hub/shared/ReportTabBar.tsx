"use client";

import { ADMIN_REPORT_TABS, type AdminReportTabId } from "@/lib/admin-reports-config";
import { cn } from "@/lib/utils";

export function ReportTabBar({
  tab,
  onTabChange,
}: {
  tab: AdminReportTabId;
  onTabChange: (tab: AdminReportTabId) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-slate-200">
      {ADMIN_REPORT_TABS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onTabChange(id)}
          className={cn(
            "border-b-2 px-4 py-2 text-sm font-medium transition-colors -mb-px",
            tab === id
              ? "border-brand text-brand"
              : "border-transparent text-slate-muted hover:text-brand"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
