"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import {
  AdminTaskItemList,
  type AdminTaskListItem,
} from "@/components/admin/AdminTaskItemList";
import { AdminTaskInspector } from "@/components/admin/AdminTaskActions";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/Select";
import {
  matchesDueFilter,
  type AdminTaskDueFilter,
} from "@/lib/admin-task-filters";

type MinePayload = {
  view?: "open" | "completed";
  pending: number;
  dueToday: number;
  overdue: number;
  tasks: AdminTaskListItem[];
  byKind: Record<AdminTaskListItem["kind"], number>;
};

type WorkView = "open" | "completed";

export function AdminMyWorkClient() {
  const [data, setData] = useState<MinePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [workView, setWorkView] = useState<WorkView>("open");
  const [kindFilter, setKindFilter] = useState<"" | AdminTaskListItem["kind"]>("");
  const [dueFilter, setDueFilter] = useState<AdminTaskDueFilter>("");
  const [userId, setUserId] = useState<string | null>(null);
  const [inspectTask, setInspectTask] = useState<AdminTaskListItem | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (workView === "completed") params.set("view", "completed");
    void fetch(`/api/admin/tasks/mine?${params}`)
      .then((r) => r.json())
      .then((j) => setData(j.data ?? null))
      .finally(() => setLoading(false));
  }, [workView]);

  useEffect(() => {
    load();
    void fetch("/api/auth/session")
      .then((r) => r.json())
      .then((j) => setUserId(j.data?.userId ?? null));
  }, [load]);

  useEffect(() => {
    if (workView === "completed") setDueFilter("");
  }, [workView]);

  const filtered = useMemo(() => {
    const tasks = data?.tasks ?? [];
    return tasks.filter((t) => {
      if (kindFilter && t.kind !== kindFilter) return false;
      if (workView === "open" && !matchesDueFilter(t.dueAt, dueFilter)) return false;
      return true;
    });
  }, [data?.tasks, kindFilter, dueFilter, workView]);

  const grouped = useMemo(() => {
    const groups: Record<AdminTaskListItem["kind"], AdminTaskListItem[]> = {
      crm: [],
      team: [],
      care: [],
      support: [],
    };
    for (const t of filtered) groups[t.kind].push(t);
    return groups;
  }, [filtered]);

  if (loading && !data) {
    return <p className="text-sm text-slate-muted">Loading your tasks…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["open", "Open tasks"],
            ["completed", "Completed tasks"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setWorkView(id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              workView === id ? "bg-brand text-white" : "bg-slate-100 text-slate-muted",
            )}
          >
            {label}
            {id === "open" && (data?.pending ?? 0) > 0 && workView === "open" && ` (${data?.pending})`}
            {id === "completed" && (data?.pending ?? 0) > 0 && workView === "completed" && ` (${data?.pending})`}
          </button>
        ))}
      </div>

      {data && workView === "open" && (
        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="My open tasks" value={data.pending} />
          <StatCard label="Due today" value={data.dueToday} highlight />
          <StatCard label="Overdue" value={data.overdue} danger={data.overdue > 0} />
          <StatCard label="Queues" value={4} sub="CRM · Assignments · Care · Support" />
        </div>
      )}

      {data && workView === "completed" && (
        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Completed tasks" value={data.pending} />
          <StatCard label="CRM" value={data.byKind.crm} />
          <StatCard label="Assignments" value={data.byKind.team} />
          <StatCard label="Care & support" value={data.byKind.care + data.byKind.support} />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2">
        {(
          [
            ["", "All"],
            ["crm", "CRM"],
            ["team", "Assignments"],
            ["care", "Grievance"],
            ["support", "Support"],
          ] as const
        ).map(([id, label]) => {
          const count = id ? (data?.byKind[id] ?? 0) : (data?.pending ?? 0);
          return (
            <button
              key={id || "all"}
              type="button"
              onClick={() => setKindFilter(id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                kindFilter === id ? "bg-brand text-white" : "bg-slate-100 text-slate-muted",
              )}
            >
              {label}
              {count > 0 && ` (${count})`}
            </button>
          );
        })}
        </div>
        {workView === "open" ? (
          <div className="min-w-[160px]">
            <Select
              label="Due"
              value={dueFilter}
              onChange={(e) => setDueFilter(e.target.value as AdminTaskDueFilter)}
              options={[
                { value: "", label: "Any due date" },
                { value: "overdue", label: "Overdue" },
                { value: "today", label: "Due today" },
                { value: "upcoming", label: "Upcoming" },
                { value: "no_date", label: "No due date" },
              ]}
            />
          </div>
        ) : null}
      </div>

      {kindFilter === "" ? (
        <div className="space-y-4">
          {(
            [
              ["crm", "CRM reviews", "/admin/tasks?tab=rm"],
              ["team", "Team assignments", "/admin/tasks?tab=assignments&opsView=mine"],
              ["care", "Grievance tasks", "/admin/tasks?tab=care"],
              ["support", "Support inquiries", "/admin/tasks?tab=support"],
            ] as const
          ).map(([kind, heading, href]) =>
            grouped[kind].length > 0 ? (
              <Card key={kind} className="p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="font-semibold text-brand">{heading}</h2>
                  <Link href={href} className="text-xs text-accent hover:underline">
                    View all
                  </Link>
                </div>
                <AdminTaskItemList
                  tasks={grouped[kind]}
                  currentUserId={userId ?? undefined}
                  onChanged={load}
                  onInspect={setInspectTask}
                  emptyLabel={workView === "completed" ? "No completed tasks." : "No open tasks."}
                  dateLabel={workView === "completed" ? "completed" : "due"}
                />
              </Card>
            ) : null,
          )}
          {(data?.pending ?? 0) === 0 && workView === "open" && (
            <Card className="p-6 text-center text-sm text-slate-muted">
              You have no open tasks. Use{" "}
              <Link href="/admin/tasks?tab=team" className="text-accent hover:underline">
                Team standing
              </Link>{" "}
              to monitor everyone else.
            </Card>
          )}
          {(data?.pending ?? 0) === 0 && workView === "completed" && (
            <Card className="p-6 text-center text-sm text-slate-muted">
              No completed tasks yet.
            </Card>
          )}
          {filtered.length === 0 && (data?.pending ?? 0) > 0 && (
            <Card className="p-6 text-center text-sm text-slate-muted">
              No tasks match the current filters.
            </Card>
          )}
        </div>
      ) : (
        <Card className="p-4">
          <AdminTaskItemList
            tasks={filtered}
            currentUserId={userId ?? undefined}
            onChanged={load}
            onInspect={setInspectTask}
            emptyLabel={workView === "completed" ? "No completed tasks." : "No open tasks."}
            dateLabel={workView === "completed" ? "completed" : "due"}
          />
        </Card>
      )}

      <AdminTaskInspector
        task={inspectTask}
        open={Boolean(inspectTask)}
        onClose={() => setInspectTask(null)}
        currentUserId={userId ?? undefined}
        onChanged={load}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  highlight,
  danger,
}: {
  label: string;
  value: number;
  sub?: string;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase text-slate-muted">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", danger ? "text-red-600" : "text-brand")}>
        {value}
      </p>
      {sub && <p className="mt-1 text-[10px] text-slate-muted">{sub}</p>}
      {highlight && value > 0 && !sub && (
        <p className="mt-1 text-[10px] text-brand">Needs attention today</p>
      )}
    </Card>
  );
}
