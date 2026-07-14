import type { Task } from "@/lib/types";

export function parsePipelineIdFromTaskTitle(title: string): string | null {
  const m = title.match(/\[PIPE:([0-9a-f-]{36})\]/i);
  return m?.[1] ?? null;
}

export function taskPipelineId(task: Task): string | null {
  return task.salesPipelineId ?? parsePipelineIdFromTaskTitle(task.title);
}

export function isPendingSalesPipelineTask(task: Task): boolean {
  return (
    task.status === "pending" &&
    (task.taskType === "salesFollowUp" ||
      task.taskType === "salesSeniorCall" ||
      task.taskType === "salesOnboarding")
  );
}

/** Earliest-due pending sales task linked to a pipeline. */
export function findPendingSalesTaskForPipeline(tasks: Task[], pipelineId: string): Task | null {
  const pending = tasks.filter(
    (t) => taskPipelineId(t) === pipelineId && isPendingSalesPipelineTask(t),
  );
  if (!pending.length) return null;
  pending.sort((a, b) => {
    const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    return ad - bd;
  });
  return pending[0] ?? null;
}
