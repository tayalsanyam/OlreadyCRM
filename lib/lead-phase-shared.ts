/** Client-safe lead phase types and labels (no DB imports). */

export type LeadPhase =
  | "pending_verification"
  | "verified_pool"
  | "assigned"
  | "commission"
  | "booked"
  | "uploader_review"
  | "closed"
  | "expired";

export const LEAD_PHASE_LABELS: Record<LeadPhase, string> = {
  pending_verification: "Pending verification",
  verified_pool: "Verified pool",
  assigned: "Assigned",
  commission: "Commission",
  booked: "Booked",
  uploader_review: "Review",
  closed: "Closed",
  expired: "Expired",
};

export const LEAD_PHASES: LeadPhase[] = [
  "pending_verification",
  "verified_pool",
  "assigned",
  "commission",
  "booked",
  "uploader_review",
  "closed",
  "expired",
];

export function parseLeadPhase(raw: string | null): LeadPhase | null {
  if (!raw) return null;
  return LEAD_PHASES.includes(raw as LeadPhase) ? (raw as LeadPhase) : null;
}

export type AdminOffWorkingView = "uploader_review" | "closed";

export type AdminReviewSubFilter = "all" | "not_answering" | "not_interested";

export function parseAdminOffWorkingView(raw: string | null): AdminOffWorkingView {
  if (raw === "closed") return "closed";
  if (raw === "uploader_review" || raw === "attrition" || raw === "review") {
    return "uploader_review";
  }
  return "uploader_review";
}

export function parseAdminReviewSubFilter(_raw: string | null): AdminReviewSubFilter {
  return "all";
}
