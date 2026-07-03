/** Follow-up tasks tied to an MUA push require stage + next date on completion. */
export function isFollowUpTaskType(taskType: string): boolean {
  return taskType === "followUp" || taskType === "follow_up";
}

export function isPostBookingFollowUpTitle(title: string): boolean {
  return title.startsWith("Post-booking follow-up");
}

export function isCommissionCollectionTitle(title: string): boolean {
  return title.startsWith("Collect commission");
}

export function parseCommissionBookingIdFromTitle(title: string): string | null {
  const m = title.match(/\[bk:([^\]]+)\]/);
  return m?.[1] ?? null;
}

/** Payment / commission chase tasks — not sales-pipeline stage follow-ups. */
export function isFinancialFollowUpTask(task: {
  taskType: string;
  title: string;
}): boolean {
  return (
    isFollowUpTaskType(task.taskType) &&
    (isPostBookingFollowUpTitle(task.title) ||
      isCommissionCollectionTitle(task.title))
  );
}

export function taskRequiresPushCompletion(
  taskType: string,
  pushId: string | null | undefined,
  title?: string | null
): boolean {
  if (!pushId || !isFollowUpTaskType(taskType)) return false;
  if (title && isFinancialFollowUpTask({ taskType, title })) return false;
  return true;
}
