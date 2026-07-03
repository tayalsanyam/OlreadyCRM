"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import {
  AdminTaskItemList,
  type AdminTaskListItem,
} from "@/components/admin/AdminTaskItemList";
import { AdminTaskInspector } from "@/components/admin/AdminTaskActions";
import { rowsToCsv } from "@/lib/csv";
import {
  matchesDueFilter,
  taskDueBucket,
  type AdminTaskDueFilter,
} from "@/lib/admin-task-filters";
import { cn } from "@/lib/utils";

type OverviewItem = AdminTaskListItem & {
  assigneeName: string;
};

type StaffRow = {
  id: string;
  name: string;
  role: string;
  pending: number;
  dueToday: number;
  overdue: number;
  tasks: OverviewItem[];
};

type Totals = {
  staffWithWork: number;
  pending: number;
  dueToday: number;
  overdue: number;
};

export function AdminTasksOverviewClient() {
  const searchParams = useSearchParams();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [allStaff, setAllStaff] = useState<{ id: string; name: string; role: string }[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [staffFilter, setStaffFilter] = useState("");
  const [kindFilter, setKindFilter] = useState<"" | AdminTaskListItem["kind"]>("");
  const [dueFilter, setDueFilter] = useState<AdminTaskDueFilter>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [inspectTask, setInspectTask] = useState<AdminTaskListItem | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const qs = staffFilter ? `?staffId=${staffFilter}` : "";
    void fetch(`/api/admin/tasks/overview${qs}`)
      .then((r) => r.json())
      .then((j) => {
        const rows = (j.data?.staff ?? []) as StaffRow[];
        setStaff(rows);
        setAllStaff(j.data?.allStaff ?? []);
        setTotals(j.data?.totals ?? null);
        setSelectedId((prev) => {
          if (staffFilter) return staffFilter;
          if (prev && rows.some((s) => s.id === prev)) return prev;
          const first = rows.find((s) => s.pending > 0);
          return first?.id ?? null;
        });
      })
      .finally(() => setLoading(false));
  }, [staffFilter]);

  useEffect(() => {
    load();
    void fetch("/api/auth/session")
      .then((r) => r.json())
      .then((j) => setUserId(j.data?.userId ?? null));
  }, [load]);

  useEffect(() => {
    const open = searchParams.get("open");
    if (!open?.startsWith("crm:")) return;
    const taskId = open.slice(4);
    for (const row of staff) {
      const task = row.tasks.find((t) => t.kind === "crm" && t.id === taskId);
      if (task) {
        setSelectedId(row.id);
        setInspectTask(task);
        break;
      }
    }
  }, [searchParams, staff]);

  const staffOptions = useMemo(
    () => [
      { value: "", label: "All employees" },
      ...allStaff.map((s) => {
        const row = staff.find((r) => r.id === s.id);
        const n = row?.pending ?? 0;
        return {
          value: s.id,
          label: n > 0 ? `${s.name} (${n} open)` : s.name,
        };
      }),
    ],
    [allStaff, staff],
  );

  const filterTasks = useCallback(
    (tasks: OverviewItem[]) =>
      tasks.filter((t) => {
        if (kindFilter && t.kind !== kindFilter) return false;
        if (!matchesDueFilter(t.dueAt, dueFilter)) return false;
        return true;
      }),
    [kindFilter, dueFilter],
  );

  const selected = staff.find((s) => s.id === selectedId) ?? null;
  const selectedTasks = selected ? filterTasks(selected.tasks) : [];

  const exportRows = useMemo(() => {
    const rows: OverviewItem[] = [];
    for (const s of staff) {
      if (staffFilter && s.id !== staffFilter) continue;
      for (const t of filterTasks(s.tasks)) {
        rows.push({ ...t, assigneeName: s.name });
      }
    }
    return rows.sort((a, b) => {
      const ad = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
      const bd = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
      return ad - bd;
    });
  }, [staff, staffFilter, filterTasks]);

  function downloadExcel() {
    const headers = [
      "Employee",
      "Kind",
      "Task ID",
      "Title",
      "Status",
      "Due date",
      "Due bucket",
      "Assigned by",
      "Details",
    ];
    const body = exportRows.map((t) => [
      t.assigneeName,
      t.kind,
      t.displayId,
      t.title,
      t.status,
      t.dueAt ? t.dueAt.slice(0, 10) : "",
      taskDueBucket(t.dueAt),
      t.assignedByName ?? "",
      t.meta ?? "",
    ]);
    const csv = `\uFEFF${rowsToCsv(headers, body)}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `team-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading && !staff.length) {
    return <p className="text-sm text-slate-muted">Loading task overview…</p>;
  }

  return (
    <div className="space-y-4">
      {totals && (
        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="Open tasks" value={totals.pending} />
          <StatCard label="Due today" value={totals.dueToday} highlight />
          <StatCard label="Overdue" value={totals.overdue} danger={totals.overdue > 0} />
          <StatCard label="Staff with work" value={totals.staffWithWork} />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Select
            label="Employee"
            value={staffFilter}
            onChange={(e) => {
              setStaffFilter(e.target.value);
              setSelectedId(e.target.value || null);
            }}
            options={staffOptions}
          />
        </div>
        <div className="min-w-[160px]">
          <Select
            label="Type"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
            options={[
              { value: "", label: "All types" },
              { value: "crm", label: "CRM" },
              { value: "team", label: "Assignment" },
              { value: "care", label: "Grievance" },
              { value: "support", label: "Support" },
            ]}
          />
        </div>
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
        <Button variant="secondary" size="sm" onClick={downloadExcel} disabled={exportRows.length === 0}>
          Download Excel
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(240px,320px)_1fr]">
        <Card className="max-h-[70vh] overflow-y-auto p-2">
          <p className="px-2 py-1 text-xs font-semibold uppercase text-slate-muted">
            By employee
          </p>
          {staff.filter((s) => filterTasks(s.tasks).length > 0).length === 0 ? (
            <p className="p-4 text-sm text-slate-muted">No open tasks match filters.</p>
          ) : (
            staff
              .filter((s) => filterTasks(s.tasks).length > 0)
              .map((s) => {
                const n = filterTasks(s.tasks).length;
                const overdue = filterTasks(s.tasks).filter(
                  (t) => taskDueBucket(t.dueAt) === "overdue",
                ).length;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      "mb-1 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      selectedId === s.id ? "bg-brand/10 ring-1 ring-brand/30" : "hover:bg-slate-50",
                    )}
                  >
                    <p className="font-medium text-brand">{s.name}</p>
                    <p className="text-xs text-slate-muted capitalize">{s.role.replace(/_/g, " ")}</p>
                    <p className="mt-1 text-xs">
                      {n} open
                      {overdue > 0 && <span className="ml-2 text-red-600">· {overdue} overdue</span>}
                    </p>
                  </button>
                );
              })
          )}
        </Card>

        <Card className="p-4">
          {!selected || selectedTasks.length === 0 ? (
            <p className="text-sm text-slate-muted">Select an employee to see their filtered queue.</p>
          ) : (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-brand">{selected.name}</h2>
              <p className="text-xs text-slate-muted capitalize">
                {selected.role.replace(/_/g, " ")} · {selectedTasks.length} shown
              </p>
              <AdminTaskItemList
                tasks={selectedTasks}
                currentUserId={userId ?? undefined}
                onChanged={load}
                onInspect={setInspectTask}
                openViaInspector
              />
            </div>
          )}
        </Card>
      </div>

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
  highlight,
  danger,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  danger?: boolean;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase text-slate-muted">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold",
          danger ? "text-red-600" : highlight ? "text-brand" : "text-brand",
        )}
      >
        {value}
      </p>
    </Card>
  );
}
