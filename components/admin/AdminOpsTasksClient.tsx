"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { CreateOpsTaskSlideOver } from "@/components/admin/CreateOpsTaskSlideOver";
import { StaffPicker } from "@/components/grievances/StaffPicker";
import { AssignedOpsTasksList } from "@/components/ops/AssignedOpsTasksList";
import { MyOpsTasksList } from "@/components/ops/MyOpsTasksList";
import { OpsTaskCompleteModal } from "@/components/ops/OpsTaskCompleteModal";
import { OpsTaskAttachmentsPanel } from "@/components/ops/OpsTaskAttachmentsPanel";
import { cn, formatDate } from "@/lib/utils";
import { Select } from "@/components/ui/Select";
import { taskDueBucket } from "@/lib/admin-task-filters";
import { rowsToCsv } from "@/lib/csv";

type OpsView = "all" | "assigned" | "mine";

type TaskRow = {
  id: string;
  displayId: string;
  title: string;
  status: string;
  assignedTo: string;
  assigneeName: string;
  assignedBy: string;
  assignedByName: string;
  muaName: string | null;
  brideName: string | null;
  dueAt: string | null;
  endRate: string | null;
  completedAt: string | null;
  completedByName: string | null;
  createdAt: string;
};

type TaskDetail = TaskRow & {
  description: string | null;
  assignedTo: string;
  muaId: string | null;
  muaDisplayId: string | null;
  leadId: string | null;
  brideDisplayId: string | null;
  completionNotes: string | null;
  completionOutcome: string | null;
  endRateLabel: string | null;
  parentDisplayId: string | null;
  followUps: {
    id: string;
    displayId: string;
    status: string;
    assigneeName: string;
    dueAt: string | null;
    endRate: string | null;
    createdAt: string;
  }[];
};

export function AdminOpsTasksClient({
  embedded = false,
  initialSelectedId = null,
  initialOpsView = "all",
}: {
  embedded?: boolean;
  initialSelectedId?: string | null;
  initialOpsView?: OpsView;
}) {
  const { toast } = useToast();
  const [opsView, setOpsView] = useState<OpsView>(initialOpsView);
  const [refreshKey, setRefreshKey] = useState(0);
  const [scope, setScope] = useState<"open" | "all">("open");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [assignerFilter, setAssignerFilter] = useState("");
  const [dueFilter, setDueFilter] = useState("");
  const [staffOptions, setStaffOptions] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [assignTo, setAssignTo] = useState("");
  const [followUpOpenSlide, setFollowUpOpenSlide] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ scope });
    if (assigneeFilter) params.set("assignedTo", assigneeFilter);
    if (assignerFilter) params.set("assignedBy", assignerFilter);
    if (dueFilter) params.set("due", dueFilter);
    void fetch(`/api/admin/ops-tasks?${params}`)
      .then((r) => r.json())
      .then((j) => setRows(j.data ?? []))
      .finally(() => setLoading(false));
  }, [scope, assigneeFilter, assignerFilter, dueFilter]);

  useEffect(() => {
    void fetch("/api/crm/staff")
      .then((r) => r.json())
      .then((j) => setStaffOptions(j.data ?? []));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setOpsView(initialOpsView);
  }, [initialOpsView]);

  useEffect(() => {
    if (initialSelectedId) {
      setOpsView("all");
      loadDetail(initialSelectedId);
    }
  }, [initialSelectedId]);

  const loadDetail = (id: string) => {
    setSelectedId(id);
    void fetch(`/api/admin/ops-tasks/${id}`)
      .then((r) => r.json())
      .then((j) => {
        const d = j.data ?? null;
        setDetail(d);
        if (d?.assignedTo) setAssignTo(d.assignedTo);
      });
  };

  const patchTask = async (body: Record<string, unknown>) => {
    if (!detail) return false;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/ops-tasks/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error ?? "Update failed", "error");
        return false;
      }
      load();
      loadDetail(detail.id);
      return true;
    } finally {
      setSaving(false);
    }
  };

  const submitAssign = async () => {
    const ok = await patchTask({ action: "assign", assignedTo: assignTo });
    if (ok) {
      toast("Reassigned");
      setAssignOpen(false);
    }
  };

  const closeTask = async () => {
    const ok = await patchTask({ action: "close" });
    if (ok) toast("Task closed");
  };

  const isOpen = detail?.status === "pending";

  function downloadExcel() {
    const headers = [
      "Task ID",
      "Title",
      "Status",
      "Assigned by",
      "Assigned to",
      "Due date",
      "Due bucket",
      "MUA",
      "Bride",
      "Created",
    ];
    const body = rows.map((r) => [
      r.displayId,
      r.title,
      r.status,
      r.assignedByName,
      r.assigneeName,
      r.dueAt ? r.dueAt.slice(0, 10) : "",
      taskDueBucket(r.dueAt),
      r.muaName ?? "",
      r.brideName ?? "",
      r.createdAt ? r.createdAt.slice(0, 10) : "",
    ]);
    const csv = `\uFEFF${rowsToCsv(headers, body)}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `assignments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={embedded ? "space-y-4" : "mx-auto max-w-6xl space-y-6"}>
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-brand">Team tasks</h1>
            <p className="mt-1 text-sm text-slate-muted">
              Create tasks for yourself or any employee — link MUA/bride when needed.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>Create task</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", "All team tasks"],
            ["assigned", "Assigned by me"],
            ["mine", "My tasks"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setOpsView(id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium",
              opsView === id ? "bg-brand text-white" : "bg-slate-100 text-slate-700",
            )}
          >
            {label}
          </button>
        ))}
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          Create task
        </Button>
      </div>

      {opsView === "assigned" && (
        <div className="space-y-2">
          <p className="text-sm text-slate-muted">
            Tasks you assigned — track status, end result, completion notes, and assign follow-ups.
          </p>
          <AssignedOpsTasksList refreshKey={refreshKey} returnContext="admin" />
        </div>
      )}

      {opsView === "mine" && (
        <div className="space-y-2">
          <p className="text-sm text-slate-muted">
            Team tasks assigned to you — complete with notes and optional attachments.
          </p>
          <MyOpsTasksList refreshKey={refreshKey} returnContext="admin" />
        </div>
      )}

      {opsView === "all" && (
      <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setScope("open")}
            className={`rounded-md px-3 py-1.5 text-sm ${scope === "open" ? "bg-slate-800 text-white" : "text-slate-muted hover:bg-slate-100"}`}
          >
            Open
          </button>
          <button
            type="button"
            onClick={() => setScope("all")}
            className={`rounded-md px-3 py-1.5 text-sm ${scope === "all" ? "bg-slate-800 text-white" : "text-slate-muted hover:bg-slate-100"}`}
          >
            All
          </button>
        </div>
        <div className="min-w-[180px]">
          <Select
            label="Assigned to"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            options={[
              { value: "", label: "Anyone" },
              ...staffOptions.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </div>
        <div className="min-w-[180px]">
          <Select
            label="Assigned by"
            value={assignerFilter}
            onChange={(e) => setAssignerFilter(e.target.value)}
            options={[
              { value: "", label: "Anyone" },
              ...staffOptions.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </div>
        <div className="min-w-[160px]">
          <Select
            label="Due"
            value={dueFilter}
            onChange={(e) => setDueFilter(e.target.value)}
            options={[
              { value: "", label: "Any" },
              { value: "overdue", label: "Overdue" },
              { value: "today", label: "Due today" },
              { value: "upcoming", label: "Upcoming" },
              { value: "no_date", label: "No due date" },
            ]}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={downloadExcel} disabled={rows.length === 0}>
          Download Excel
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <Card className="overflow-hidden p-0">
          {loading ? (
            <p className="p-4 text-sm text-slate-muted">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-slate-muted">No tasks yet. Create one to get started.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => loadDetail(row.id)}
                    className={cn(
                      "flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-slate-50",
                      selectedId === row.id && "bg-brand/5",
                      taskDueBucket(row.dueAt) === "overdue" && "bg-red-50/40",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{row.displayId}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] uppercase text-slate-600">
                        {row.status}
                      </span>
                    </div>
                    <p className="text-sm font-medium">{row.title}</p>
                    <p className="text-xs text-slate-muted">
                      Assigned by <span className="font-medium text-text">{row.assignedByName}</span>
                      {" · "}to {row.assigneeName}
                      {row.dueAt && ` · due ${formatDate(row.dueAt)}`}
                    </p>
                    {(row.muaName || row.brideName) && (
                      <p className="text-xs text-slate-muted">
                        {row.muaName && `MUA: ${row.muaName}`}
                        {row.muaName && row.brideName && " · "}
                        {row.brideName && `Bride: ${row.brideName}`}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          {!detail ? (
            <p className="text-sm text-slate-muted">Select a task to view completion details.</p>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="font-mono text-sm font-semibold">{detail.displayId}</p>
                {detail.parentDisplayId && (
                  <p className="text-xs text-slate-muted">Follow-up from {detail.parentDisplayId}</p>
                )}
                <p className="text-lg font-medium">{detail.title}</p>
                <p className="text-xs text-slate-muted">
                  {detail.assigneeName} · assigned by {detail.assignedByName}
                  {detail.dueAt && ` · due ${formatDate(detail.dueAt)}`}
                </p>
              </div>

              {detail.description && (
                <div className="rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap">{detail.description}</div>
              )}

              {(detail.muaName || detail.brideName) && (
                <div className="space-y-1 text-sm">
                  {detail.muaName && detail.muaId && (
                    <p>
                      MUA:{" "}
                      <Link href={`/admin/muas/${detail.muaId}`} className="text-brand hover:underline">
                        {detail.muaDisplayId} · {detail.muaName}
                      </Link>
                    </p>
                  )}
                  {detail.brideName && detail.leadId && (
                    <p>
                      Bride:{" "}
                      <Link href={`/rm/leads/${detail.leadId}`} className="text-brand hover:underline">
                        {detail.brideDisplayId} · {detail.brideName}
                      </Link>
                    </p>
                  )}
                </div>
              )}

              {detail.completionNotes && (
                <div className="rounded-lg border border-green-100 bg-green-50 p-3">
                  <p className="text-xs font-semibold uppercase text-green-800">Completion</p>
                  {detail.endRateLabel && (
                    <p className="mt-1 text-sm font-medium text-green-900">End result: {detail.endRateLabel}</p>
                  )}
                  {detail.completionOutcome && (
                    <p className="text-xs text-green-900">Outcome: {detail.completionOutcome}</p>
                  )}
                  <p className="mt-1 whitespace-pre-wrap text-sm text-green-950">{detail.completionNotes}</p>
                  <p className="mt-1 text-xs text-green-800">
                    {detail.completedByName && `${detail.completedByName} · `}
                    {detail.completedAt && formatDate(detail.completedAt)}
                  </p>
                </div>
              )}

              <OpsTaskAttachmentsPanel
                taskId={detail.id}
                canUpload={detail.status === "pending"}
              />

              {detail.followUps.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-muted">Follow-ups</p>
                  <ul className="mt-1 space-y-1">
                    {detail.followUps.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => loadDetail(f.id)}
                          className="text-sm text-brand hover:underline"
                        >
                          {f.displayId}
                        </button>
                        <span className="ml-2 text-xs text-slate-muted">
                          {f.status} · {f.assigneeName}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="secondary" onClick={() => setAssignOpen(true)}>
                  Reassign
                </Button>
                {isOpen && (
                  <Button size="sm" onClick={() => setCompleteOpen(true)}>
                    Complete
                  </Button>
                )}
                {(detail.status === "done" || !isOpen) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setFollowUpOpenSlide(true)}
                  >
                    Assign follow-up
                  </Button>
                )}
                {isOpen && (
                  <Button size="sm" variant="secondary" onClick={() => void closeTask()}>
                    Close
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
      </>
      )}

      <CreateOpsTaskSlideOver
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          load();
          setRefreshKey((k) => k + 1);
          setOpsView("assigned");
        }}
      />

      {detail && followUpOpenSlide && (
        <CreateOpsTaskSlideOver
          open={followUpOpenSlide}
          onClose={() => setFollowUpOpenSlide(false)}
          onCreated={() => {
            load();
            loadDetail(detail.id);
          }}
          parentTaskId={detail.id}
          defaultTitle={`Follow-up — ${detail.title}`}
          defaultMuaId={detail.muaId}
          defaultLeadId={detail.leadId}
          defaultAssignedTo={detail.assignedTo}
        />
      )}

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Reassign task">
        <div className="space-y-4 p-1">
          <StaffPicker value={assignTo} onChange={setAssignTo} allowUnassigned={false} emptyLabel="Select…" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={() => void submitAssign()} disabled={saving || !assignTo}>
              {saving ? "Saving…" : "Reassign"}
            </Button>
          </div>
        </div>
      </Modal>

      {detail && (
        <OpsTaskCompleteModal
          taskId={detail.id}
          displayId={detail.displayId}
          title={detail.title}
          open={completeOpen}
          onClose={() => setCompleteOpen(false)}
          onCompleted={() => {
            load();
            loadDetail(detail.id);
          }}
          apiPath={`/api/admin/ops-tasks/${detail.id}`}
          allowAttachments
        />
      )}
    </div>
  );
}
