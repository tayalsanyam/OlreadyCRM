"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { LeadQuickContact } from "@/components/leads/LeadQuickContact";
import { MuaQuickContact } from "@/components/muas/MuaQuickContact";
import type { Task } from "@/lib/types";
import { MUA_PUSH_STAGE_LABELS, TASK_TYPE_LABELS } from "@/lib/types";
import { INTAKE_MIN_PROFILES, isIntakeTaskType } from "@/lib/lead-intake-config";
import {
  formatEventsBudgetLine,
  formatMuasOfferedLine,
  getLeadStatusLabel,
} from "@/lib/lead-status";
import {
  daysToEventClass,
  formatEventDateShort,
  formatRelative,
} from "@/lib/lead-display";
import { taskRequiresPushCompletion } from "@/lib/task-utils";
import { cn } from "@/lib/utils";

type TaskGroup = "overdue" | "today" | "upcoming";

type LeadTaskGroup = {
  leadId: string | null;
  tasks: Task[];
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function taskGroup(dueDate: string | null): TaskGroup {
  if (!dueDate) return "upcoming";
  const due = startOfDay(new Date(dueDate));
  const today = startOfDay(new Date());
  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "today";
  return "upcoming";
}

function dueLabel(dueDate: string | null): { text: string; className: string } {
  if (!dueDate) return { text: "—", className: "text-slate-muted" };
  const due = startOfDay(new Date(dueDate));
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
  return { text: `${diff}d`, className: "text-slate-muted" };
}

function taskLeadContext(task: Task) {
  return {
    status: task.leadStatus ?? "assigned",
    bookedEventCount: task.bookedEventCount ?? 0,
    openEventCount: task.openEventCount ?? 0,
    eventLabels: task.eventLabels,
    budgetAmount: task.budgetAmount ?? null,
    muasOfferedCount: task.muasOfferedCount ?? 0,
    muasOfferedNames: task.muasOfferedNames,
  };
}

function groupTasksByLead(tasks: Task[]): LeadTaskGroup[] {
  const byLead = new Map<string, Task[]>();
  const orphans: Task[] = [];

  for (const task of tasks) {
    if (!task.leadId) {
      orphans.push(task);
      continue;
    }
    const list = byLead.get(task.leadId) ?? [];
    list.push(task);
    byLead.set(task.leadId, list);
  }

  const groups: LeadTaskGroup[] = orphans.map((task) => ({
    leadId: null,
    tasks: [task],
  }));

  for (const [leadId, leadTasks] of byLead) {
    leadTasks.sort((a, b) => {
      const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      if (aDue !== bDue) return aDue - bDue;
      return a.title.localeCompare(b.title);
    });
    groups.push({ leadId, tasks: leadTasks });
  }

  groups.sort((a, b) => {
    const minDue = (list: Task[]) =>
      Math.min(...list.map((t) => (t.dueDate ? new Date(t.dueDate).getTime() : Infinity)));
    return minDue(a.tasks) - minDue(b.tasks);
  });

  return groups;
}

const GROUP_LABEL: Record<TaskGroup, string> = {
  overdue: "Overdue",
  today: "Due Today",
  upcoming: "Upcoming",
};

const GROUP_ORDER: TaskGroup[] = ["overdue", "today", "upcoming"];

function LeadCells({
  task,
  onContactLogged,
}: {
  task: Task;
  onContactLogged?: () => void;
}) {
  return (
    <>
      {task.leadId ? (
        <Link
          href={`/rm/leads/${task.leadId}`}
          className="text-sm font-medium text-accent hover:underline"
        >
          {task.leadName ?? "Lead"}
        </Link>
      ) : (
        <span className="text-sm text-slate-muted">—</span>
      )}
      {task.leadId && (
        <div className="mt-1">
          <LeadQuickContact
            leadId={task.leadId}
            brideName={task.leadName ?? "Lead"}
            phone={task.leadPhone}
            city={task.leadCity}
            variant="compact"
            templatePool="rmBride"
            onLogged={onContactLogged}
          />
        </div>
      )}
      {task.brideDisplayId && (
        <p className="font-mono text-[10px] text-slate-muted">{task.brideDisplayId}</p>
      )}
      {task.leadCity && <p className="text-xs text-slate-muted">{task.leadCity}</p>}
    </>
  );
}

function EventCells({ task }: { task: Task }) {
  if (!task.eventDate) {
    return <span className="text-sm text-slate-muted">—</span>;
  }
  return (
    <>
      {formatEventDateShort(task.eventDate)}
      {task.daysToEvent != null && (
        <span className="block text-xs text-slate-muted">{task.daysToEvent}d to event</span>
      )}
    </>
  );
}

function DetailsCells({
  task,
  intake,
  leadCtx,
}: {
  task: Task;
  intake: boolean;
  leadCtx: ReturnType<typeof taskLeadContext>;
}) {
  return (
    <>
      <span className="line-clamp-2">
        {formatEventsBudgetLine(leadCtx as Parameters<typeof formatEventsBudgetLine>[0])}
      </span>
      <p className="mt-1 text-[11px] font-medium text-text">{getLeadStatusLabel(leadCtx)}</p>
      {intake && (
        <p className="mt-0.5 text-[11px] text-slate-muted">
          {task.confirmationStatus === "confirmed" ? "Confirmed" : "Pending"} ·{" "}
          {task.activeDistinctMuas ?? 0}/{INTAKE_MIN_PROFILES} profiles
        </p>
      )}
      {!intake && (task.muasOfferedCount ?? 0) > 0 && (
        <p className="mt-0.5 line-clamp-2 text-[11px]">
          {formatMuasOfferedLine(leadCtx as Parameters<typeof formatMuasOfferedLine>[0])}
        </p>
      )}
    </>
  );
}

function TaskContactCell({
  task,
  intake,
  onContactLogged,
}: {
  task: Task;
  intake: boolean;
  onContactLogged?: () => void;
}) {
  if (task.leadId && intake) {
    return (
      <LeadQuickContact
        leadId={task.leadId}
        brideName={task.leadName ?? "Lead"}
        phone={task.leadPhone}
        city={task.leadCity}
        variant="compact"
        templatePool="rmBride"
        onLogged={onContactLogged}
      />
    );
  }
  if (task.muaId && task.muaName) {
    return (
      <MuaQuickContact
        muaId={task.muaId}
        muaName={task.muaName}
        muaPhone={task.muaPhone}
        muaWhatsapp={task.muaWhatsapp}
        muaCity={task.muaCity}
        variant="compact"
        onLogged={onContactLogged}
      />
    );
  }
  if (task.leadId) {
    return (
      <LeadQuickContact
        leadId={task.leadId}
        brideName={task.leadName ?? "Lead"}
        phone={task.leadPhone}
        city={task.leadCity}
        variant="compact"
        onLogged={onContactLogged}
      />
    );
  }
  return <span className="text-xs text-slate-muted">—</span>;
}

function TaskActionCells({
  task,
  showStageColumn,
  duplicateMuaTaskIds,
  onComplete,
  onContactLogged,
}: {
  task: Task;
  showStageColumn: boolean;
  duplicateMuaTaskIds: Set<string>;
  onComplete: (task: Task) => void;
  onContactLogged?: () => void;
}) {
  const due = dueLabel(task.dueDate);
  const pushFlow = taskRequiresPushCompletion(
    task.taskType,
    task.pushId,
    task.title
  );
  const shareBlocked =
    task.taskType === "shareProfiles" &&
    (task.activeDistinctMuas ?? 0) < INTAKE_MIN_PROFILES;
  const isDuplicate = duplicateMuaTaskIds.has(task.id);
  const intake = isIntakeTaskType(task.taskType);

  return (
    <>
      <TD className="align-top">
        <Badge variant="muted">{TASK_TYPE_LABELS[task.taskType] ?? task.taskType}</Badge>
        <p className="mt-1 text-sm font-medium text-text line-clamp-2">{task.title}</p>
        <p className="font-mono text-[10px] text-slate-muted">{task.displayId}</p>
        {task.muaName && (
          <p className="mt-1 text-xs text-slate-muted">MUA: {task.muaName}</p>
        )}
        {isDuplicate && (
          <p className="mt-1 text-xs font-medium text-amber-800">
            Complete the other task for this MUA first
          </p>
        )}
        {shareBlocked && (
          <p className="mt-1 text-xs font-medium text-brand">
            Auto-completes at {INTAKE_MIN_PROFILES} profiles
          </p>
        )}
      </TD>
      {showStageColumn ? (
        <TD className="align-top">
          {pushFlow && task.pushStage ? (
            <span className="text-sm text-text">{MUA_PUSH_STAGE_LABELS[task.pushStage]}</span>
          ) : (
            <span className="text-sm text-slate-muted">—</span>
          )}
        </TD>
      ) : null}
      <TD className="align-top text-xs text-slate-muted whitespace-nowrap">
        {formatRelative(task.lastActivityAt)}
      </TD>
      <TD className="align-top whitespace-nowrap">
        <TaskContactCell task={task} intake={intake} onContactLogged={onContactLogged} />
      </TD>
      <TD className={cn("align-top", due.className)}>{due.text}</TD>
      <TD className="align-top">
        <Button
          size="sm"
          disabled={isDuplicate || shareBlocked}
          onClick={() => onComplete(task)}
        >
          Mark done
        </Button>
      </TD>
    </>
  );
}

function FullTaskRow({
  task,
  showStageColumn,
  duplicateMuaTaskIds,
  onComplete,
  onContactLogged,
}: {
  task: Task;
  showStageColumn: boolean;
  duplicateMuaTaskIds: Set<string>;
  onComplete: (task: Task) => void;
  onContactLogged?: () => void;
}) {
  const leadCtx = taskLeadContext(task);
  const intake = isIntakeTaskType(task.taskType);

  return (
    <TR>
      <TD className="align-top">
        <LeadCells task={task} onContactLogged={onContactLogged} />
        {task.muaName && (
          <p className="mt-1 text-xs text-slate-muted">MUA: {task.muaName}</p>
        )}
      </TD>
      <TD className={cn("align-top whitespace-nowrap", daysToEventClass(task.daysToEvent))}>
        <EventCells task={task} />
      </TD>
      <TD className="max-w-[200px] align-top text-xs leading-snug text-slate-muted">
        <DetailsCells task={task} intake={intake} leadCtx={leadCtx} />
      </TD>
      <TaskActionCells
        task={task}
        showStageColumn={showStageColumn}
        duplicateMuaTaskIds={duplicateMuaTaskIds}
        onComplete={onComplete}
        onContactLogged={onContactLogged}
      />
    </TR>
  );
}

function LeadTaskGroupRows({
  tasks,
  showStageColumn,
  duplicateMuaTaskIds,
  onComplete,
  onContactLogged,
  expanded,
  onToggle,
}: {
  tasks: Task[];
  showStageColumn: boolean;
  duplicateMuaTaskIds: Set<string>;
  onComplete: (task: Task) => void;
  onContactLogged?: () => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const leadTask = tasks[0];
  const leadCtx = taskLeadContext(leadTask);
  const intake = tasks.some((t) => isIntakeTaskType(t.taskType));
  const intakeTask = tasks.find((t) => isIntakeTaskType(t.taskType)) ?? leadTask;
  const colSpan = showStageColumn ? 6 : 5;

  return (
    <Fragment>
      <TR className="bg-slate-50/60">
        <TD className="align-top">
          <div className="flex items-start gap-1.5">
            <button
              type="button"
              onClick={onToggle}
              className="mt-0.5 shrink-0 text-slate-muted hover:text-brand"
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse tasks" : "Expand tasks"}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
            <div className="min-w-0">
              <LeadCells task={leadTask} onContactLogged={onContactLogged} />
              <Badge variant="muted" className="mt-1.5">
                {tasks.length} tasks
              </Badge>
            </div>
          </div>
        </TD>
        <TD className={cn("align-top whitespace-nowrap", daysToEventClass(leadTask.daysToEvent))}>
          <EventCells task={leadTask} />
        </TD>
        <TD className="max-w-[200px] align-top text-xs leading-snug text-slate-muted">
          <DetailsCells task={intakeTask} intake={intake} leadCtx={leadCtx} />
        </TD>
        <TD colSpan={colSpan} className="align-top text-xs text-slate-muted">
          {expanded ? (
            <span className="text-slate-muted">—</span>
          ) : (
            <span className="line-clamp-2">
              {tasks.map((t) => t.title).join(" · ")}
            </span>
          )}
        </TD>
      </TR>
      {expanded &&
        tasks.map((task) => (
          <TR key={task.id} className="bg-white">
            <TD colSpan={3} className="border-l-2 border-brand/20 bg-slate-50/40 py-2 pl-6" />
            <TaskActionCells
              task={task}
              showStageColumn={showStageColumn}
              duplicateMuaTaskIds={duplicateMuaTaskIds}
              onComplete={onComplete}
              onContactLogged={onContactLogged}
            />
          </TR>
        ))}
    </Fragment>
  );
}

export function RmTaskList({
  tasks,
  loading,
  duplicateMuaTaskIds,
  onComplete,
  onContactLogged,
  showStageColumn = true,
  emptyLabel = "No pending tasks",
  filtersActive = false,
}: {
  tasks: Task[];
  loading: boolean;
  duplicateMuaTaskIds: Set<string>;
  onComplete: (task: Task) => void;
  onContactLogged?: () => void;
  showStageColumn?: boolean;
  emptyLabel?: string;
  filtersActive?: boolean;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const grouped = GROUP_ORDER.reduce(
    (map, key) => {
      map[key] = tasks.filter((t) => taskGroup(t.dueDate) === key);
      return map;
    },
    { overdue: [], today: [], upcoming: [] } as Record<TaskGroup, Task[]>
  );

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) {
    return <div className="h-48 animate-pulse rounded-xl bg-slate-200" />;
  }

  if (tasks.length === 0) {
    return (
      <p className="py-12 text-center text-slate-muted">
        {filtersActive ? "No tasks match the current filters." : emptyLabel}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {GROUP_ORDER.map((group) => {
        const list = grouped[group];
        if (list.length === 0) return null;
        const leadGroups = groupTasksByLead(list);

        return (
          <section key={group} className="space-y-2">
            <h2
              className={cn(
                "text-sm font-semibold uppercase tracking-wide",
                group === "overdue" ? "text-red-600" : "text-slate-muted"
              )}
            >
              {GROUP_LABEL[group]} ({list.length})
            </h2>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <Table className="min-w-[1080px]">
                <THead>
                  <TR>
                    <TH>Lead</TH>
                    <TH>Event</TH>
                    <TH>Details</TH>
                    <TH>Task</TH>
                    {showStageColumn ? <TH>Stage</TH> : null}
                    <TH>Last touch</TH>
                    <TH>Contact</TH>
                    <TH>Due</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {leadGroups.map((leadGroup) => {
                    if (leadGroup.tasks.length === 1) {
                      return (
                        <FullTaskRow
                          key={leadGroup.tasks[0].id}
                          task={leadGroup.tasks[0]}
                          showStageColumn={showStageColumn}
                          duplicateMuaTaskIds={duplicateMuaTaskIds}
                          onComplete={onComplete}
                          onContactLogged={onContactLogged}
                        />
                      );
                    }

                    const groupKey = `${group}:${leadGroup.leadId}`;
                    const expanded = !collapsedGroups.has(groupKey);

                    return (
                      <LeadTaskGroupRows
                        key={groupKey}
                        tasks={leadGroup.tasks}
                        showStageColumn={showStageColumn}
                        duplicateMuaTaskIds={duplicateMuaTaskIds}
                        onComplete={onComplete}
                        onContactLogged={onContactLogged}
                        expanded={expanded}
                        onToggle={() => toggleGroup(groupKey)}
                      />
                    );
                  })}
                </TBody>
              </Table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
