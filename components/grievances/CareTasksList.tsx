"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { GrievanceTaskCompleteModal } from "@/components/grievances/GrievanceTaskCompleteModal";
import { StaffPicker } from "@/components/grievances/StaffPicker";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { pendingEmailPartyLabel } from "@/lib/pending-email-approvals-types";
import { raisedByTypeLabel } from "@/lib/ticket-display";
import { formatDate, cn } from "@/lib/utils";

type CareTaskRow = {
  id: string;
  displayId: string;
  taskType: string;
  status: string;
  priority: string;
  title: string;
  ticketId: string;
  ticketNumber: string;
  raisedByType: string;
  raisedByName: string | null;
  brideName: string | null;
  muaName: string | null;
  assigneeName: string | null;
  dueAt: string | null;
};

const TASK_TYPE_OPTIONS = [
  { value: "", label: "All task types" },
  { value: "gather_data", label: "Gather data" },
  { value: "call_back", label: "Call back" },
  { value: "send_email", label: "Send email" },
  { value: "draft_response", label: "Draft response" },
  { value: "admin_review", label: "Admin review" },
  { value: "attach_ledger", label: "Attach ledger" },
  { value: "attach_contract", label: "Attach contract" },
  { value: "verify_lead", label: "Verify lead" },
  { value: "attach_proof", label: "Attach proof" },
  { value: "rm_input", label: "RM input" },
  { value: "sales_input", label: "Sales input" },
  { value: "rm_mua_resolution", label: "RM MUA resolution" },
];

function partyLabel(row: CareTaskRow): string {
  return pendingEmailPartyLabel({
    raisedByType: row.raisedByType,
    raisedByName: row.raisedByName,
    muaName: row.muaName,
    brideName: row.brideName,
  });
}

export function CareTasksList({
  detailPath = "/care/grievances",
  linkTickets = true,
  showScopeToggle = false,
  showReassign = false,
  defaultScope = "mine",
}: {
  detailPath?: string;
  linkTickets?: boolean;
  showScopeToggle?: boolean;
  showReassign?: boolean;
  defaultScope?: "mine" | "all";
}) {
  const [rows, setRows] = useState<CareTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [completeTask, setCompleteTask] = useState<CareTaskRow | null>(null);
  const [reassignTask, setReassignTask] = useState<CareTaskRow | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const { toast } = useToast();
  const [scope, setScope] = useState<"mine" | "all">(defaultScope);
  const [priority, setPriority] = useState("");
  const [taskType, setTaskType] = useState("");
  const [raisedByType, setRaisedByType] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ scope });
    if (priority) params.set("priority", priority);
    if (taskType) params.set("taskType", taskType);
    if (raisedByType) params.set("raisedByType", raisedByType);
    if (overdueOnly) params.set("overdue", "true");
    void fetch(`/api/crm/care-tasks?${params}`)
      .then((r) => r.json())
      .then((json) => {
        setRows(json.data ?? []);
        setLoading(false);
      });
  }, [scope, priority, taskType, raisedByType, overdueOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const isOverdue = (dueAt: string | null) =>
    dueAt ? new Date(dueAt).getTime() < Date.now() : false;

  const submitReassign = async () => {
    if (!reassignTask) return;
    setReassigning(true);
    try {
      const res = await fetch(`/api/crm/care-tasks/${reassignTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedTo: reassignTo || null }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Reassign failed", "error");
        return;
      }
      toast("Task reassigned");
      setReassignTask(null);
      setReassignTo("");
      load();
    } finally {
      setReassigning(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-3">
        {showScopeToggle && (
          <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5">
            {(["mine", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm capitalize",
                  scope === s ? "bg-brand text-white" : "text-slate-muted hover:bg-slate-50"
                )}
              >
                {s === "mine" ? "My tasks" : "All tasks"}
              </button>
            ))}
          </div>
        )}
        <Select
          value={taskType}
          onChange={(e) => setTaskType(e.target.value)}
          options={TASK_TYPE_OPTIONS}
        />
        <Select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          options={[
            { value: "", label: "All priorities" },
            { value: "critical", label: "Critical" },
            { value: "high", label: "High" },
            { value: "normal", label: "Normal" },
            { value: "low", label: "Low" },
          ]}
        />
        <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5">
          {(
            [
              ["", "All parties"],
              ["mua", "MUA"],
              ["bride", "Bride"],
              ["other", "Other"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value || "all-party"}
              type="button"
              onClick={() => setRaisedByType(value)}
              className={cn(
                "rounded-md px-3 py-1 text-sm",
                raisedByType === value
                  ? "bg-brand text-white"
                  : "text-slate-muted hover:bg-slate-50"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-muted">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
          />
          Overdue only
        </label>
        <Button variant="secondary" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>Task</TH>
            <TH>Ticket</TH>
            <TH>Party</TH>
            <TH>Type</TH>
            <TH>Case</TH>
            <TH>Priority</TH>
            <TH>Due</TH>
            {showScopeToggle && <TH>Assignee</TH>}
            <TH />
          </TR>
        </THead>
        <TBody>
          {loading ? (
            <TR>
              <TD colSpan={showScopeToggle ? 9 : 8} className="text-center text-slate-muted">
                Loading…
              </TD>
            </TR>
          ) : rows.length === 0 ? (
            <TR>
              <TD colSpan={showScopeToggle ? 9 : 8} className="text-center text-slate-muted">
                No care tasks match filters
              </TD>
            </TR>
          ) : (
            rows.map((r) => (
              <TR key={r.id} className={cn(isOverdue(r.dueAt) && "bg-red-50/40")}>
                <TD className="font-medium">{r.displayId}</TD>
                <TD>
                  {linkTickets ? (
                    <Link href={`${detailPath}/${r.ticketId}`} className="text-brand hover:underline">
                      {r.ticketNumber}
                    </Link>
                  ) : (
                    <span className="text-brand">{r.ticketNumber}</span>
                  )}
                </TD>
                <TD className="text-sm">{partyLabel(r)}</TD>
                <TD className="capitalize text-xs">{r.taskType.replace(/_/g, " ")}</TD>
                <TD>
                  <Badge variant="muted">{raisedByTypeLabel(r.raisedByType)}</Badge>
                </TD>
                <TD>
                  <Badge
                    variant={
                      r.priority === "critical" || r.priority === "high" ? "critical" : "muted"
                    }
                  >
                    {r.priority}
                  </Badge>
                </TD>
                <TD className={cn(isOverdue(r.dueAt) && "font-medium text-red-600")}>
                  {r.dueAt ? formatDate(r.dueAt) : "—"}
                </TD>
                {showScopeToggle && <TD className="text-xs">{r.assigneeName ?? "Unassigned"}</TD>}
                <TD>
                  <div className="flex gap-2">
                    <Link
                      href={`/tasks/care/${r.id}`}
                      className="text-sm text-accent hover:underline"
                    >
                      View
                    </Link>
                    {r.status !== "done" && r.status !== "cancelled" && (
                      <Button size="sm" variant="secondary" onClick={() => setCompleteTask(r)}>
                        Complete
                      </Button>
                    )}
                    {showReassign && r.status !== "done" && r.status !== "cancelled" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setReassignTask(r);
                          setReassignTo("");
                        }}
                      >
                        Reassign
                      </Button>
                    )}
                  </div>
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      {completeTask && (
        <GrievanceTaskCompleteModal
          taskId={completeTask.id}
          taskType={completeTask.taskType}
          title={completeTask.title}
          open={Boolean(completeTask)}
          onClose={() => setCompleteTask(null)}
          onCompleted={load}
        />
      )}

      <Modal
        open={Boolean(reassignTask)}
        onClose={() => setReassignTask(null)}
        title={`Reassign ${reassignTask?.displayId ?? ""}`}
      >
        <div className="space-y-4 p-1">
          <p className="text-sm text-slate-muted">{reassignTask?.title}</p>
          <StaffPicker value={reassignTo} onChange={setReassignTo} label="Assign to any employee" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReassignTask(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitReassign()} disabled={reassigning || !reassignTo}>
              {reassigning ? "Saving…" : "Reassign"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
