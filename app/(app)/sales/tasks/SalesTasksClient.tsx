"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import {
  SalesTaskCompleteModal,
  type TaskCompletePayload,
} from "@/components/sales/SalesTaskCompleteModal";
import { StageChangePanel, type StageChangeResult } from "@/components/sales/StageChangePanel";
import { MuaPipelineProfile } from "@/components/sales/MuaPipelineProfile";
import { PipelineQuickContact } from "@/components/sales/PipelineQuickContact";
import { ActivationWizard } from "@/components/activation/ActivationWizard";
import { isActivationSendBackTaskTitle } from "@/lib/sales-activation-send-back-shared";
import { CareTasksList } from "@/components/grievances/CareTasksList";
import { RmCareTasksStrip } from "@/components/grievances/RmCareTasksStrip";
import { MySupportInquiriesList } from "@/components/support/MySupportInquiriesList";
import { TeamTasksPanel } from "@/components/ops/TeamTasksPanel";
import { PIPELINE_STAGE_ORDER, TASK_TYPE_LABELS, type PipelineStage, type Task, type UserRole } from "@/lib/types";
import { salesPipelineMuaTypeLabel, type SalesPipelineMuaType } from "@/lib/sales-pipeline-labels";
import { salesSegmentTheme } from "@/lib/sales-segment-theme";

type TaskRow = Task;

type PendingTaskComplete = TaskCompletePayload & { taskId: string; pipelineId: string; taskType: string };

type TaskTypeFilter =
  | "all"
  | "salesFollowUp"
  | "salesSeniorCall"
  | "salesOnboarding"
  | "salesActivation"
  | "salesAssignRm";

type DueFilter = "all" | "overdue" | "today" | "upcoming";

type StageFilter = "all" | PipelineStage | "none";

type AwaitingSeniorCallRow = {
  id: string;
  muaName: string;
  muaCity?: string | null;
  muaType: string;
  muaPhone?: string | null;
  muaWhatsapp?: string | null;
  stage: PipelineStage;
};

type TaskListItem =
  | { kind: "task"; row: TaskRow }
  | { kind: "awaitingSeniorCall"; row: AwaitingSeniorCallRow };

type TlTaskView = "my" | "teamAllocated";

const TASK_TYPE_FILTERS: Array<{ id: TaskTypeFilter; label: string }> = [
  { id: "all", label: "All types" },
  { id: "salesFollowUp", label: "Follow-up" },
  { id: "salesSeniorCall", label: "Senior call" },
  { id: "salesOnboarding", label: "Onboarding" },
  { id: "salesActivation", label: "Activation" },
  { id: "salesAssignRm", label: "Assign RM" },
];

const DUE_FILTERS: Array<{ id: DueFilter; label: string }> = [
  { id: "all", label: "All due dates" },
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Due today" },
  { id: "upcoming", label: "Upcoming" },
];

function isSalesTask(taskType: string): boolean {
  return taskType.startsWith("sales");
}

async function fetchSalesTasks(): Promise<TaskRow[]> {
  const res = await fetch("/api/tasks", { cache: "no-store" });
  const json = (await res.json()) as { data?: { data?: TaskRow[] } };
  const all = json.data?.data ?? [];
  return all.filter((r) => isSalesTask(r.taskType));
}

function parsePipelineId(title: string): string | null {
  const m = title.match(/\[PIPE:([^\]]+)\]/);
  return m?.[1] ?? null;
}

function taskMuaLabel(r: TaskRow): string {
  if (r.salesPipelineMuaName) return r.salesPipelineMuaName;
  const m = r.title.match(/—\s*(.+?)\s*\[PIPE:/);
  return m?.[1]?.trim() ?? "—";
}

function taskPipelineId(r: TaskRow): string | null {
  return r.salesPipelineId ?? parsePipelineId(r.title);
}

function dueBucket(dueDate: string | null | undefined): DueFilter | "none" {
  if (!dueDate) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "today";
  return "upcoming";
}

function filterPill(active: boolean) {
  return active
    ? "border-brand bg-brand text-white"
    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300";
}

export function SalesTasksClient({ role }: { role: UserRole }) {
  const isActivation = role === "salesActivation";
  const isTl = role === "salesTl";
  const { toast } = useToast();
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [awaitingSeniorCall, setAwaitingSeniorCall] = useState<AwaitingSeniorCallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tlView, setTlView] = useState<TlTaskView>("my");
  const [segment, setSegment] = useState<SalesPipelineMuaType>("candidate");
  const [taskTypeFilter, setTaskTypeFilter] = useState<TaskTypeFilter>("all");
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [search, setSearch] = useState("");
  const [completeTask, setCompleteTask] = useState<TaskRow | null>(null);
  const [profilePipelineId, setProfilePipelineId] = useState<string | null>(null);
  const [profileInitialTab, setProfileInitialTab] = useState<"overview" | "checklists" | undefined>();
  const [activationPipelineId, setActivationPipelineId] = useState<string | null>(null);
  const [modalPipelineStage, setModalPipelineStage] = useState<PipelineStage | null>(null);
  const [pendingComplete, setPendingComplete] = useState<PendingTaskComplete | null>(null);
  const [stagePanelOpen, setStagePanelOpen] = useState(false);
  const [pageTab, setPageTab] = useState<"sales" | "care" | "support" | "team">("sales");

  const load = useCallback(async () => {
    setLoading(true);
    if (isActivation) {
      await fetch("/api/activation/sent-back").catch(() => null);
    }
    const all = await fetchSalesTasks();
    setRows(isActivation ? all.filter((r) => r.taskType === "salesActivation") : all);

    if (role === "salesRm") {
      const pipeRes = await fetch("/api/sales/pipeline?stage=Senior%20Call");
      const pipeJson = (await pipeRes.json()) as {
        data?: Array<{
          id: string;
          muaName: string;
          muaCity?: string | null;
          muaType: string;
          muaPhone?: string | null;
          muaWhatsapp?: string | null;
          stage: PipelineStage;
        }>;
      };
      setAwaitingSeniorCall(
        (pipeJson.data ?? []).map((r) => ({
          id: r.id,
          muaName: r.muaName,
          muaCity: r.muaCity,
          muaType: r.muaType,
          muaPhone: r.muaPhone,
          muaWhatsapp: r.muaWhatsapp,
          stage: r.stage,
        })),
      );
    } else {
      setAwaitingSeniorCall([]);
    }

    setLoading(false);
  }, [isActivation, role]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setTaskTypeFilter("all");
    setDueFilter("all");
    setStageFilter("all");
    setSearch("");
  }, [segment, tlView]);

  const isTeamAllocatedView = isTl && tlView === "teamAllocated";

  const viewRows = useMemo(() => {
    if (!isTl) {
      return rows.filter((r) => r.taskType !== "salesSeniorCall");
    }
    if (tlView === "teamAllocated") {
      return rows.filter((r) => r.taskType === "salesSeniorCall");
    }
    return rows.filter((r) => r.taskType !== "salesSeniorCall");
  }, [rows, isTl, tlView]);

  const tlCounts = useMemo(() => {
    if (!isTl) return { my: 0, teamAllocated: 0 };
    return {
      my: rows.filter((r) => r.taskType !== "salesSeniorCall").length,
      teamAllocated: rows.filter((r) => r.taskType === "salesSeniorCall").length,
    };
  }, [rows, isTl]);

  const segmentRows = useMemo(() => {
    if (isActivation || isTeamAllocatedView) return viewRows;
    return viewRows.filter((r) => r.salesPipelineMuaType === segment);
  }, [viewRows, segment, isActivation, isTeamAllocatedView]);

  const awaitingInSegment = useMemo(() => {
    if (role !== "salesRm" || isTeamAllocatedView) return [];
    return awaitingSeniorCall.filter((p) => p.muaType === segment);
  }, [awaitingSeniorCall, role, segment, isTeamAllocatedView]);

  const typeCounts = useMemo(() => {
    const counts: Record<TaskTypeFilter, number> = {
      all: segmentRows.length,
      salesFollowUp: 0,
      salesSeniorCall: 0,
      salesOnboarding: 0,
      salesActivation: 0,
      salesAssignRm: 0,
    };
    for (const r of segmentRows) {
      if (r.taskType in counts) counts[r.taskType as TaskTypeFilter] += 1;
    }
    return counts;
  }, [segmentRows]);

  const dueCounts = useMemo(() => {
    const counts = { all: segmentRows.length, overdue: 0, today: 0, upcoming: 0 };
    for (const r of segmentRows) {
      const bucket = dueBucket(r.dueDate);
      if (bucket === "overdue" || bucket === "today" || bucket === "upcoming") counts[bucket] += 1;
    }
    return counts;
  }, [segmentRows]);

  const stageCounts = useMemo(() => {
    const counts = new Map<StageFilter, number>();
    counts.set("all", segmentRows.length);
    let none = 0;
    for (const r of segmentRows) {
      const stage = r.salesPipelineStage;
      if (!stage) {
        none += 1;
        continue;
      }
      counts.set(stage, (counts.get(stage) ?? 0) + 1);
    }
    if (none > 0) counts.set("none", none);

    if (role === "salesRm" && !isTeamAllocatedView) {
      const taskPipelineIds = new Set(
        segmentRows.map((r) => taskPipelineId(r)).filter((id): id is string => Boolean(id)),
      );
      let awaitingSenior = 0;
      for (const p of awaitingInSegment) {
        if (taskPipelineIds.has(p.id)) continue;
        awaitingSenior += 1;
        counts.set("Senior Call", (counts.get("Senior Call") ?? 0) + 1);
      }
      if (awaitingSenior > 0) {
        counts.set("all", (counts.get("all") ?? 0) + awaitingSenior);
      }
    }

    return counts;
  }, [segmentRows, role, isTeamAllocatedView, awaitingInSegment]);

  const stageFilterOptions = useMemo(() => {
    const withTasks = PIPELINE_STAGE_ORDER.filter((s) => (stageCounts.get(s) ?? 0) > 0);
    return withTasks;
  }, [stageCounts]);

  const filteredRows = useMemo(() => {
    let next = [...segmentRows];
    if (taskTypeFilter !== "all") next = next.filter((r) => r.taskType === taskTypeFilter);
    if (dueFilter !== "all") {
      next = next.filter((r) => dueBucket(r.dueDate) === dueFilter);
    }
    if (stageFilter !== "all") {
      next = next.filter((r) =>
        stageFilter === "none" ? !r.salesPipelineStage : r.salesPipelineStage === stageFilter,
      );
    }
    const q = search.trim().toLowerCase();
    if (q) {
      next = next.filter((r) => {
        const hay = [taskMuaLabel(r), r.title, r.salesPipelineMuaCity, r.salesPipelineStage, r.displayId]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    next.sort((a, b) => {
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return ad - bd;
    });
    return next;
  }, [segmentRows, taskTypeFilter, dueFilter, stageFilter, search]);

  const listItems = useMemo((): TaskListItem[] => {
    const items: TaskListItem[] = filteredRows.map((row) => ({ kind: "task", row }));
    if (role !== "salesRm" || isTeamAllocatedView) return items;
    if (taskTypeFilter !== "all" || dueFilter !== "all") return items;
    if (stageFilter !== "all" && stageFilter !== "Senior Call") return items;

    const q = search.trim().toLowerCase();
    const existing = new Set(items.map((i) => (i.kind === "task" ? taskPipelineId(i.row) : i.row.id)));

    for (const row of awaitingInSegment) {
      if (existing.has(row.id)) continue;
      if (q) {
        const hay = [row.muaName, row.muaCity, row.stage].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) continue;
      }
      items.push({ kind: "awaitingSeniorCall", row });
    }

    return items;
  }, [
    filteredRows,
    role,
    isTeamAllocatedView,
    taskTypeFilter,
    dueFilter,
    stageFilter,
    search,
    awaitingInSegment,
  ]);

  const segmentTheme = salesSegmentTheme(segment);

  function clearFilters() {
    setTaskTypeFilter("all");
    setDueFilter("all");
    setStageFilter("all");
    setSearch("");
  }

  const activeFilterSummary = isActivation
    ? [
        stageFilter !== "all"
          ? stageFilter === "none"
            ? "No linked stage"
            : `Stage: ${stageFilter}`
          : null,
        dueFilter !== "all" ? DUE_FILTERS.find((f) => f.id === dueFilter)?.label : null,
        search.trim() ? `Search: “${search.trim()}”` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "All activation tasks"
    : isTeamAllocatedView
      ? [
          stageFilter !== "all"
            ? stageFilter === "none"
              ? "No linked stage"
              : `Stage: ${stageFilter}`
            : null,
          dueFilter !== "all" ? DUE_FILTERS.find((f) => f.id === dueFilter)?.label : null,
          search.trim() ? `Search: “${search.trim()}”` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "All senior call tasks"
      : [
        salesSegmentTheme(segment).label,
        taskTypeFilter !== "all" ? TASK_TYPE_FILTERS.find((f) => f.id === taskTypeFilter)?.label : null,
        stageFilter !== "all"
          ? stageFilter === "none"
            ? "No linked stage"
            : `Stage: ${stageFilter}`
          : null,
        dueFilter !== "all" ? DUE_FILTERS.find((f) => f.id === dueFilter)?.label : null,
        search.trim() ? `Search: “${search.trim()}”` : null,
      ]
        .filter(Boolean)
        .join(" · ");

  async function submitComplete(
    taskId: string,
    task: TaskRow,
    payload: TaskCompletePayload & { skipFollowUpSchedule?: boolean },
  ): Promise<boolean> {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "done",
        note: payload.note,
        nextFollowUpDate: payload.nextFollowUpDate ?? null,
        stageChangeTo: payload.stageChangeTo ?? null,
        stageChangeNote: payload.stageChangeNote ?? null,
        skipFollowUpSchedule: payload.skipFollowUpSchedule ?? false,
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      toast(err.error ?? "Could not complete task", "error");
      return false;
    }
    toast("Task completed");
    setCompleteTask(null);
    await load();
    return true;
  }

  function openOnboardingChecklists(task: TaskRow) {
    const pipelineId = taskPipelineId(task);
    if (!pipelineId) {
      toast("Could not link task to pipeline", "error");
      return;
    }
    setProfilePipelineId(pipelineId);
    setProfileInitialTab("checklists");
  }

  function openActivationSendBackChecklists(task: TaskRow) {
    openOnboardingChecklists(task);
  }

  function isSendBackTask(task: TaskRow): boolean {
    return isActivationSendBackTaskTitle(task.title) || Boolean(task.activationSentBack);
  }

  function handleRequireStagePanel(payload: TaskCompletePayload) {
    if (!completeTask) return;
    const pipelineId = taskPipelineId(completeTask);
    if (!pipelineId) {
      toast("Could not link task to pipeline", "error");
      return;
    }
    setPendingComplete({ taskId: completeTask.id, pipelineId, taskType: completeTask.taskType, ...payload });
    setStagePanelOpen(true);
    setCompleteTask(null);
  }

  async function handleStagePanelDone(result?: StageChangeResult) {
    if (!pendingComplete) return;
    const pipelineId = pendingComplete.pipelineId;
    const ok = await submitComplete(
      pendingComplete.taskId,
      { id: pendingComplete.taskId, taskType: pendingComplete.taskType } as TaskRow,
      {
      note: pendingComplete.note,
      skipFollowUpSchedule: true,
    },
    );
    setPendingComplete(null);
    setStagePanelOpen(false);
    if (!ok) {
      toast("Stage updated but task completion failed — try completing the task again", "error");
    }
    if (result?.toStage === "Onboarding" && pipelineId) {
      setProfilePipelineId(pipelineId);
      setProfileInitialTab("checklists");
    }
    void load();
  }

  useEffect(() => {
    const pipelineId = completeTask ? taskPipelineId(completeTask) : null;
    if (!pipelineId) {
      setModalPipelineStage(null);
      return;
    }
    void fetch(`/api/sales/pipeline/${pipelineId}`)
      .then((r) => r.json())
      .then((j: { data?: { pipeline?: { stage?: PipelineStage } } }) => {
        setModalPipelineStage(j.data?.pipeline?.stage ?? null);
      })
      .catch(() => setModalPipelineStage(null));
  }, [completeTask]);

  const completePipelineId = completeTask ? taskPipelineId(completeTask) : null;
  const pendingPipelineId = pendingComplete?.pipelineId ?? null;

  const [stagePanelCurrentStage, setStagePanelCurrentStage] = useState<PipelineStage | null>(null);
  const [stagePanelLoading, setStagePanelLoading] = useState(false);

  useEffect(() => {
    if (!stagePanelOpen || !pendingPipelineId) {
      setStagePanelCurrentStage(null);
      setStagePanelLoading(false);
      return;
    }
    setStagePanelLoading(true);
    void fetch(`/api/sales/pipeline/${pendingPipelineId}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { data?: { pipeline?: { stage?: PipelineStage } }; error?: string };
        if (!r.ok) throw new Error(j.error ?? "Pipeline not found");
        setStagePanelCurrentStage(j.data?.pipeline?.stage ?? null);
      })
      .catch((e: Error) => {
        setStagePanelCurrentStage(null);
        toast(e.message ?? "Pipeline not found — refresh the task list", "error");
        setStagePanelOpen(false);
        setPendingComplete(null);
      })
      .finally(() => setStagePanelLoading(false));
  }, [stagePanelOpen, pendingPipelineId, toast]);

  const seniorLocked = (taskType: string) =>
    taskType === "salesSeniorCall" && role === "salesRm";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand">{isActivation ? "Activation Tasks" : "Sales Tasks"}</h1>
          <p className="text-sm text-slate-muted">
            {pageTab === "care"
              ? "Care tasks assigned to you from the Grievance Centre."
              : pageTab === "support"
                ? "Public /support follow-ups assigned to you."
                : pageTab === "team"
                  ? "Tasks assigned to you by admin or ops."
              : isActivation
              ? "Activation work assigned after training or contract reminders."
              : isTl
                ? "Your follow-ups, or senior calls allocated from your team’s pipeline."
                : "Complete follow-ups and open the linked MUA profile."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setPageTab("sales")}
              className={`rounded-md px-3 py-1 text-sm font-medium ${
                pageTab === "sales" ? "bg-white text-brand shadow-sm" : "text-slate-muted"
              }`}
            >
              Sales
            </button>
            <button
              type="button"
              onClick={() => setPageTab("care")}
              className={`rounded-md px-3 py-1 text-sm font-medium ${
                pageTab === "care" ? "bg-white text-brand shadow-sm" : "text-slate-muted"
              }`}
            >
              Care
            </button>
            <button
              type="button"
              onClick={() => setPageTab("support")}
              className={`rounded-md px-3 py-1 text-sm font-medium ${
                pageTab === "support" ? "bg-white text-brand shadow-sm" : "text-slate-muted"
              }`}
            >
              Support
            </button>
            <button
              type="button"
              onClick={() => setPageTab("team")}
              className={`rounded-md px-3 py-1 text-sm font-medium ${
                pageTab === "team" ? "bg-white text-brand shadow-sm" : "text-slate-muted"
              }`}
            >
              Team
            </button>
          </div>
          {pageTab === "sales" && (
            <Button variant="secondary" onClick={() => void load()}>Refresh</Button>
          )}
        </div>
      </div>

      {pageTab === "care" ? (
        <CareTasksList linkTickets={false} />
      ) : null}

      {pageTab === "support" ? <MySupportInquiriesList /> : null}

      {pageTab === "team" ? <TeamTasksPanel /> : null}

      {pageTab === "sales" && isTl ? (
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
          <button
            type="button"
            onClick={() => setTlView("my")}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
              tlView === "my" ? "border border-b-white border-slate-200 bg-white text-brand" : "text-slate-600 hover:text-brand"
            }`}
          >
            My tasks ({tlCounts.my})
          </button>
          <button
            type="button"
            onClick={() => setTlView("teamAllocated")}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
              tlView === "teamAllocated"
                ? "border border-b-white border-slate-200 bg-white text-brand"
                : "text-slate-600 hover:text-brand"
            }`}
          >
            Team allocated tasks ({tlCounts.teamAllocated})
          </button>
        </div>
      ) : null}

      {pageTab === "sales" && isTl && tlView === "my" && tlCounts.teamAllocated > 0 ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
          <span className="font-semibold">
            {tlCounts.teamAllocated} senior call task{tlCounts.teamAllocated === 1 ? "" : "s"}
          </span>{" "}
          from your team need your attention.{" "}
          <button
            type="button"
            className="font-semibold text-indigo-800 underline hover:text-indigo-950"
            onClick={() => setTlView("teamAllocated")}
          >
            Open Team allocated tasks
          </button>
        </div>
      ) : null}

      {pageTab === "sales" && (
        <>
      <RmCareTasksStrip className="mb-4" />
      {isActivation ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Task filters</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {DUE_FILTERS.map((df) => (
              <button
                key={df.id}
                type="button"
                onClick={() => setDueFilter(df.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${filterPill(dueFilter === df.id)}`}
              >
                {df.label}
                {df.id !== "all" ? ` (${dueCounts[df.id]})` : ` (${dueCounts.all})`}
              </button>
            ))}
          </div>
          <label className="mb-3 block text-xs text-slate-600">
            <span className="mb-1 block font-medium text-slate-700">Pipeline stage</span>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value as StageFilter)}
              className="w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-brand"
            >
              <option value="all">All stages ({stageCounts.get("all") ?? 0})</option>
              {stageFilterOptions.map((s) => (
                <option key={s} value={s}>
                  {s} ({stageCounts.get(s) ?? 0})
                </option>
              ))}
              {(stageCounts.get("none") ?? 0) > 0 ? (
                <option value="none">No linked stage ({stageCounts.get("none")})</option>
              ) : null}
            </select>
          </label>
          <Input
            placeholder="Search MUA, task title, stage…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <p className="mt-2 text-xs text-slate-muted">
            Showing {filteredRows.length} of {rows.length} activation tasks
          </p>
        </div>
      ) : (
        <>
          {isTeamAllocatedView ? (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Team allocated</p>
              <p className="text-lg font-bold text-indigo-950">Senior call tasks</p>
              <p className="mt-1 text-xs text-indigo-900">
                Allocated to you from your team&apos;s pipeline — all segments in one list.
              </p>
            </div>
          ) : (
            <div className={`rounded-xl border p-4 ${segmentTheme.banner}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Pipeline segment</p>
                  <p className="text-lg font-bold text-brand">{segmentTheme.label}</p>
                  <p className="text-xs text-slate-muted">{segmentTheme.subtitle}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSegment("candidate")}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                      segment === "candidate" ? segmentTheme.pillActive : "border-teal-200 bg-white text-teal-900 hover:border-teal-400"
                    }`}
                  >
                    Potential
                  </button>
                  <button
                    type="button"
                    onClick={() => setSegment("renewal")}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                      segment === "renewal" ? segmentTheme.pillActive : "border-amber-200 bg-white text-amber-900 hover:border-amber-400"
                    }`}
                  >
                    Renewal
                  </button>
                  <button
                    type="button"
                    onClick={() => setSegment("re_engage")}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                      segment === "re_engage" ? segmentTheme.pillActive : "border-violet-200 bg-white text-violet-900 hover:border-violet-400"
                    }`}
                  >
                    Re-engage
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-600">{segmentTheme.hint}</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">{isTeamAllocatedView ? "Senior calls" : "Tasks in segment"}</p>
              <p className="text-2xl font-bold text-brand">{segmentRows.length}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">Due today</p>
              <p className="text-2xl font-bold text-brand">{dueCounts.today}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">Overdue</p>
              <p className="text-2xl font-bold text-brand">{dueCounts.overdue}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Task filters</p>
              <Button size="sm" variant="secondary" onClick={clearFilters}>
                Reset
              </Button>
            </div>
            <div className="mb-2 flex flex-wrap gap-2">
              {!isTeamAllocatedView
                ? TASK_TYPE_FILTERS.filter(
                    (tf) => !(isTl && tlView === "my" && tf.id === "salesSeniorCall"),
                  ).map((tf) => (
                    <button
                      key={tf.id}
                      type="button"
                      onClick={() => setTaskTypeFilter(tf.id)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${filterPill(taskTypeFilter === tf.id)}`}
                    >
                      {tf.label}
                      {tf.id === "all" ? ` (${typeCounts.all})` : ` (${typeCounts[tf.id]})`}
                    </button>
                  ))
                : null}
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {DUE_FILTERS.map((df) => (
                <button
                  key={df.id}
                  type="button"
                  onClick={() => setDueFilter(df.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${filterPill(dueFilter === df.id)}`}
                >
                  {df.label}
                  {df.id === "all" ? ` (${dueCounts.all})` : ` (${dueCounts[df.id]})`}
                </button>
              ))}
            </div>
            <label className="mb-3 block text-xs text-slate-600">
              <span className="mb-1 block font-medium text-slate-700">Pipeline stage</span>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as StageFilter)}
                className="w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-brand"
              >
                <option value="all">All stages ({stageCounts.get("all") ?? 0})</option>
                {stageFilterOptions.map((s) => (
                  <option key={s} value={s}>
                    {s} ({stageCounts.get(s) ?? 0})
                  </option>
                ))}
                {(stageCounts.get("none") ?? 0) > 0 ? (
                  <option value="none">No linked stage ({stageCounts.get("none")})</option>
                ) : null}
              </select>
            </label>
            <Input
              placeholder="Search MUA, task title, city, stage…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <p className="mt-2 text-xs text-slate-muted">
              Showing {listItems.length} of {stageCounts.get("all") ?? segmentRows.length} items · {activeFilterSummary}
            </p>
          </div>
        </>
      )}

      {loading ? (
        <p className="text-sm text-slate-muted">Loading tasks…</p>
      ) : listItems.length === 0 ? (
        <p className="rounded-lg border border-slate-200 p-4 text-sm text-slate-muted">
          {rows.length === 0
            ? isActivation
              ? "No pending activation tasks."
              : "No pending sales tasks."
            : isTl && tlView === "teamAllocated"
              ? "No senior call tasks allocated to you right now."
              : isTl && tlView === "my"
                ? "No personal follow-ups in this segment."
                : `No tasks match the current filters (${activeFilterSummary}).`}
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>MUA</TH>
              <TH>Stage</TH>
              <TH>Task</TH>
              <TH>Due</TH>
              <TH>Contact</TH>
              <TH className="text-right">Action</TH>
            </TR>
          </THead>
          <TBody>
            {listItems.map((item) => {
              if (item.kind === "awaitingSeniorCall") {
                const p = item.row;
                const segmentLabel = salesPipelineMuaTypeLabel(p.muaType);
                return (
                  <TR key={`awaiting-${p.id}`} className="bg-indigo-50/40">
                    <TD>
                      <button
                        type="button"
                        className="text-left font-medium text-accent hover:underline"
                        onClick={() => setProfilePipelineId(p.id)}
                      >
                        {p.muaName}
                      </button>
                      <p className="text-xs text-slate-muted">
                        {[p.muaCity, segmentLabel].filter(Boolean).join(" · ")}
                      </p>
                    </TD>
                    <TD>
                      <Badge variant="muted">{p.stage}</Badge>
                    </TD>
                    <TD>
                      <p className="text-sm text-text">Awaiting TL senior call</p>
                      <p className="text-xs text-slate-muted">With your team lead — no action needed on your task list</p>
                    </TD>
                    <TD>—</TD>
                    <TD>
                      <PipelineQuickContact
                        pipelineId={p.id}
                        muaName={p.muaName}
                        muaPhone={p.muaPhone}
                        muaWhatsapp={p.muaWhatsapp}
                        muaCity={p.muaCity}
                        stage={p.stage}
                        variant="compact"
                        onLogged={load}
                      />
                    </TD>
                    <TD className="text-right">
                      <Button size="sm" variant="secondary" onClick={() => setProfilePipelineId(p.id)}>
                        View
                      </Button>
                    </TD>
                  </TR>
                );
              }

              const r = item.row;
              const pipelineId = taskPipelineId(r);
              const overdue = r.dueDate && new Date(r.dueDate) < new Date(new Date().toDateString());
              const muaName = taskMuaLabel(r);
              const segmentLabel = r.salesPipelineMuaType
                ? salesPipelineMuaTypeLabel(r.salesPipelineMuaType)
                : null;
              return (
                <TR key={r.id}>
                  <TD>
                    {pipelineId ? (
                      <button
                        type="button"
                        className="text-left font-medium text-accent hover:underline"
                        onClick={() =>
                          isActivation
                            ? setActivationPipelineId(pipelineId)
                            : setProfilePipelineId(pipelineId)
                        }
                      >
                        {muaName}
                      </button>
                    ) : (
                      <p className="font-medium text-text">{muaName}</p>
                    )}
                    <p className="text-xs text-slate-muted">
                      {[r.salesPipelineMuaCity, segmentLabel].filter(Boolean).join(" · ") || r.displayId}
                    </p>
                  </TD>
                  <TD>
                    {r.salesPipelineStage ? (
                      <Badge variant="muted">{r.salesPipelineStage}</Badge>
                    ) : pipelineId ? (
                      <span className="text-xs text-amber-700">Pipeline missing</span>
                    ) : (
                      <span className="text-xs text-slate-muted">—</span>
                    )}
                  </TD>
                  <TD>
                    <p className="text-sm text-text">
                      {TASK_TYPE_LABELS[r.taskType as keyof typeof TASK_TYPE_LABELS] ?? r.taskType}
                    </p>
                    <p className="text-xs text-slate-muted line-clamp-2">{r.title}</p>
                    {isSendBackTask(r) && r.activationSentBackNote ? (
                      <p className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-950 line-clamp-3">
                        <span className="font-medium">Reason:</span> {r.activationSentBackNote}
                      </p>
                    ) : null}
                  </TD>
                  <TD className={overdue ? "font-semibold text-red-600" : ""}>
                    {r.dueDate ? new Date(r.dueDate).toLocaleDateString("en-IN") : "—"}
                  </TD>
                  <TD>
                    {pipelineId ? (
                      <PipelineQuickContact
                        pipelineId={pipelineId}
                        muaName={muaName}
                        muaPhone={r.salesPipelineMuaPhone}
                        muaWhatsapp={r.salesPipelineMuaWhatsapp}
                        muaCity={r.salesPipelineMuaCity}
                        stage={r.salesPipelineStage ?? "Untouched"}
                        variant="compact"
                        onLogged={load}
                      />
                    ) : (
                      <span className="text-xs text-slate-muted">—</span>
                    )}
                  </TD>
                  <TD className="text-right">
                    {r.taskType === "salesOnboarding" ? (
                      <Button size="sm" onClick={() => openOnboardingChecklists(r)}>
                        Open checklists
                      </Button>
                    ) : isSendBackTask(r) ? (
                      <Button size="sm" onClick={() => openActivationSendBackChecklists(r)}>
                        Open training
                      </Button>
                    ) : isActivation && r.taskType === "salesActivation" ? (
                      <Button
                        size="sm"
                        onClick={() => pipelineId && setActivationPipelineId(pipelineId)}
                        disabled={!pipelineId}
                      >
                        Open activation
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => setCompleteTask(r)} disabled={seniorLocked(r.taskType)}>
                        {seniorLocked(r.taskType) ? "TL only" : "Complete"}
                      </Button>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

        </>
      )}

      <SalesTaskCompleteModal
        open={Boolean(completeTask) && completeTask?.taskType !== "salesOnboarding" && !isSendBackTask(completeTask ?? ({} as TaskRow))}
        title={completeTask?.title ?? ""}
        taskType={completeTask?.taskType ?? ""}
        pipelineId={completePipelineId}
        currentStage={modalPipelineStage}
        muaName={completeTask?.salesPipelineMuaName}
        muaPhone={completeTask?.salesPipelineMuaPhone}
        muaWhatsapp={completeTask?.salesPipelineMuaWhatsapp}
        muaCity={completeTask?.salesPipelineMuaCity}
        locked={completeTask ? seniorLocked(completeTask.taskType) : false}
        hideStageChange={
          completeTask
            ? isSendBackTask(completeTask) && completeTask.salesPipelineStage === "Deal Closed"
            : false
        }
        onClose={() => setCompleteTask(null)}
        onConfirm={(payload) => submitComplete(completeTask!.id, completeTask!, payload)}
        onRequireStagePanel={handleRequireStagePanel}
      />

      {stagePanelLoading ? (
        <p className="rounded-lg border border-slate-200 p-4 text-sm text-slate-muted">
          Loading stage form…
        </p>
      ) : null}

      {pendingComplete && pendingPipelineId && stagePanelCurrentStage ? (
        <StageChangePanel
          open={stagePanelOpen}
          onClose={() => {
            setStagePanelOpen(false);
            setPendingComplete(null);
          }}
          pipelineId={pendingPipelineId}
          currentStage={stagePanelCurrentStage}
          prefill={pendingComplete.stageChangeTo}
          lockStage
          initialNote={pendingComplete.stageChangeNote ?? ""}
          initialNextTouch={pendingComplete.nextFollowUpDate ?? ""}
          panelTitle={`Complete task — move to ${pendingComplete.stageChangeTo}`}
          submitLabel="Update stage & complete task"
          onDone={(result) => void handleStagePanelDone(result)}
        />
      ) : null}

      {!isActivation ? (
        <MuaPipelineProfile
          open={Boolean(profilePipelineId)}
          pipelineId={profilePipelineId}
          initialTab={profileInitialTab}
          onClose={() => {
            setProfilePipelineId(null);
            setProfileInitialTab(undefined);
          }}
          onPipelineUpdated={() => void load()}
        />
      ) : null}

      {isActivation ? (
        <ActivationWizard
          open={Boolean(activationPipelineId)}
          onClose={() => setActivationPipelineId(null)}
          pipelineId={activationPipelineId ?? ""}
          onDone={() => {
            setActivationPipelineId(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
