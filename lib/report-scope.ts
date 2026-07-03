import type { SessionUser } from "@/lib/types";

export type ReportScope =
  | { kind: "all" }
  | { kind: "rm"; staffId: string; region: string | null }
  | { kind: "commission" }
  | { kind: "feedback" };

export function scopeFromSession(session: SessionUser): ReportScope {
  if (session.role === "regionalRm") {
    return { kind: "rm", staffId: session.userId, region: session.region };
  }
  if (session.role === "commissionRm") {
    return { kind: "commission" };
  }
  if (session.role === "feedbackRm") {
    return { kind: "feedback" };
  }
  return { kind: "all" };
}

/** Roles allowed to use scoped /api/reports/* routes */
export const REPORT_ROLES = [
  "regionalRm",
  "commissionRm",
  "feedbackRm",
  "admin",
  "owner",
] as const;
