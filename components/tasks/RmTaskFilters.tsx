"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { MuaPushStage, Task } from "@/lib/types";
import { MUA_PUSH_STAGE_LABELS } from "@/lib/types";
import {
  CONFIRMATION_FILTERS,
  countByConfirmation,
  countByDue,
  countByRegion,
  countByStage,
  countCrmTaskTypes,
  countDistinctLeads,
  countIntakeTaskTypes,
  CRM_TASK_TYPE_FILTERS,
  DUE_FILTERS,
  INTAKE_TASK_TYPE_FILTERS,
  REGION_FILTERS,
  type ConfirmationFilter,
  type CrmTaskTypeFilter,
  type DueFilter,
  type IntakeTaskTypeFilter,
  type RegionFilter,
  type RmTaskFilterState,
  type StageFilter,
} from "@/lib/rm-task-filters";

function filterPill(active: boolean) {
  return active
    ? "border-brand bg-brand text-white"
    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300";
}

type RmTaskFiltersProps = {
  mode: "crm" | "intake";
  tasks: Task[];
  filteredCount: number;
  filters: RmTaskFilterState;
  onChange: (next: RmTaskFilterState) => void;
};

export function RmTaskFilters({
  mode,
  tasks,
  filteredCount,
  filters,
  onChange,
}: RmTaskFiltersProps) {
  const dueCounts = countByDue(tasks);
  const leadCount = countDistinctLeads(tasks);
  const stageCounts = countByStage(tasks);
  const confirmationCounts = countByConfirmation(tasks);
  const crmTypeCounts = countCrmTaskTypes(tasks);
  const intakeTypeCounts = countIntakeTaskTypes(tasks);
  const regionCounts = countByRegion(tasks);

  const stageOptions = (Object.keys(MUA_PUSH_STAGE_LABELS) as MuaPushStage[]).filter(
    (s) => (stageCounts.get(s) ?? 0) > 0
  );

  function patch(partial: Partial<RmTaskFilterState>) {
    onChange({ ...filters, ...partial });
  }

  function clearFilters() {
    onChange({
      search: "",
      dueFilter: "all",
      taskTypeFilter: "all",
      stageFilter: "all",
      confirmationFilter: "all",
      regionFilter: "all",
    });
  }

  const activeSummary = [
    filters.taskTypeFilter !== "all"
      ? (mode === "crm" ? CRM_TASK_TYPE_FILTERS : INTAKE_TASK_TYPE_FILTERS).find(
          (f) => f.id === filters.taskTypeFilter
        )?.label
      : null,
    filters.dueFilter !== "all"
      ? DUE_FILTERS.find((f) => f.id === filters.dueFilter)?.label
      : null,
    mode === "crm" && filters.stageFilter !== "all"
      ? filters.stageFilter === "none"
        ? "No push stage"
        : `Stage: ${MUA_PUSH_STAGE_LABELS[filters.stageFilter]}`
      : null,
    mode === "crm" && filters.regionFilter !== "all"
      ? REGION_FILTERS.find((f) => f.id === filters.regionFilter)?.label
      : null,
    mode === "intake" && filters.confirmationFilter !== "all"
      ? CONFIRMATION_FILTERS.find((f) => f.id === filters.confirmationFilter)?.label
      : null,
    filters.search.trim() ? `Search: “${filters.search.trim()}”` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Tasks</p>
          <p className="text-2xl font-bold text-brand">{tasks.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs text-slate-500">Leads</p>
          <p className="text-2xl font-bold text-brand">{leadCount}</p>
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
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Task filters
          </p>
          <Button size="sm" variant="secondary" onClick={clearFilters}>
            Reset
          </Button>
        </div>

        <div className="mb-2 flex flex-wrap gap-2">
          {(mode === "crm" ? CRM_TASK_TYPE_FILTERS : INTAKE_TASK_TYPE_FILTERS).map((tf) => {
            const counts = mode === "crm" ? crmTypeCounts : intakeTypeCounts;
            const count = counts[tf.id as CrmTaskTypeFilter & IntakeTaskTypeFilter];
            const active = filters.taskTypeFilter === tf.id;
            return (
              <button
                key={tf.id}
                type="button"
                onClick={() =>
                  patch({
                    taskTypeFilter: tf.id as CrmTaskTypeFilter & IntakeTaskTypeFilter,
                  })
                }
                className={`rounded-full border px-3 py-1 text-xs font-medium ${filterPill(active)}`}
              >
                {tf.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {DUE_FILTERS.map((df) => (
            <button
              key={df.id}
              type="button"
              onClick={() => patch({ dueFilter: df.id as DueFilter })}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${filterPill(filters.dueFilter === df.id)}`}
            >
              {df.label}
              {df.id === "all" ? ` (${dueCounts.all})` : ` (${dueCounts[df.id]})`}
            </button>
          ))}
        </div>

        {mode === "crm" ? (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              {REGION_FILTERS.filter(
                (rf) => rf.id === "all" || (regionCounts[rf.id] ?? 0) > 0
              ).map((rf) => (
                <button
                  key={rf.id}
                  type="button"
                  onClick={() => patch({ regionFilter: rf.id as RegionFilter })}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${filterPill(filters.regionFilter === rf.id)}`}
                >
                  {rf.label} ({regionCounts[rf.id]})
                </button>
              ))}
            </div>
            <label className="mb-3 block text-xs text-slate-600">
            <span className="mb-1 block font-medium text-slate-700">Push stage</span>
            <select
              value={filters.stageFilter}
              onChange={(e) => patch({ stageFilter: e.target.value as StageFilter })}
              className="w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-brand"
            >
              <option value="all">All stages ({stageCounts.get("all") ?? 0})</option>
              {stageOptions.map((s) => (
                <option key={s} value={s}>
                  {MUA_PUSH_STAGE_LABELS[s]} ({stageCounts.get(s) ?? 0})
                </option>
              ))}
              {(stageCounts.get("none") ?? 0) > 0 ? (
                <option value="none">No linked push ({stageCounts.get("none")})</option>
              ) : null}
            </select>
          </label>
          </>
        ) : (
          <div className="mb-3 flex flex-wrap gap-2">
            {CONFIRMATION_FILTERS.map((cf) => (
              <button
                key={cf.id}
                type="button"
                onClick={() =>
                  patch({ confirmationFilter: cf.id as ConfirmationFilter })
                }
                className={`rounded-full border px-3 py-1 text-xs font-medium ${filterPill(filters.confirmationFilter === cf.id)}`}
              >
                {cf.label} ({confirmationCounts[cf.id]})
              </button>
            ))}
          </div>
        )}

        <Input
          placeholder="Search bride, ID, MUA, city, phone…"
          value={filters.search}
          onChange={(e) => patch({ search: e.target.value })}
        />
        <p className="mt-2 text-xs text-slate-muted">
          Showing {filteredCount} of {tasks.length}
          {activeSummary ? ` · ${activeSummary}` : ""}
        </p>
      </div>
    </div>
  );
}
