import type { PaginatedResult } from "@/db/index";

/** Task-first lists: return every row — never silently truncate staff work queues. */
export function taskListResponse<T>(tasks: T[]): PaginatedResult<T> {
  const total = tasks.length;
  return {
    data: tasks,
    total,
    page: 1,
    pageSize: total,
    totalPages: 1,
  };
}
