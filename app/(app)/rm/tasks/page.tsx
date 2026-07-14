"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  TaskCompleteModal,
  type TaskCompletePayload,
} from "@/components/tasks/TaskCompleteModal";
import { ExpiredFeedbackModal } from "@/components/leads/ExpiredFeedbackModal";
import { RmTaskList } from "@/components/tasks/RmTaskList";
import { RmTaskFilters } from "@/components/tasks/RmTaskFilters";
import { CareTasksList } from "@/components/grievances/CareTasksList";
import { RmCareTasksStrip } from "@/components/grievances/RmCareTasksStrip";
import { MySupportInquiriesList } from "@/components/support/MySupportInquiriesList";
import { TeamTasksPanel } from "@/components/ops/TeamTasksPanel";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { Task } from "@/lib/types";
import { isIntakeTaskType } from "@/lib/lead-intake-config";
import {
  defaultRmTaskFilters,
  filterRmTasks,
  isRmCrmTaskType,
  type RmTaskFilterState,
} from "@/lib/rm-task-filters";
import type { PaginatedResult } from "@/db/index";

type TasksTab = "crm" | "intake" | "care" | "support" | "team";

export default function TasksPage() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [completeTask, setCompleteTask] = useState<Task | null>(null);
  const [tab, setTab] = useState<TasksTab>("crm");
  const [intakeFilters, setIntakeFilters] = useState<RmTaskFilterState>(defaultRmTaskFilters);
  const [crmFilters, setCrmFilters] = useState<RmTaskFilterState>(defaultRmTaskFilters);

  const [careTaskCount, setCareTaskCount] = useState(0);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "care" || t === "support" || t === "team" || t === "crm" || t === "intake") {
      setTab(t);
    }
  }, [searchParams]);

  useEffect(() => {
    void fetch("/api/crm/care-tasks?scope=mine")
      .then((r) => r.json())
      .then((json) => setCareTaskCount((json.data ?? []).length));
  }, [tab]);

  const teamView = searchParams.get("teamView") === "assigned" ? "assigned" : "mine";

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/tasks", { cache: "no-store" });
    const json = (await res.json()) as { data: PaginatedResult<Task> | null };
    setTasks(json.data?.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const intakeTasks = useMemo(
    () => tasks.filter((t) => isIntakeTaskType(t.taskType)),
    [tasks]
  );
  const crmTasks = useMemo(
    () => tasks.filter((t) => isRmCrmTaskType(t.taskType)),
    [tasks]
  );

  useEffect(() => {
    if (intakeTasks.length > 0 && !searchParams.get("tab")) {
      setTab("intake");
    }
  }, [intakeTasks.length, searchParams]);

  const filteredIntakeTasks = useMemo(
    () => filterRmTasks(intakeTasks, intakeFilters, "intake"),
    [intakeTasks, intakeFilters]
  );
  const filteredCrmTasks = useMemo(
    () => filterRmTasks(crmTasks, crmFilters, "crm"),
    [crmTasks, crmFilters]
  );

  const intakeFiltersActive =
    intakeFilters.search.trim() !== "" ||
    intakeFilters.dueFilter !== "all" ||
    intakeFilters.taskTypeFilter !== "all" ||
    intakeFilters.confirmationFilter !== "all";

  const crmFiltersActive =
    crmFilters.search.trim() !== "" ||
    crmFilters.dueFilter !== "all" ||
    crmFilters.taskTypeFilter !== "all" ||
    crmFilters.stageFilter !== "all" ||
    crmFilters.regionFilter !== "all";

  const duplicateMuaTaskIds = useMemo(() => {
    const byKey = new Map<string, Task[]>();
    for (const t of crmTasks) {
      if (!t.leadId || !t.muaName) continue;
      const key = `${t.leadId}:${t.muaName}`;
      const list = byKey.get(key) ?? [];
      list.push(t);
      byKey.set(key, list);
    }
    const ids = new Set<string>();
    for (const list of byKey.values()) {
      if (list.length < 2) continue;
      list.slice(1).forEach((t) => ids.add(t.id));
    }
    return ids;
  }, [crmTasks]);

  async function submitComplete(
    taskId: string,
    payload: TaskCompletePayload
  ): Promise<boolean> {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "done",
        note: payload.note,
        completionMode: payload.completionMode,
        closeOutcome: payload.closeOutcome,
        stage: payload.stage,
        nextFollowUpDate: payload.nextFollowUpDate,
        prospectInsta: payload.prospectInsta,
        prospectPhone: payload.prospectPhone,
        prospectCity: payload.prospectCity,
        referralName: payload.referralName,
        referralPhone: payload.referralPhone,
        intakeOutcome: payload.intakeOutcome,
        commissionRmId: payload.commissionRmId,
        notInterestedMode: payload.notInterestedMode,
        intakeConfirmation: payload.intakeConfirmation,
        financialUpdates: payload.financialUpdates,
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      toast(
        err.error ??
          (res.status === 409
            ? "Another task is already open for this MUA. Complete it first."
            : "Could not complete task"),
        "error"
      );
      return false;
    }
    toast("Task completed");
    setCompleteTask(null);
    await load();
    return true;
  }

  const tabBtn = (id: TasksTab, label: string, count?: number) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
        tab === id ? "bg-brand text-white" : "bg-slate-100 text-slate-muted"
      }`}
    >
      {label}
      {count != null && count > 0 ? ` (${count})` : ""}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-brand">My Tasks</h1>
        <div className="flex flex-wrap items-center gap-2">
          {(tab === "crm" || tab === "intake") && (
            <Button variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          )}
          {tabBtn("intake", "Intake", intakeTasks.length)}
          {tabBtn("crm", "CRM", crmTasks.length + careTaskCount)}
          {tabBtn("care", "Care", careTaskCount)}
          {tabBtn("support", "Support")}
          {tabBtn("team", "Team")}
        </div>
      </div>

      {tab === "care" ? <CareTasksList linkTickets={false} /> : null}
      {tab === "support" ? <MySupportInquiriesList /> : null}
      {tab === "team" ? <TeamTasksPanel initialView={teamView} /> : null}

      {tab === "intake" && (
        <div className="space-y-4">
          <RmTaskFilters
            mode="intake"
            tasks={intakeTasks}
            filteredCount={filteredIntakeTasks.length}
            filters={intakeFilters}
            onChange={setIntakeFilters}
          />
          <RmTaskList
            tasks={filteredIntakeTasks}
            loading={loading}
            duplicateMuaTaskIds={new Set()}
            onComplete={setCompleteTask}
            onContactLogged={load}
            showStageColumn={false}
            filtersActive={intakeFiltersActive}
            emptyLabel="No intake tasks — confirmation, share profiles, and follow-ups appear here."
          />
        </div>
      )}

      {tab === "crm" && duplicateMuaTaskIds.size > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          You have more than one open task for the same MUA on a lead. Complete the
          earliest task first — newer duplicates cannot be completed until you do.
        </p>
      )}

      {tab === "crm" && (
        <div className="space-y-4">
          <RmCareTasksStrip />
          <RmTaskFilters
            mode="crm"
            tasks={crmTasks}
            filteredCount={filteredCrmTasks.length}
            filters={crmFilters}
            onChange={setCrmFilters}
          />
          <RmTaskList
            tasks={filteredCrmTasks}
            loading={loading}
            duplicateMuaTaskIds={duplicateMuaTaskIds}
            onComplete={setCompleteTask}
            onContactLogged={load}
            filtersActive={crmFiltersActive}
          />
        </div>
      )}

      {(tab === "crm" || tab === "intake") &&
        completeTask &&
        completeTask.taskType === "feedbackFollowUp" &&
        completeTask.leadId && (
          <ExpiredFeedbackModal
            open
            leadId={completeTask.leadId}
            brideName={completeTask.leadName ?? completeTask.title}
            onClose={() => setCompleteTask(null)}
            onSubmitted={() => {
              toast("Feedback logged");
              setCompleteTask(null);
              void load();
            }}
          />
        )}

      {(tab === "crm" || tab === "intake") &&
        completeTask &&
        completeTask.taskType !== "feedbackFollowUp" && (
        <TaskCompleteModal
          task={completeTask}
          onConfirm={(payload) => submitComplete(completeTask.id, payload)}
          onClose={() => setCompleteTask(null)}
        />
      )}
    </div>
  );
}
