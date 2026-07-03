import { isIntakeTaskType } from "@/lib/lead-intake-config";
import type {
  LeadConfirmationStatus,
  MuaPushStage,
  Region,
  Task,
  TaskType,
} from "@/lib/types";

export type DueFilter = "all" | "overdue" | "today" | "upcoming";
export type StageFilter = "all" | MuaPushStage | "none";
export type ConfirmationFilter = "all" | LeadConfirmationStatus;
export type RegionFilter = "all" | Region | "none";

export const REGION_FILTERS: Array<{ id: RegionFilter; label: string }> = [
  { id: "all", label: "All regions" },
  { id: "north", label: "North" },
  { id: "east", label: "East" },
  { id: "west", label: "West" },
  { id: "south", label: "South" },
  { id: "none", label: "No lead region" },
];

export type CrmTaskTypeFilter =
  | "all"
  | "followUp"
  | "closeConversation"
  | "collectMuaProspect"
  | "feedbackFollowUp"
  | "feedbackReferralFollowUp"
  | "adminReview"
  | "shiftWarning";

export type IntakeTaskTypeFilter =
  | "all"
  | "brideConfirmation"
  | "shareProfiles"
  | "leadProgressFollowUp";

export const DUE_FILTERS: Array<{ id: DueFilter; label: string }> = [
  { id: "all", label: "All due dates" },
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Due today" },
  { id: "upcoming", label: "Upcoming" },
];

export const CRM_TASK_TYPE_FILTERS: Array<{ id: CrmTaskTypeFilter; label: string }> = [
  { id: "all", label: "All types" },
  { id: "followUp", label: "Follow-up" },
  { id: "closeConversation", label: "Close conversation" },
  { id: "collectMuaProspect", label: "Collect prospect" },
  { id: "feedbackFollowUp", label: "Feedback call-back" },
  { id: "feedbackReferralFollowUp", label: "Get referral phone" },
  { id: "adminReview", label: "Admin review" },
  { id: "shiftWarning", label: "Shift warning" },
];

export const INTAKE_TASK_TYPE_FILTERS: Array<{ id: IntakeTaskTypeFilter; label: string }> = [
  { id: "all", label: "All types" },
  { id: "brideConfirmation", label: "Bride confirmation" },
  { id: "shareProfiles", label: "Share profiles" },
  { id: "leadProgressFollowUp", label: "Progress follow-up" },
];

export const CONFIRMATION_FILTERS: Array<{ id: ConfirmationFilter; label: string }> = [
  { id: "all", label: "All confirmation" },
  { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },
];

export type RmTaskFilterState = {
  search: string;
  dueFilter: DueFilter;
  taskTypeFilter: CrmTaskTypeFilter | IntakeTaskTypeFilter;
  stageFilter: StageFilter;
  confirmationFilter: ConfirmationFilter;
  regionFilter: RegionFilter;
};

export function defaultRmTaskFilters(): RmTaskFilterState {
  return {
    search: "",
    dueFilter: "all",
    taskTypeFilter: "all",
    stageFilter: "all",
    confirmationFilter: "all",
    regionFilter: "all",
  };
}

export function dueBucket(dueDate: string | null | undefined): DueFilter | "none" {
  if (!dueDate) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "today";
  return "upcoming";
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function taskSearchHaystack(task: Task): string {
  return [
    task.leadName,
    task.brideDisplayId,
    task.leadCity,
    task.muaName,
    task.muaCity,
    task.title,
    task.displayId,
    task.leadPhone,
    task.muaPhone,
    task.eventLabels,
    task.muasOfferedNames,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function countByDue(tasks: Task[]): Record<DueFilter, number> {
  const counts: Record<DueFilter, number> = {
    all: tasks.length,
    overdue: 0,
    today: 0,
    upcoming: 0,
  };
  for (const t of tasks) {
    const bucket = dueBucket(t.dueDate);
    if (bucket === "overdue" || bucket === "today" || bucket === "upcoming") {
      counts[bucket] += 1;
    }
  }
  return counts;
}

export function countCrmTaskTypes(tasks: Task[]): Record<CrmTaskTypeFilter, number> {
  const counts: Record<CrmTaskTypeFilter, number> = {
    all: tasks.length,
    followUp: 0,
    closeConversation: 0,
    collectMuaProspect: 0,
    feedbackFollowUp: 0,
    feedbackReferralFollowUp: 0,
    adminReview: 0,
    shiftWarning: 0,
  };
  for (const t of tasks) {
    if (t.taskType in counts) counts[t.taskType as CrmTaskTypeFilter] += 1;
  }
  return counts;
}

export function countIntakeTaskTypes(tasks: Task[]): Record<IntakeTaskTypeFilter, number> {
  const counts: Record<IntakeTaskTypeFilter, number> = {
    all: tasks.length,
    brideConfirmation: 0,
    shareProfiles: 0,
    leadProgressFollowUp: 0,
  };
  for (const t of tasks) {
    if (t.taskType in counts) counts[t.taskType as IntakeTaskTypeFilter] += 1;
  }
  return counts;
}

export function countByStage(tasks: Task[]): Map<StageFilter, number> {
  const counts = new Map<StageFilter, number>();
  counts.set("all", tasks.length);
  let none = 0;
  for (const t of tasks) {
    if (!t.pushStage) {
      none += 1;
      continue;
    }
    counts.set(t.pushStage, (counts.get(t.pushStage) ?? 0) + 1);
  }
  if (none > 0) counts.set("none", none);
  return counts;
}

export function countByConfirmation(tasks: Task[]): Record<ConfirmationFilter, number> {
  const counts: Record<ConfirmationFilter, number> = {
    all: tasks.length,
    pending: 0,
    confirmed: 0,
  };
  for (const t of tasks) {
    const status = t.confirmationStatus ?? "pending";
    if (status === "confirmed") counts.confirmed += 1;
    else counts.pending += 1;
  }
  return counts;
}

/** Distinct bride leads with at least one task in the list. */
export function countByRegion(tasks: Task[]): Record<RegionFilter, number> {
  const counts: Record<RegionFilter, number> = {
    all: tasks.length,
    north: 0,
    east: 0,
    west: 0,
    south: 0,
    none: 0,
  };
  for (const t of tasks) {
    const region = t.leadRegion;
    if (!region) counts.none += 1;
    else if (region in counts) counts[region as Region] += 1;
  }
  return counts;
}

export function countDistinctLeads(tasks: Task[]): number {
  const leadIds = new Set<string>();
  for (const t of tasks) {
    if (t.leadId) leadIds.add(t.leadId);
  }
  return leadIds.size;
}

export function filterRmTasks(
  tasks: Task[],
  filters: RmTaskFilterState,
  mode: "crm" | "intake"
): Task[] {
  let next = [...tasks];
  const typeFilter = filters.taskTypeFilter;

  if (typeFilter !== "all") {
    next = next.filter((t) => t.taskType === typeFilter);
  }

  if (filters.dueFilter !== "all") {
    next = next.filter((t) => dueBucket(t.dueDate) === filters.dueFilter);
  }

  if (mode === "crm" && filters.stageFilter !== "all") {
    next = next.filter((t) =>
      filters.stageFilter === "none" ? !t.pushStage : t.pushStage === filters.stageFilter
    );
  }

  if (mode === "intake" && filters.confirmationFilter !== "all") {
    next = next.filter(
      (t) => (t.confirmationStatus ?? "pending") === filters.confirmationFilter
    );
  }

  if (mode === "crm" && filters.regionFilter !== "all") {
    next = next.filter((t) =>
      filters.regionFilter === "none"
        ? !t.leadRegion
        : t.leadRegion === filters.regionFilter
    );
  }

  const q = filters.search.trim().toLowerCase();
  if (q) {
    next = next.filter((t) => taskSearchHaystack(t).includes(q));
  }

  next.sort((a, b) => {
    const ad = a.dueDate ? startOfDay(new Date(a.dueDate)).getTime() : Number.MAX_SAFE_INTEGER;
    const bd = b.dueDate ? startOfDay(new Date(b.dueDate)).getTime() : Number.MAX_SAFE_INTEGER;
    return ad - bd;
  });

  return next;
}

export function isRmCrmTaskType(taskType: TaskType): boolean {
  return !isIntakeTaskType(taskType) && !taskType.startsWith("sales");
}
