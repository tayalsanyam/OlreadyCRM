"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CreateOpsTaskSlideOver } from "@/components/admin/CreateOpsTaskSlideOver";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";

type Row = {
  id: string;
  displayId: string;
  title: string;
  status: string;
  assignedTo: string;
  assigneeName: string;
  muaId: string | null;
  muaName: string | null;
  leadId: string | null;
  brideName: string | null;
  dueAt: string | null;
  endRateLabel: string | null;
  completedAt: string | null;
  completionOutcome: string | null;
  createdAt: string;
};

type FollowUpSeed = Pick<
  Row,
  "id" | "title" | "assignedTo" | "muaId" | "leadId"
>;

export function AssignedOpsTasksList({
  refreshKey = 0,
  onFollowUpCreated,
  returnContext,
}: {
  refreshKey?: number;
  onFollowUpCreated?: () => void;
  returnContext?: "admin";
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [followUpSeed, setFollowUpSeed] = useState<FollowUpSeed | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    void fetch("/api/my/ops-tasks?view=assigned")
      .then((r) => r.json())
      .then((j) => setRows(j.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const handleFollowUpCreated = () => {
    load();
    onFollowUpCreated?.();
  };

  const fromQuery = returnContext === "admin" ? "&from=admin" : "";

  if (loading) {
    return <p className="text-sm text-slate-muted">Loading tasks you assigned…</p>;
  }

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-muted">
        No team tasks assigned by you yet.
      </p>
    );
  }

  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");

  return (
    <>
      <div className="space-y-6">
        {pending.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-muted">
              Awaiting completion ({pending.length})
            </h2>
            <TaskTable rows={pending} onFollowUp={setFollowUpSeed} fromQuery={fromQuery} />
          </section>
        )}
        {done.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-muted">
              Completed ({done.length})
            </h2>
            <TaskTable rows={done} showResult onFollowUp={setFollowUpSeed} fromQuery={fromQuery} />
          </section>
        )}
      </div>

      {followUpSeed && (
        <CreateOpsTaskSlideOver
          open={Boolean(followUpSeed)}
          onClose={() => setFollowUpSeed(null)}
          onCreated={handleFollowUpCreated}
          parentTaskId={followUpSeed.id}
          defaultTitle={`Follow-up — ${followUpSeed.title}`}
          defaultAssignedTo={followUpSeed.assignedTo}
          defaultMuaId={followUpSeed.muaId}
          defaultLeadId={followUpSeed.leadId}
        />
      )}
    </>
  );
}

function TaskTable({
  rows,
  showResult = false,
  onFollowUp,
  fromQuery = "",
}: {
  rows: Row[];
  showResult?: boolean;
  onFollowUp: (seed: FollowUpSeed) => void;
  fromQuery?: string;
}) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Task</TH>
          <TH>Assignee</TH>
          <TH>Reference</TH>
          {showResult ? <TH>Result</TH> : <TH>Due</TH>}
          <TH />
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.id}>
            <TD>
              <p className="font-mono text-sm font-medium">{r.displayId}</p>
              <p className="text-sm">{r.title}</p>
            </TD>
            <TD className="text-sm">{r.assigneeName}</TD>
            <TD className="text-xs text-slate-muted">
              {r.muaName && <p>MUA: {r.muaName}</p>}
              {r.brideName && <p>Bride: {r.brideName}</p>}
              {!r.muaName && !r.brideName && "—"}
            </TD>
            {showResult ? (
              <TD className="text-sm">
                {r.endRateLabel && (
                  <Badge variant="success" className="mb-1">
                    {r.endRateLabel}
                  </Badge>
                )}
                {r.completionOutcome && (
                  <p className="text-xs text-slate-muted">{r.completionOutcome}</p>
                )}
                {r.completedAt && (
                  <p className="text-xs text-slate-muted">
                    {formatDate(r.completedAt.slice(0, 10))}
                  </p>
                )}
              </TD>
            ) : (
              <TD className={cn(!r.dueAt && "text-slate-muted")}>
                {r.dueAt ? formatDate(r.dueAt.slice(0, 10)) : "—"}
              </TD>
            )}
            <TD>
              <div className="flex flex-col items-end gap-1">
                <Link
                  href={`/tasks/ops/${r.id}?view=assigned${fromQuery}`}
                  className="text-sm text-accent hover:underline"
                >
                  View
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-auto px-0 py-0 text-xs text-brand"
                  onClick={() =>
                    onFollowUp({
                      id: r.id,
                      title: r.title,
                      assignedTo: r.assignedTo,
                      muaId: r.muaId,
                      leadId: r.leadId,
                    })
                  }
                >
                  Follow up
                </Button>
              </div>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
