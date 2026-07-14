export type UploadPendingSort = "latest" | "oldest";

/** Filter pending leads by logged connect attempts (1 or 2 of max). */
export type UploadConnectAttemptFilter = "all" | "1" | "2";

export function parseUploadPendingSort(value: string | null): UploadPendingSort {
  return value === "oldest" ? "oldest" : "latest";
}

export function parseUploadConnectAttemptFilter(
  value: string | null
): UploadConnectAttemptFilter {
  if (value === "1" || value === "2") return value;
  return "all";
}

export const UPLOAD_CONNECT_ATTEMPT_FILTER_LABELS: Record<
  UploadConnectAttemptFilter,
  string
> = {
  all: "All attempts",
  "1": "Contact attempt 1",
  "2": "Contact attempt 2",
};

export const UPLOAD_PENDING_SORT_LABELS: Record<UploadPendingSort, string> = {
  latest: "Latest first",
  oldest: "Oldest first",
};
