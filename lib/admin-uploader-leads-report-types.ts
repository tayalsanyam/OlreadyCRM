import { LEAD_EXIT_LABELS } from "@/lib/lead-exit";
import { overviewDateRangeLabel } from "@/lib/admin-overview-date-range";
import type { BudgetTier, Region } from "@/lib/types";

/** Uploader workspace buckets — aligned with Upload leads tabs. */
export type UploaderLeadsReportStatus =
  | "all"
  | "pending"
  | "verified"
  | "review"
  | "closed"
  | "booked"
  | "expired";

export type UploaderLeadsReportRouting =
  | "all"
  | "portal"
  | "rm"
  | "commission"
  | "rm_pool";

export type UploaderLeadReportRow = {
  id: string;
  displayId: string;
  brideName: string;
  phone: string;
  city: string;
  state: string | null;
  region: string;
  workspaceStatus: string;
  routing: string | null;
  assignedTo: string | null;
  assignedRmId: string | null;
  portalOnly: boolean;
  leadPhase: string;
  dbStatus: string;
  source: string | null;
  budgetAmount: number | null;
  budgetTier: BudgetTier | null;
  eventDate: string | null;
  isExpired: boolean;
  muaPushCount: number;
  createdAt: string;
  verifiedAt: string | null;
  contactCount: number;
  lastContactAt: string | null;
  lastContactChannel: string | null;
  verificationConnectAttempts: number;
};

export type UploaderLeadsReportStatusCounts = Record<
  Exclude<UploaderLeadsReportStatus, "all">,
  number
>;

export type UploaderLeadsReportPayload = {
  dateFrom: string;
  dateTo: string;
  allTime: boolean;
  status: UploaderLeadsReportStatus;
  routing: UploaderLeadsReportRouting;
  region: Region | null;
  state: string | null;
  statusCounts: UploaderLeadsReportStatusCounts;
  totalInRange: number;
  rows: UploaderLeadReportRow[];
  total: number;
};

export const UPLOADER_LEADS_REPORT_STATUS_LABELS: Record<
  UploaderLeadsReportStatus,
  string
> = {
  all: "All statuses",
  pending: "Pending verification",
  verified: "Verified (active)",
  review: LEAD_EXIT_LABELS.uploaderReview,
  closed: LEAD_EXIT_LABELS.uploaderClosed,
  booked: "Booked",
  expired: "Expired",
};

export const UPLOADER_LEADS_REPORT_ROUTING_LABELS: Record<
  UploaderLeadsReportRouting,
  string
> = {
  all: "All routing",
  portal: "Portal",
  rm: "Regional RM",
  commission: "Commission",
  rm_pool: "RM pool (unassigned)",
};

export const UPLOADER_LEADS_REPORT_STATUS_ORDER: UploaderLeadsReportStatus[] = [
  "all",
  "pending",
  "verified",
  "review",
  "closed",
  "booked",
  "expired",
];

export const UPLOADER_LEADS_REPORT_ROUTING_ORDER: UploaderLeadsReportRouting[] = [
  "all",
  "portal",
  "rm",
  "commission",
  "rm_pool",
];

export function parseUploaderLeadsReportStatus(
  value: string | null
): UploaderLeadsReportStatus {
  if (value === "not_answering" || value === "not_interested") return "review";
  if (value === "deactivated") return "closed";

  const allowed: UploaderLeadsReportStatus[] = [
    "all",
    "pending",
    "verified",
    "review",
    "closed",
    "booked",
    "expired",
  ];
  if (value && allowed.includes(value as UploaderLeadsReportStatus)) {
    return value as UploaderLeadsReportStatus;
  }
  return "all";
}

export function parseUploaderLeadsReportRouting(
  value: string | null
): UploaderLeadsReportRouting {
  const allowed: UploaderLeadsReportRouting[] = [
    "all",
    "portal",
    "rm",
    "commission",
    "rm_pool",
  ];
  if (value === "regional_rm") return "rm";
  if (value === "rm_queue") return "rm_pool";
  if (value && allowed.includes(value as UploaderLeadsReportRouting)) {
    return value as UploaderLeadsReportRouting;
  }
  return "all";
}

const REGIONS: Region[] = ["north", "east", "west", "south"];

export function parseUploaderLeadsReportRegion(
  value: string | null
): Region | null {
  if (value && REGIONS.includes(value as Region)) {
    return value as Region;
  }
  return null;
}

export function parseUploaderLeadsReportState(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function parseUploaderLeadsReportAllTime(value: string | null): boolean {
  return value === "1" || value === "true";
}

export function uploaderLeadsReportDateScopeLabel(
  range: { dateFrom: string; dateTo: string },
  allTime: boolean
): string {
  if (allTime) return "all time";
  return overviewDateRangeLabel(range);
}

export function canManageUploaderReportLead(row: UploaderLeadReportRow): boolean {
  if (row.leadPhase === "closed" || row.leadPhase === "pending_verification") {
    return false;
  }
  if (row.leadPhase === "uploader_review") return false;
  return true;
}

export function canCloseUploaderReportLead(row: UploaderLeadReportRow): boolean {
  return row.leadPhase !== "closed";
}
