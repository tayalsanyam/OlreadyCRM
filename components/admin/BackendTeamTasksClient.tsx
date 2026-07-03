"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { TASK_TYPE_LABELS, MUA_PUSH_STAGE_LABELS } from "@/lib/types";
import { rowsToCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

type TaskRow = {
  id: string;
  displayId: string;
  title: string;
  taskType: string;
  status: string;
  dueDate: string | null;
  staffName: string;
  staffRole: string;
  staffRegion: string | null;
  leadId: string | null;
  leadName: string | null;
  leadDisplayId: string | null;
  leadRegion: string | null;
  confirmationStatus: string | null;
  muaName: string | null;
  pushStage: string | null;
  overdue: boolean;
  dueToday: boolean;
};

type Stats = {
  pending: number;
  overdue: number;
  dueToday: number;
  byRole: Array<{ role: string; pending: number; overdue: number }>;
};

const TASK_TYPES = [
  "",
  "bride_confirmation",
  "share_profiles",
  "lead_progress_follow_up",
  "follow_up",
  "initial_contact",
  "collect_mua_prospect",
] as const;

const ROLE_LABEL: Record<string, string> = {
  regional_rm: "Regional RM",
  commission_rm: "Commission RM",
};

export function BackendTeamTasksClient() {
  const searchParams = useSearchParams();
  const [stats, setStats] = useState<Stats | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [role, setRole] = useState("");
  const [region, setRegion] = useState("");
  const [taskType, setTaskType] = useState("");
  const [due, setDue] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const r = searchParams.get("role");
    if (r === "regional_rm" || r === "commission_rm") setRole(r);
  }, [searchParams]);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (role) params.set("role", role);
    if (region) params.set("region", region);
    if (taskType) params.set("taskType", taskType);
    if (due !== "all") params.set("due", due);
    if (search.trim()) params.set("search", search.trim());
    void fetch(`/api/admin/tasks/backend-team?${params}`)
      .then((r) => r.json())
      .then((json: { data: { stats: Stats; tasks: TaskRow[] } | null }) => {
        setStats(json.data?.stats ?? null);
        setTasks(json.data?.tasks ?? []);
      })
      .finally(() => setLoading(false));
  }, [role, region, taskType, due, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  function downloadExcel() {
    const headers = [
      "Due date",
      "Due status",
      "Assignee",
      "Role",
      "Region",
      "Task ID",
      "Title",
      "Task type",
      "Lead",
      "Lead ID",
      "Lead region",
      "MUA",
      "Confirmation",
      "Push stage",
      "Status",
    ];
    const body = tasks.map((t) => [
      t.dueDate ?? "",
      t.overdue ? "Overdue" : t.dueToday ? "Due today" : t.dueDate ? "Upcoming" : "",
      t.staffName,
      ROLE_LABEL[t.staffRole] ?? t.staffRole,
      t.staffRegion ?? "",
      t.displayId,
      t.title,
      TASK_TYPE_LABELS[t.taskType as keyof typeof TASK_TYPE_LABELS] ?? t.taskType,
      t.leadName ?? "",
      t.leadDisplayId ?? "",
      t.leadRegion ?? "",
      t.muaName ?? "",
      t.confirmationStatus ?? "",
      t.pushStage
        ? MUA_PUSH_STAGE_LABELS[t.pushStage as keyof typeof MUA_PUSH_STAGE_LABELS] ?? t.pushStage
        : "",
      t.status,
    ]);
    const csv = `\uFEFF${rowsToCsv(headers, body)}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rm-intake-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-muted">
        Open CRM tasks for regional and commission RMs — intake, follow-ups, and confirmations. Sales and
        feedback tasks appear under Team standing.
      </p>
      {stats && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs text-slate-muted">Pending tasks</p>
            <p className="text-2xl font-bold text-brand">{stats.pending}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-muted">Overdue</p>
            <p
              className={cn(
                "text-2xl font-bold",
                stats.overdue > 0 ? "text-red-700" : "text-brand"
              )}
            >
              {stats.overdue}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-slate-muted">Due today</p>
            <p className="text-2xl font-bold text-amber-700">{stats.dueToday}</p>
          </Card>
        </div>
      )}

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap gap-3">
          <Input
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Bride, MUA, task title, RM…"
            className="min-w-[200px] flex-1"
          />
          <label className="text-sm">
            Role
            <select
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="">All</option>
              <option value="regional_rm">Regional RM</option>
              <option value="commission_rm">Commission RM</option>
            </select>
          </label>
          <label className="text-sm">
            Region
            <select
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="">All</option>
              {["north", "east", "west", "south"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Task type
            <select
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
            >
              <option value="">All types</option>
              {TASK_TYPES.filter(Boolean).map((tt) => (
                <option key={tt} value={tt}>
                  {TASK_TYPE_LABELS[tt as keyof typeof TASK_TYPE_LABELS] ?? tt}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Due
            <select
              className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            >
              <option value="all">All</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due today</option>
              <option value="upcoming">Upcoming</option>
            </select>
          </label>
          <div className="flex items-end">
            <Button variant="secondary" size="sm" onClick={downloadExcel} disabled={tasks.length === 0}>
              Download Excel
            </Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold text-brand">
            Backend team tasks {loading ? "…" : `(${tasks.length})`}
          </h3>
          <p className="text-xs text-slate-muted">
            All pending RM and Commission RM tasks — intake, CRM follow-ups, and payment chases
          </p>
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Due</TH>
              <TH>Assignee</TH>
              <TH>Task</TH>
              <TH>Lead / MUA</TH>
              <TH>Stage</TH>
            </TR>
          </THead>
          <TBody>
            {tasks.length === 0 ? (
              <TR>
                <TD colSpan={5} className="py-8 text-center text-slate-muted">
                  No tasks match these filters
                </TD>
              </TR>
            ) : (
              tasks.map((t) => (
                <TR
                  key={t.id}
                  className={cn(t.overdue && "bg-red-50/50")}
                >
                  <TD>
                    {t.dueDate ? (
                      <span
                        className={cn(
                          "text-sm font-medium",
                          t.overdue && "text-red-700",
                          t.dueToday && !t.overdue && "text-amber-700"
                        )}
                      >
                        {t.dueDate}
                      </span>
                    ) : (
                      "—"
                    )}
                    {t.overdue && (
                      <Badge variant="hot" className="ml-1">
                        Overdue
                      </Badge>
                    )}
                  </TD>
                  <TD>
                    <p className="font-medium">{t.staffName}</p>
                    <p className="text-xs text-slate-muted">
                      {ROLE_LABEL[t.staffRole] ?? t.staffRole}
                      {t.staffRegion ? ` · ${t.staffRegion}` : ""}
                    </p>
                  </TD>
                  <TD>
                    <p className="text-sm">{t.title}</p>
                    <p className="text-xs text-slate-muted">
                      {TASK_TYPE_LABELS[t.taskType as keyof typeof TASK_TYPE_LABELS] ??
                        t.taskType}
                    </p>
                  </TD>
                  <TD>
                    {t.leadId && t.leadName ? (
                      <Link
                        href={`/rm/leads/${t.leadId}`}
                        className="text-sm font-medium text-brand hover:underline"
                      >
                        {t.leadName}
                      </Link>
                    ) : (
                      <span className="text-sm text-slate-muted">—</span>
                    )}
                    {t.leadDisplayId && (
                      <p className="text-xs text-slate-muted">{t.leadDisplayId}</p>
                    )}
                    {t.muaName && (
                      <p className="text-xs text-slate-muted">MUA: {t.muaName}</p>
                    )}
                    {t.confirmationStatus && (
                      <Badge variant="muted" className="mt-1">
                        {t.confirmationStatus}
                      </Badge>
                    )}
                  </TD>
                  <TD className="text-sm">
                    {t.pushStage
                      ? MUA_PUSH_STAGE_LABELS[
                          t.pushStage as keyof typeof MUA_PUSH_STAGE_LABELS
                        ] ?? t.pushStage
                      : "—"}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
