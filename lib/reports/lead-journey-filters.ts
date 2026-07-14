export const LEAD_JOURNEY_DB_STATUS_FILTERS = [
  "assigned",
  "booked",
  "verified",
  "closed",
] as const;

export type LeadJourneyDbStatusFilter = (typeof LEAD_JOURNEY_DB_STATUS_FILTERS)[number];

export type LeadJourneyPortalFilter = "portal" | "non_portal";

export function parseLeadJourneyDbStatusFilters(
  raw: string | null,
  legacyStatus?: string | null
): LeadJourneyDbStatusFilter[] {
  const source = raw?.trim() || legacyStatus?.trim();
  if (!source) return [];
  const seen = new Set<LeadJourneyDbStatusFilter>();
  for (const part of source.split(",")) {
    const value = part.trim() as LeadJourneyDbStatusFilter;
    if (LEAD_JOURNEY_DB_STATUS_FILTERS.includes(value)) {
      seen.add(value);
    }
  }
  return [...seen];
}

export function parseLeadJourneyPortalFilter(raw: string | null): LeadJourneyPortalFilter | null {
  if (raw === "portal" || raw === "non_portal") return raw;
  return null;
}

export function leadJourneyStatusFilterSqlValues(filters: LeadJourneyDbStatusFilter[]) {
  const dbStatuses = filters.filter((f) => f !== "closed");
  return {
    noStatusFilter: filters.length === 0,
    dbStatuses,
    includeClosed: filters.includes("closed"),
  };
}

export function leadJourneyDbStatusLabel(
  status: string,
  leadPhase: string | null | undefined
): string {
  if (leadPhase === "closed") return "Closed";
  switch (status) {
    case "assigned":
      return "Assigned";
    case "booked":
      return "Booked";
    case "verified":
      return "Verified";
    case "commission_rm":
      return "Commission RM";
    case "archived":
      return "Archived";
    default:
      return status.replace(/_/g, " ");
  }
}
