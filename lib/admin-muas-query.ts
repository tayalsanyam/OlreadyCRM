import type { AdminPlanTag } from "@/lib/admin-plan-tag";
import { parseAdminPlanTag } from "@/lib/admin-plan-tag";
import { MUA_SOURCE_OPTIONS, type MuaSource } from "@/lib/mua-source";
import { PLAN_TIER_LABELS, PIPELINE_STAGE_ORDER, type PlanTier, type PipelineStage, type Region } from "@/lib/types";

export type AdminMuaSegment = "potential" | "customer" | "plan_customer";

export type AdminMuaExpiryFilter = "all" | "active" | "expiring" | "expired" | "none";
export type AdminMuaRosterFilter = "all" | "active" | "inactive";

export const ADMIN_MUA_PAGE_SIZE_DEFAULT = 100;
export const ADMIN_MUA_PAGE_SIZE_MAX = 100;

const VALID_REGIONS = new Set<Region>(["north", "east", "west", "south"]);
const VALID_PLAN_TIERS = new Set<string>(Object.keys(PLAN_TIER_LABELS));
const VALID_PIPELINE_STAGES = new Set<PipelineStage>(PIPELINE_STAGE_ORDER);
const VALID_MUA_SOURCES = new Set<string>(MUA_SOURCE_OPTIONS);

export type AdminMuaAddedDateBasis = "created" | "joined";

/** Sales RM on the active sales pipeline (`assigned_to`). */
export type AdminMuaSalesRmFilter = "all" | "unassigned" | "assigned";

/** Whether the MUA has an active (non-rejected) sales pipeline row. */
export type AdminMuaPipelineFilter = "all" | "missing" | "has";

export type AdminMuaSortBy = "name" | "daysUnassigned" | "daysSinceUpdate";
export type AdminMuaSortDir = "asc" | "desc";

export type AdminMuaListFilters = {
  q: string;
  segment: AdminMuaSegment | "all";
  tag: AdminPlanTag | "all";
  page: number;
  pageSize: number;
  regions: Region[];
  sources: MuaSource[];
  tiers: PlanTier[];
  expiryStatus: AdminMuaExpiryFilter;
  rosterStatus: AdminMuaRosterFilter;
  /** Expired-plan / former-customer win-back cohort (same as Sales → Re-engage). */
  winBack: boolean;
  addedDateBasis: AdminMuaAddedDateBasis | null;
  addedFrom: string | null;
  addedTo: string | null;
  /** null = all MUAs; `none` = no Plan RM assigned; otherwise regional RM staff id */
  planRm: string | null;
  salesRm: AdminMuaSalesRmFilter;
  pipeline: AdminMuaPipelineFilter;
  /** Canonical pipeline assigned_to — specific Sales RM / TL */
  salesRmStaffId: string | null;
  /** Who closed the deal — pipeline or MUA sales_closed_by */
  dealClosedSalesRmStaffId: string | null;
  /** Sales team (MUA team_id or assignee staff team_id) */
  teamId: string | null;
  /** Legal state from plan_states or city catalog */
  state: string | null;
  /** Canonical sales pipeline stage */
  pipelineStage: PipelineStage | null;
  sortBy: AdminMuaSortBy;
  sortDir: AdminMuaSortDir;
};

function parseOptionalIsoDate(raw: string | null): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function parseOptionalUuid(raw: string | null): string | null {
  if (!raw || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
    return null;
  }
  return raw;
}

export function parseAdminMuaListFilters(
  searchParams: URLSearchParams,
): AdminMuaListFilters {
  const segmentRaw = searchParams.get("segment");
  const segment =
    segmentRaw === "potential" ||
    segmentRaw === "customer" ||
    segmentRaw === "plan_customer"
      ? segmentRaw
      : "all";
  const tagRaw = searchParams.get("tag");
  const parsedTag = parseAdminPlanTag(tagRaw);

  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? ADMIN_MUA_PAGE_SIZE_DEFAULT);
  const pageSize = Math.min(
    ADMIN_MUA_PAGE_SIZE_MAX,
    Math.max(1, pageSizeRaw || ADMIN_MUA_PAGE_SIZE_DEFAULT),
  );

  const regions = searchParams
    .getAll("region")
    .filter((r): r is Region => VALID_REGIONS.has(r as Region));

  const sources = searchParams
    .getAll("source")
    .filter((s): s is MuaSource => VALID_MUA_SOURCES.has(s));

  const tiers = searchParams
    .getAll("tier")
    .filter((t): t is PlanTier => VALID_PLAN_TIERS.has(t));

  const expiryRaw = searchParams.get("expiryStatus");
  const expiryStatus: AdminMuaExpiryFilter =
    expiryRaw === "active" ||
    expiryRaw === "expiring" ||
    expiryRaw === "expired" ||
    expiryRaw === "none"
      ? expiryRaw
      : "all";

  const rosterRaw = searchParams.get("rosterStatus");
  const rosterStatus: AdminMuaRosterFilter =
    rosterRaw === "active" || rosterRaw === "inactive" ? rosterRaw : "all";
  const winBack =
    searchParams.get("winBack") === "1" ||
    searchParams.get("reEngage") === "1" ||
    rosterRaw === "lapsed";

  const basisRaw = searchParams.get("addedDateBasis");
  const addedDateBasis: AdminMuaAddedDateBasis | null =
    basisRaw === "created" || basisRaw === "joined" ? basisRaw : null;
  const addedFrom = parseOptionalIsoDate(searchParams.get("addedFrom"));
  const addedTo = parseOptionalIsoDate(searchParams.get("addedTo"));

  const planRmRaw = searchParams.get("planRm");
  const planRm =
    planRmRaw === "none"
      ? "none"
      : parseOptionalUuid(planRmRaw);

  const salesRmRaw = searchParams.get("salesRm");
  const salesRm: AdminMuaSalesRmFilter =
    salesRmRaw === "unassigned" || salesRmRaw === "assigned" ? salesRmRaw : "all";

  const pipelineRaw = searchParams.get("pipeline");
  const pipeline: AdminMuaPipelineFilter =
    pipelineRaw === "missing" || pipelineRaw === "has" ? pipelineRaw : "all";

  const salesRmStaffId =
    parseOptionalUuid(searchParams.get("salesRmStaff")) ??
    parseOptionalUuid(searchParams.get("assigned_to"));

  const dealClosedSalesRmStaffId =
    parseOptionalUuid(searchParams.get("dealClosedSalesRm")) ??
    parseOptionalUuid(searchParams.get("salesClosedBy"));

  const teamId = parseOptionalUuid(searchParams.get("teamId") ?? searchParams.get("team_id"));

  const stateRaw = searchParams.get("state")?.trim();
  const state = stateRaw ? stateRaw : null;

  const stageRaw = searchParams.get("stage")?.trim();
  const pipelineStage =
    stageRaw && VALID_PIPELINE_STAGES.has(stageRaw as PipelineStage)
      ? (stageRaw as PipelineStage)
      : null;

  const sortByRaw = searchParams.get("sortBy");
  const sortBy: AdminMuaSortBy =
    sortByRaw === "daysUnassigned" || sortByRaw === "daysSinceUpdate"
      ? sortByRaw
      : "name";
  const sortDirRaw = searchParams.get("sortDir");
  const sortDir: AdminMuaSortDir = sortDirRaw === "desc" ? "desc" : "asc";

  return {
    q: searchParams.get("q")?.trim() ?? "",
    segment,
    tag: parsedTag ?? "all",
    page,
    pageSize,
    regions,
    sources,
    tiers,
    expiryStatus,
    rosterStatus,
    winBack,
    addedDateBasis:
      addedDateBasis && (addedFrom || addedTo) ? addedDateBasis : null,
    addedFrom,
    addedTo,
    planRm,
    salesRm,
    pipeline,
    salesRmStaffId,
    dealClosedSalesRmStaffId,
    teamId,
    state,
    pipelineStage,
    sortBy,
    sortDir,
  };
}

export function buildAdminMuaSearchPattern(q: string): {
  like: string | null;
  /** Matches names when extra spaces sit between words (e.g. "Priyal  Nagda"). */
  flexLike: string | null;
  phoneMatch: string | null;
} {
  const trimmed = q.trim().replace(/\s+/g, " ");
  if (!trimmed) return { like: null, flexLike: null, phoneMatch: null };
  const safe = trimmed.replace(/%/g, "");
  const like = `%${safe}%`;
  const parts = safe.split(/\s+/).filter(Boolean);
  const flexLike = parts.length > 1 ? `%${parts.join("%")}%` : null;
  const digits = trimmed.replace(/\D/g, "");
  const phoneMatch = digits.length >= 4 ? `%${digits.slice(-10)}` : null;
  return { like, flexLike, phoneMatch };
}

export type AdminMuaSegmentInput = {
  planTier: string | null;
  planExpiry: string | null;
  hasPlanHistory: boolean;
};

export function deriveAdminMuaSegment(
  m: AdminMuaSegmentInput,
): AdminMuaSegment {
  const activePlan =
    Boolean(m.planTier) &&
    (!m.planExpiry || new Date(m.planExpiry) >= new Date(new Date().toDateString()));
  if (activePlan) return "plan_customer";
  if (m.hasPlanHistory || m.planTier) return "customer";
  return "potential";
}

export const ADMIN_MUA_SEGMENT_LABELS: Record<AdminMuaSegment, string> = {
  potential: "Potential",
  customer: "Customer",
  plan_customer: "Plan customer",
};
