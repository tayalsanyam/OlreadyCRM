export type AdminTaskKind = "crm" | "team" | "care" | "support";

export type AdminTaskDueFilter = "" | "overdue" | "today" | "upcoming" | "no_date";

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function taskDueBucket(dueAt: string | null): AdminTaskDueFilter {
  if (!dueAt) return "no_date";
  const due = startOfDay(new Date(dueAt));
  const today = startOfDay(new Date());
  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "today";
  return "upcoming";
}

export function matchesDueFilter(
  dueAt: string | null,
  filter: AdminTaskDueFilter,
): boolean {
  if (!filter) return true;
  return taskDueBucket(dueAt) === filter;
}
