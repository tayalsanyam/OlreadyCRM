import { parseExitSourceFilter, type ExitSourceFilter } from "@/lib/lead-exit";
import {
  parseUploadConnectAttemptFilter,
  parseUploadPendingSort,
  type UploadConnectAttemptFilter,
  type UploadPendingSort,
} from "@/lib/upload-pending-filters";
import type { BudgetTier, LeadStatus, Region } from "@/lib/types";

export type AssignWorkspaceTab = "unassigned" | "assigned" | "uploader_review" | "closed";

export type AssignEventDateFilter =
  | { mode: "all" }
  | { mode: "date"; date: string };

export type AssignWorkspaceFilters = {
  region: Region | "";
  state: string;
  tier: BudgetTier | "";
  assignedStatus: LeadStatus | "";
  assigneeId: string;
  eventDateFilter: AssignEventDateFilter;
  portalOnly: boolean;
  excludePortal: boolean;
  exitSource: ExitSourceFilter;
  search: string;
  reviewSort: UploadPendingSort;
  connectAttempts: UploadConnectAttemptFilter;
};

export function parseAssignWorkspaceTab(raw: string | null): AssignWorkspaceTab {
  if (raw === "assigned") return "assigned";
  if (raw === "closed") return "closed";
  if (raw === "uploader_review" || raw === "attrition" || raw === "review") {
    return "uploader_review";
  }
  return "unassigned";
}

export function assignEventDateBounds(value: AssignEventDateFilter): {
  from?: string;
  to?: string;
} {
  if (value.mode === "all" || !value.date) return {};
  return { from: value.date, to: value.date };
}

export function parseEventDateFromParams(sp: URLSearchParams): AssignEventDateFilter {
  const eventDate = sp.get("eventDate") ?? sp.get("eventFrom");
  if (eventDate) return { mode: "date", date: eventDate };
  return { mode: "all" };
}

export function parseFiltersFromParams(sp: URLSearchParams): AssignWorkspaceFilters {
  const region = sp.get("region");
  const tier = sp.get("tier");
  const status = sp.get("status");
  return {
    region:
      region === "north" || region === "east" || region === "west" || region === "south"
        ? region
        : "",
    state: sp.get("state") ?? "",
    tier:
      tier === "tier1" || tier === "tier2" || tier === "tier3" || tier === "tier4" ? tier : "",
    assignedStatus:
      status === "assigned" || status === "commissionRm" || status === "booked" ? status : "",
    assigneeId: sp.get("rmId") ?? "",
    eventDateFilter: parseEventDateFromParams(sp),
    portalOnly: sp.get("portalOnly") === "1",
    excludePortal: sp.get("excludePortal") === "1",
    exitSource: parseExitSourceFilter(sp.get("source")),
    search: sp.get("q") ?? "",
    reviewSort: parseUploadPendingSort(sp.get("sort")),
    connectAttempts: parseUploadConnectAttemptFilter(sp.get("connectAttempts")),
  };
}

export function buildAssignWorkspaceUrl(
  tab: AssignWorkspaceTab,
  filters: AssignWorkspaceFilters,
): string {
  const p = new URLSearchParams();
  if (tab !== "unassigned") p.set("tab", tab);
  if (filters.region) p.set("region", filters.region);
  if (filters.state) p.set("state", filters.state);
  if (filters.tier) p.set("tier", filters.tier);
  if (tab === "assigned" && filters.assignedStatus) p.set("status", filters.assignedStatus);
  if (
    (tab === "assigned" || tab === "uploader_review" || tab === "closed") &&
    filters.assigneeId
  ) {
    p.set("rmId", filters.assigneeId);
  }
  if (tab === "uploader_review" && filters.exitSource !== "all") {
    p.set("source", filters.exitSource);
  }
  if (
    (tab === "unassigned" || tab === "assigned" || tab === "uploader_review" || tab === "closed") &&
    filters.search.trim()
  ) {
    p.set("q", filters.search.trim());
  }
  if (tab === "uploader_review") {
    if (filters.reviewSort !== "latest") p.set("sort", filters.reviewSort);
    if (filters.connectAttempts !== "all") {
      p.set("connectAttempts", filters.connectAttempts);
    }
  }
  if (tab === "unassigned" && filters.portalOnly) p.set("portalOnly", "1");
  if (tab === "unassigned" && filters.excludePortal) p.set("excludePortal", "1");
  if (filters.eventDateFilter.mode === "date" && filters.eventDateFilter.date) {
    p.set("eventDate", filters.eventDateFilter.date);
  }
  const qs = p.toString();
  return qs ? `/admin/assign?${qs}` : "/admin/assign";
}

export function buildAssignApiQuery(
  tab: AssignWorkspaceTab,
  filters: AssignWorkspaceFilters,
): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.region) p.set("region", filters.region);
  if (filters.state) p.set("state", filters.state);
  if (filters.tier) p.set("tier", filters.tier);
  if (tab === "assigned" && filters.assignedStatus) p.set("status", filters.assignedStatus);
  if (
    (tab === "assigned" || tab === "uploader_review" || tab === "closed") &&
    filters.assigneeId
  ) {
    p.set("rmId", filters.assigneeId);
  }
  if (filters.search?.trim()) p.set("q", filters.search.trim());
  const { from, to } = assignEventDateBounds(filters.eventDateFilter);
  if (from) p.set("eventFrom", from);
  if (to) p.set("eventTo", to);
  return p;
}

export function buildUploadLeadsQuery(
  tab: "review" | "closed",
  filters: AssignWorkspaceFilters,
): URLSearchParams {
  const p = new URLSearchParams({ tab });
  if (filters.search.trim()) p.set("q", filters.search.trim());
  if (tab === "review") {
    p.set("sort", filters.reviewSort);
    if (filters.state) p.set("state", filters.state);
    if (filters.exitSource !== "all") p.set("source", filters.exitSource);
    if (filters.connectAttempts !== "all") {
      p.set("connectAttempts", filters.connectAttempts);
    }
  }
  return p;
}

export const EMPTY_ASSIGN_WORKSPACE_FILTERS: AssignWorkspaceFilters = {
  region: "",
  state: "",
  tier: "",
  assignedStatus: "",
  assigneeId: "",
  eventDateFilter: { mode: "all" },
  portalOnly: false,
  excludePortal: false,
  exitSource: "all",
  search: "",
  reviewSort: "latest",
  connectAttempts: "all",
};
