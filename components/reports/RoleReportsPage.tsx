"use client";

import { useState } from "react";
import { LeadJourneyReport } from "@/components/admin/reports/LeadJourneyReport";
import { RevenueReport } from "@/components/admin/reports/RevenueReport";
import { MuaLedgerReport } from "@/components/admin/reports/MuaLedgerReport";
import { CommissionOverdueReport } from "@/components/admin/reports/CommissionOverdueReport";
import { CallActivityReport } from "@/components/reports/CallActivityReport";
import { IntakePerformanceReport } from "@/components/reports/IntakePerformanceReport";
import { PerformanceReport } from "@/components/admin/reports-hub/PerformanceReport";
import { cn } from "@/lib/utils";

type Tab = "journey" | "intake" | "performance" | "revenue" | "mua" | "commission" | "calls";

export function RoleReportsPage({
  title,
  subtitle,
  showCommissionOverdue = false,
  hiddenTabs = [],
}: {
  title: string;
  subtitle: string;
  showCommissionOverdue?: boolean;
  hiddenTabs?: Tab[];
}) {
  const visibleTabs = (
    [
      ...(showCommissionOverdue
        ? ([["commission", "Commission overdue"]] as const)
        : []),
      ["journey", "Lead journey"],
      ["intake", "Intake"],
      ["performance", "My performance"],
      ["calls", "Call activity"],
      ["revenue", "Bookings & revenue"],
      ["mua", "MUA activity"],
    ] as const
  ).filter(([id]) => !hiddenTabs.includes(id as Tab));

  const [tab, setTab] = useState<Tab>(
    (visibleTabs[0]?.[0] as Tab) ?? "journey"
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-brand">{title}</h1>
        <p className="text-sm text-slate-muted">{subtitle}</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {visibleTabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id as Tab)}
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

      {tab === "journey" && (
        <LeadJourneyReport apiBase="/api/reports" scoped hideRmFilter />
      )}
      {tab === "intake" && (
        <IntakePerformanceReport apiBase="/api/reports" scoped />
      )}
      {tab === "performance" && (
        <PerformanceReport
          apiBase="/api/reports/performance"
          scoped
          showCustomerSummary={false}
        />
      )}
      {tab === "calls" && <CallActivityReport apiBase="/api/reports" />}
      {tab === "revenue" && (
        <RevenueReport apiBase="/api/reports" scoped hideRmFilter />
      )}
      {tab === "mua" && (
        <MuaLedgerReport apiBase="/api/reports" scoped simplified />
      )}
      {tab === "commission" && showCommissionOverdue && (
        <CommissionOverdueReport apiBase="/api/reports" />
      )}
    </div>
  );
}
