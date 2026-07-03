"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { formatDate, cn } from "@/lib/utils";

type CareTaskRow = {
  id: string;
  displayId: string;
  taskType: string;
  title: string;
  ticketId: string;
  ticketNumber: string;
  muaName: string | null;
  dueAt: string | null;
  priority: string;
};

export function RmCareTasksStrip({ className }: { className?: string }) {
  const [rows, setRows] = useState<CareTaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void fetch("/api/crm/care-tasks?scope=mine")
      .then((r) => r.json())
      .then((json) => {
        setRows(json.data ?? []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return null;
  if (rows.length === 0) return null;

  const isOverdue = (dueAt: string | null) =>
    dueAt ? new Date(dueAt).getTime() < Date.now() : false;

  return (
    <div className={cn("rounded-xl border border-violet-200 bg-violet-50/60 p-4", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-brand">Care requests</h2>
          <p className="text-xs text-slate-muted">
            Tasks assigned by the care team — same-day SLA. Full list also under the Care tab.
          </p>
        </div>
        <Link href="/rm/tasks?tab=care" className="text-sm text-brand hover:underline">
          All care tasks
        </Link>
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Task</TH>
            <TH>Ticket</TH>
            <TH>MUA</TH>
            <TH>Due</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id} className={cn(isOverdue(r.dueAt) && "bg-red-50/50")}>
              <TD>
                <div className="font-medium">{r.displayId}</div>
                <div className="text-xs text-slate-muted capitalize">
                  {r.taskType.replace(/_/g, " ")}
                </div>
              </TD>
              <TD>{r.ticketNumber}</TD>
              <TD>{r.muaName ?? "—"}</TD>
              <TD className={cn(isOverdue(r.dueAt) && "font-medium text-red-600")}>
                {r.dueAt ? formatDate(r.dueAt) : "Today"}
              </TD>
              <TD>
                <Link href={`/tasks/care/${r.id}`}>
                  <Button size="sm" variant="secondary">
                    Open
                  </Button>
                </Link>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
