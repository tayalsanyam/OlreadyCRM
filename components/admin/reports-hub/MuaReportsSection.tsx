"use client";

import { MuaLedgerReport } from "@/components/admin/reports/MuaLedgerReport";
import { MuaRevenueReport } from "@/components/admin/reports/MuaRevenueReport";
import { PlanDeliverablesReport } from "@/components/admin/reports/PlanDeliverablesReport";
import type { AdminReportMuaSubTab } from "@/lib/admin-reports-hub-url";
import { cn } from "@/lib/utils";

const SUB_TABS: { id: AdminReportMuaSubTab; label: string }[] = [
  { id: "ledger", label: "Ledger" },
  { id: "revenue", label: "Revenue & overdue" },
  { id: "planDeliverables", label: "Plan deliverables" },
];

export function MuaReportsSection({
  subTab,
  onSubTabChange,
  ledgerSearch = "",
}: {
  subTab: AdminReportMuaSubTab;
  onSubTabChange: (tab: AdminReportMuaSubTab) => void;
  ledgerSearch?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {SUB_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSubTabChange(id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              subTab === id ? "bg-brand text-white" : "bg-slate-100 text-slate-muted hover:text-brand"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === "ledger" ? (
        <MuaLedgerReport initialSearch={ledgerSearch} />
      ) : subTab === "revenue" ? (
        <MuaRevenueReport />
      ) : (
        <PlanDeliverablesReport />
      )}
    </div>
  );
}
