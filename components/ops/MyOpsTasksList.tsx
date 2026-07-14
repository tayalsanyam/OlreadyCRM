"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { OpsTaskCompleteModal } from "@/components/ops/OpsTaskCompleteModal";
import {
  isUploaderReverifyTaskTitle,
  uploaderReverifyLeadUrl,
} from "@/lib/uploader-reverify-task";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  displayId: string;
  title: string;
  status: string;
  muaName: string | null;
  brideName: string | null;
  leadId: string | null;
  dueAt: string | null;
  assignedByName: string;
  createdAt: string;
};

type TaskGroup = "overdue" | "today" | "upcoming";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function taskGroup(dueAt: string | null): TaskGroup {
  if (!dueAt) return "upcoming";
  const due = startOfDay(new Date(dueAt));
  const today = startOfDay(new Date());
  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "today";
  return "upcoming";
}

function dueLabel(dueAt: string | null): { text: string; className: string } {
  if (!dueAt) return { text: "—", className: "text-slate-muted" };
  const due = startOfDay(new Date(dueAt));
  const today = startOfDay(new Date());
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) {
    return {
      text: `Overdue ${Math.abs(diff)}d`,
      className: "font-semibold text-red-600",
    };
  }
  if (diff === 0) return { text: "Today", className: "font-medium text-brand" };
  if (diff === 1) return { text: "Tomorrow", className: "text-slate-muted" };
  return { text: `In ${diff}d`, className: "text-slate-muted" };
}

const GROUP_LABEL: Record<TaskGroup, string> = {
  overdue: "Overdue",
  today: "Due Today",
  upcoming: "Upcoming",
};

const GROUP_ORDER: TaskGroup[] = ["overdue", "today", "upcoming"];

export function MyOpsTasksList({
  refreshKey = 0,
  returnContext,
  onCompleted,
}: {
  refreshKey?: number;
  returnContext?: "admin";
  onCompleted?: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [completeTask, setCompleteTask] = useState<Row | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void fetch("/api/my/ops-tasks")
      .then((r) => r.json())
      .then((j) => setRows(j.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const grouped = useMemo(() => {
    const map: Record<TaskGroup, Row[]> = {
      overdue: [],
      today: [],
      upcoming: [],
    };
    for (const row of rows) {
      map[taskGroup(row.dueAt)].push(row);
    }
    return map;
  }, [rows]);

  const fromQuery = returnContext === "admin" ? "?from=admin" : "";

  if (loading) {
    return <p className="text-sm text-slate-muted">Loading team tasks…</p>;
  }

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-muted">No team tasks assigned to you.</p>;
  }

  return (
    <>
      <div className="space-y-6">
        {GROUP_ORDER.map((group) => {
          const list = grouped[group];
          if (list.length === 0) return null;
          return (
            <section key={group} className="space-y-2">
              <h2
                className={cn(
                  "text-sm font-semibold uppercase tracking-wide",
                  group === "overdue" ? "text-red-600" : "text-slate-muted",
                )}
              >
                {GROUP_LABEL[group]} ({list.length})
              </h2>
              <Table>
                <THead>
                  <TR>
                    <TH>Task</TH>
                    <TH>Reference</TH>
                    <TH>From</TH>
                    <TH>Due</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {list.map((r) => {
                    const due = dueLabel(r.dueAt);
                    const reverifyTask =
                      Boolean(r.leadId) && isUploaderReverifyTaskTitle(r.title);
                    const openHref = reverifyTask
                      ? uploaderReverifyLeadUrl(r.leadId!)
                      : `/tasks/ops/${r.id}${fromQuery}`;
                    const openLabel = reverifyTask ? "Re-verify lead" : "Open";
                    return (
                      <TR
                        key={r.id}
                        className={cn(group === "overdue" && "bg-red-50/40")}
                      >
                        <TD>
                          <p className="font-mono text-sm font-medium">{r.displayId}</p>
                          <p className="text-sm">{r.title}</p>
                        </TD>
                        <TD className="text-xs text-slate-muted">
                          {r.muaName && <p>MUA: {r.muaName}</p>}
                          {r.brideName && <p>Bride: {r.brideName}</p>}
                          {!r.muaName && !r.brideName && "—"}
                        </TD>
                        <TD className="text-xs">{r.assignedByName}</TD>
                        <TD className={due.className}>{due.text}</TD>
                        <TD>
                          <div className="flex flex-col items-end gap-1">
                            <Link
                              href={openHref}
                              className="text-sm text-accent hover:underline"
                            >
                              {openLabel}
                            </Link>
                            {!reverifyTask && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-auto px-0 py-0 text-xs font-medium text-brand"
                                onClick={() => setCompleteTask(r)}
                              >
                                Complete
                              </Button>
                            )}
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </section>
          );
        })}
      </div>

      {completeTask && (
        <OpsTaskCompleteModal
          taskId={completeTask.id}
          displayId={completeTask.displayId}
          title={completeTask.title}
          open={Boolean(completeTask)}
          onClose={() => setCompleteTask(null)}
          onCompleted={() => {
            load();
            onCompleted?.();
            setCompleteTask(null);
          }}
          apiPath={`/api/my/ops-tasks/${completeTask.id}`}
          allowAttachments
        />
      )}
    </>
  );
}
