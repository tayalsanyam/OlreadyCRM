"use client";

import { useState } from "react";
import { CareTasksList } from "@/components/grievances/CareTasksList";
import { MySupportInquiriesList } from "@/components/support/MySupportInquiriesList";
import { TeamTasksPanel } from "@/components/ops/TeamTasksPanel";

export function CareTasksPageClient({ isOperator }: { isOperator: boolean }) {
  const [tab, setTab] = useState<"care" | "support" | "team">("care");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand">Care Tasks</h1>
          <p className="text-sm text-slate-muted">
            Grievance tasks and public support follow-ups assigned to you
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("care")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === "care" ? "bg-brand text-white" : "bg-slate-100 text-slate-muted"
            }`}
          >
            Grievance
          </button>
          <button
            type="button"
            onClick={() => setTab("support")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === "support" ? "bg-brand text-white" : "bg-slate-100 text-slate-muted"
            }`}
          >
            Support
          </button>
          <button
            type="button"
            onClick={() => setTab("team")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === "team" ? "bg-brand text-white" : "bg-slate-100 text-slate-muted"
            }`}
          >
            Team
          </button>
        </div>
      </div>

      {tab === "care" ? (
        <CareTasksList showScopeToggle={isOperator} showReassign={isOperator} linkTickets />
      ) : tab === "support" ? (
        <MySupportInquiriesList />
      ) : (
        <TeamTasksPanel />
      )}
    </div>
  );
}
