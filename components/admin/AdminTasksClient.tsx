"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CareTasksList } from "@/components/grievances/CareTasksList";
import { AdminSupportInquiriesClient } from "@/components/admin/AdminSupportInquiriesClient";
import { AdminOpsTasksClient } from "@/components/admin/AdminOpsTasksClient";
import { AdminTasksOverviewClient } from "@/components/admin/AdminTasksOverviewClient";
import { AdminMyWorkClient } from "@/components/admin/AdminMyWorkClient";
import { BackendTeamTasksClient } from "@/components/admin/BackendTeamTasksClient";
import { Card } from "@/components/ui/Card";

type Tab = "mine" | "team" | "rm" | "assignments" | "care" | "support";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "mine", label: "My work", hint: "Tasks assigned to you" },
  { id: "team", label: "Team standing", hint: "Everyone's open work" },
  { id: "rm", label: "RM intake", hint: "Regional & commission RM queues — filter and export" },
  { id: "assignments", label: "Assignments", hint: "Ops tasks — filter by assignee, assigner, due; export list" },
  { id: "care", label: "All grievance tasks", hint: "Care tasks org-wide" },
  { id: "support", label: "Support inquiries", hint: "Public support follow-ups" },
];

function resolveTab(raw: string | null): Tab {
  if (raw === "mine" || raw === "team" || raw === "rm" || raw === "assignments" || raw === "care" || raw === "support") {
    return raw;
  }
  if (raw === "overview") return "team";
  if (raw === "backendTeam") return "rm";
  if (raw === "ops") return "assignments";
  return "mine";
}

export function AdminTasksClient() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("mine");
  const [opsTaskId, setOpsTaskId] = useState<string | null>(null);
  const opsViewParam = searchParams.get("opsView");
  const initialOpsView =
    opsViewParam === "assigned" || opsViewParam === "mine" || opsViewParam === "all"
      ? opsViewParam
      : "all";

  useEffect(() => {
    setTab(resolveTab(searchParams.get("tab")));
    const id = searchParams.get("id");
    if (id) setOpsTaskId(id);
  }, [searchParams]);

  const active = TABS.find((t) => t.id === tab);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand">Task hub</h1>
        <p className="text-sm text-slate-muted">
          Your work first, then team visibility across CRM, grievance care, support, and assignments.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-2">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === id ? "bg-brand text-white" : "text-slate-muted hover:bg-slate-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {active && (
        <p className="text-xs text-slate-muted">{active.hint}</p>
      )}

      {tab === "mine" && <AdminMyWorkClient />}
      {tab === "team" && <AdminTasksOverviewClient />}
      {tab === "rm" && <BackendTeamTasksClient />}
      {tab === "assignments" && (
        <AdminOpsTasksClient embedded initialSelectedId={opsTaskId} initialOpsView={initialOpsView} />
      )}
      {tab === "care" && (
        <Card className="p-4">
          <p className="mb-4 text-sm text-slate-muted">
            All grievance tasks — reassign to sales, RM, care, or any active employee.
          </p>
          <CareTasksList showScopeToggle defaultScope="all" showReassign linkTickets />
        </Card>
      )}
      {tab === "support" && <AdminSupportInquiriesClient embedded />}
    </div>
  );
}
