"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { RevenueReport } from "@/components/admin/reports/RevenueReport";
import { CommissionOverdueReport } from "@/components/admin/reports/CommissionOverdueReport";

type Section = "revenue" | "commission";

export function MuaRevenueReport() {
  const [section, setSection] = useState<Section>("revenue");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {(
          [
            ["revenue", "MUA Revenue"],
            ["commission", "Commission overdue"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              section === id
                ? "bg-brand text-white"
                : "bg-slate-100 text-slate-muted hover:text-brand"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "revenue" ? (
        <RevenueReport
          showCancelledToggle
          deEmphasizeOutstanding
          title="MUA Revenue"
          defaultDateRange={{ mode: "all" }}
        />
      ) : (
        <CommissionOverdueReport apiBase="/api/admin/reports" showAdminFilters />
      )}
    </div>
  );
}
