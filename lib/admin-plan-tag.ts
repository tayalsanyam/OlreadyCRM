export type AdminPlanTag = "high_priority" | "low_priority" | "hold";

export const ADMIN_PLAN_TAG_LABELS: Record<AdminPlanTag, string> = {
  high_priority: "High priority",
  low_priority: "Low priority",
  hold: "Hold",
};

export const ADMIN_PLAN_TAG_OPTIONS: AdminPlanTag[] = [
  "high_priority",
  "low_priority",
  "hold",
];

export function parseAdminPlanTag(raw: string | null | undefined): AdminPlanTag | null {
  if (!raw) return null;
  return ADMIN_PLAN_TAG_OPTIONS.includes(raw as AdminPlanTag)
    ? (raw as AdminPlanTag)
    : null;
}

/** Lower sorts first; hold is excluded from RM picker lists. */
export function adminPlanTagSortKey(tag: AdminPlanTag | null): number {
  if (tag === "high_priority") return 0;
  if (tag === "low_priority") return 2;
  if (tag === "hold") return 99;
  return 1;
}
