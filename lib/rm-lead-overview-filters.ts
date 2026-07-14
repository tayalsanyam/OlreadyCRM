export const RM_OVERVIEW_STATUS_FILTERS = [
  "assigned",
  "booked",
  "verified",
  "commission_rm",
  "expired",
  "closed",
  "pending_verification",
  "archived",
] as const;

export type RmOverviewStatusFilter = (typeof RM_OVERVIEW_STATUS_FILTERS)[number];

export type RmOverviewRoleFilter = "all" | "regional_rm" | "commission_rm";

export function parseRmOverviewStatusFilters(raw: string | null): RmOverviewStatusFilter[] {
  if (!raw?.trim()) return [];
  const seen = new Set<RmOverviewStatusFilter>();
  for (const part of raw.split(",")) {
    const value = part.trim() as RmOverviewStatusFilter;
    if (RM_OVERVIEW_STATUS_FILTERS.includes(value)) {
      seen.add(value);
    }
  }
  return [...seen];
}

export function parseRmOverviewRoleFilter(raw: string | null): RmOverviewRoleFilter {
  if (raw === "regional_rm" || raw === "commission_rm") return raw;
  return "all";
}

export const RM_OVERVIEW_STATUS_LABELS: Record<RmOverviewStatusFilter, string> = {
  assigned: "Assigned",
  booked: "Booked",
  verified: "Verified",
  commission_rm: "Commission",
  expired: "Expired",
  closed: "Closed",
  pending_verification: "Pending verification",
  archived: "Archived",
};

export function rmOverviewStatusLabel(
  status: string,
  leadPhase: string | null | undefined
): string {
  if (leadPhase === "expired") return "Expired";
  if (leadPhase === "closed") return "Closed";
  return RM_OVERVIEW_STATUS_LABELS[status as RmOverviewStatusFilter] ?? status.replace(/_/g, " ");
}
