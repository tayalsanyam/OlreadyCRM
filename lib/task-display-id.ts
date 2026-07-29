import { generateTaskDisplayId, type TransactionSql } from "@/db/index";

const TASK_DISPLAY_ID_CONSTRAINT = "rm_tasks_display_id_key";
const MAX_ATTEMPTS = 3;

export function isRmTasksDisplayIdConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; constraint_name?: string; message?: string };
  if (e.code === "23505") {
    if (e.constraint_name === TASK_DISPLAY_ID_CONSTRAINT) return true;
    const msg = (e.message ?? "").toLowerCase();
    if (msg.includes(TASK_DISPLAY_ID_CONSTRAINT)) return true;
  }
  const cause = (error as { cause?: unknown }).cause;
  if (cause && cause !== error) return isRmTasksDisplayIdConflict(cause);
  return false;
}

/** Generate a TK display id and run insert; retry on duplicate display_id races. */
export async function runWithTaskDisplayIdRetry<T>(
  tx: TransactionSql,
  fn: (displayId: string) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const displayId = await generateTaskDisplayId(tx);
      return await fn(displayId);
    } catch (error) {
      if (!isRmTasksDisplayIdConflict(error) || attempt === MAX_ATTEMPTS - 1) {
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError ?? new Error("Failed to allocate task display id");
}
