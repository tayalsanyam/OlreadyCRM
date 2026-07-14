import type { LeadStatus, UploaderConfirmation, UserRole } from "@/lib/types";

/** Postgres / bride_leads.exit_marked_by_role values */
export type ExitMarkedByRole =
  | "regional_rm"
  | "commission_rm"
  | "lead_uploader"
  | "admin"
  | "owner";

export const EXIT_MARKED_BY_LABELS: Record<ExitMarkedByRole, string> = {
  regional_rm: "Regional RM",
  commission_rm: "Commission RM",
  lead_uploader: "Lead uploader",
  admin: "Admin",
  owner: "Owner",
};

export type ExitSourceFilter = "all" | ExitMarkedByRole;

export function toDbExitMarkedByRole(role: UserRole | string): ExitMarkedByRole {
  const map: Record<string, ExitMarkedByRole> = {
    regionalRm: "regional_rm",
    commissionRm: "commission_rm",
    leadUploader: "lead_uploader",
    admin: "admin",
    owner: "owner",
    regional_rm: "regional_rm",
    commission_rm: "commission_rm",
    lead_uploader: "lead_uploader",
  };
  return map[role] ?? "admin";
}

export function parseExitSourceFilter(raw: string | null): ExitSourceFilter {
  if (!raw || raw === "all") return "all";
  const key = raw.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
  if (key in EXIT_MARKED_BY_LABELS) return key as ExitMarkedByRole;
  if (raw === "regionalRm") return "regional_rm";
  if (raw === "commissionRm") return "commission_rm";
  if (raw === "leadUploader") return "lead_uploader";
  return "all";
}

/** SQL: inferred exit_marked_by_role when column unset (legacy rows). */
export const SQL_EXIT_MARKED_BY_ROLE = `
  COALESCE(
    bl.exit_marked_by_role,
    CASE
      WHEN bl.handover_reason ILIKE '%uploader verification%'
        OR bl.handover_reason ILIKE '%from not answering review%'
        OR bl.uploader_confirmation IS NOT NULL
        THEN 'lead_uploader'
      WHEN bl.status = 'commission_rm'
        AND bl.handover_reason ILIKE '%not interested%'
        THEN 'regional_rm'
      WHEN bl.status = 'archived'
        AND bl.hostile_note IS NOT NULL
        AND TRIM(bl.hostile_note) <> ''
        THEN (
          SELECT st.role::text
          FROM comms c
          JOIN staff st ON st.id = c.actor_id
          WHERE c.lead_id = bl.id
            AND c.entry_type = 'hostile_flagged'
          ORDER BY c.created_at DESC
          LIMIT 1
        )
      ELSE NULL
    END
  )
`;

/** User-facing labels — use everywhere (RM, Commission, uploader, admin). */
export const LEAD_EXIT_LABELS = {
  notAnswering: "Not Answering",
  notAnsweringShort: "Not Answering",
  notInterested: "Not Interested",
  notInterestedPlanMuas: "Not interested in plan MUAs",
  archived: "Archived",
  closed: "Closed",
  reviewAndRoute: "Review & route",
  reviewAndConfirm: "Review & confirm",
  confirmNi: "Confirm Not Interested",
  flagRmError: "RM / Commission was wrong",
  moveToNotInterested: "Not Interested",
  moveToArchived: "Not Interested",
  /** @deprecated Same as notInterested — kept for comm log matching */
  notInterestedAndArchive: "Not Interested",
  /** Uploader tab: RM / Commission exits awaiting uploader. */
  uploaderReview: "Review",
  /** Uploader tab: finalized off pipeline. */
  uploaderClosed: "Closed",
  /** @deprecated Use uploaderClosed — legacy label */
  uploaderClosedNotInterested: "Closed",
  /** @deprecated Use uploaderClosed — legacy label */
  uploaderDeactivated: "Closed",
  closeLead: "Close lead",
  reactivate: "Reactivate lead",
  connectAgain: "Connect again",
} as const;

/** SQL fragment: lead has an active not-answering flag. */
export const SQL_IS_NOT_ANSWERING = `
  (bl.status = 'archived'
    AND bl.hostile_note IS NOT NULL
    AND TRIM(bl.hostile_note) <> '')
`;

/**
 * Clear a prior uploader review cycle when RM/Commission archives again.
 * Without this, stale `reopen` / `rm_error` skips uploader_review and lands in closed.
 */
export const SQL_RESET_UPLOADER_CONFIRMATION = `
  uploader_confirmation = NULL,
  uploader_confirmed_at = NULL,
  uploader_confirmed_by = NULL
`;

/** NI closure evidence: handover text, stored exit role, or RM/Commission archive comms. */
export const SQL_NI_CLOSURE_EVIDENCE = `
  (
    bl.handover_reason ILIKE '%not interested%'
    OR bl.exit_marked_by_role IN ('regional_rm', 'commission_rm')
    OR EXISTS (
      SELECT 1 FROM comms c
      WHERE c.lead_id = bl.id
        AND (
          c.description ILIKE '%not interested% — archived by%'
          OR c.description ILIKE '%Not interested in Olready services%'
        )
    )
  )
`;

/** Uploader deactivated a verified lead (Manage → Deactivate). Excludes NI closures. */
export const SQL_IS_UPLOADER_DEACTIVATED = `
  (
    bl.handover_reason ILIKE '%deactivated%'
    OR EXISTS (
      SELECT 1 FROM comms c
      WHERE c.lead_id = bl.id
        AND c.description ILIKE 'Lead deactivated:%'
      LIMIT 1
    )
  )
`;

/** SQL fragment: not-interested handover (RM shift or closed as NI). */
export const SQL_IS_NOT_INTERESTED = `
  (
    bl.status IN ('commission_rm', 'archived')
    AND ${SQL_NI_CLOSURE_EVIDENCE}
    AND NOT ${SQL_IS_NOT_ANSWERING}
  )
`;

/** Admin: plan-MUA NI handoffs + archived NI. */
export const SQL_ADMIN_NOT_INTERESTED = `
  bl.status IN ('commission_rm', 'archived')
  AND ${SQL_NI_CLOSURE_EVIDENCE}
  AND NOT (
    bl.status = 'archived'
    AND bl.hostile_note IS NOT NULL
    AND TRIM(bl.hostile_note) <> ''
  )
`;

/** Uploader queue — pending verification (includes wrongly auto-expired before verify). */
export const SQL_UPLOADER_PENDING_QUEUE = `
  bl.verified = false
  AND (
    bl.status = 'pending_verification'
    OR (bl.status = 'expired' AND bl.verified_at IS NULL)
  )
`;

/**
 * Uploader: archived NI only — includes RM/Commission closures for uploader confirm.
 * Excludes commission_rm (still active in Commission queue).
 */
export const SQL_UPLOADER_CLOSED_NOT_INTERESTED = `
  bl.status = 'archived'
  AND NOT ${SQL_IS_NOT_ANSWERING}
  AND NOT (
    bl.verified = true
    AND NOT ${SQL_NI_CLOSURE_EVIDENCE}
    AND ${SQL_IS_UPLOADER_DEACTIVATED}
  )
  AND ${SQL_NI_CLOSURE_EVIDENCE}
`;

/** Uploader deactivated a previously verified lead (Manage → Deactivate). */
export const SQL_UPLOADER_DEACTIVATED = `
  bl.status = 'archived'
  AND bl.verified = true
  AND NOT ${SQL_IS_NOT_ANSWERING}
  AND NOT ${SQL_NI_CLOSURE_EVIDENCE}
  AND ${SQL_IS_UPLOADER_DEACTIVATED}
`;

export const UPLOADER_NI_HANDOVER_VERIFY =
  "Not interested in Olready services (uploader verification)";

/** Commission archives an NI lead after closing MUA conversations. */
export const COMMISSION_NI_ARCHIVE_HANDOVER =
  "Not interested — commission closed";

/** Regional RM archives when bride is not interested in Olready services. */
export const RM_NI_ARCHIVE_HANDOVER =
  "Not interested in Olready services (RM)";

export type VerifyOutcome = "complete" | "not_interested_archive" | "not_answering_archive";

export const UPLOADER_CONFIRMATION_LABELS: Record<UploaderConfirmation, string> = {
  confirmed_ni: "Confirmed not interested",
  rm_error: "RM / Commission error — reopen",
  reopen: "Reopened for assignment",
};

/** Uploader NI tab: filter by review / confirmation state. */
export type UploaderConfirmationFilter = "all" | "pending" | UploaderConfirmation;

export const UPLOADER_CONFIRMATION_FILTER_LABELS: Record<
  UploaderConfirmationFilter,
  string
> = {
  all: "All confirmation states",
  pending: "Awaiting uploader review",
  confirmed_ni: UPLOADER_CONFIRMATION_LABELS.confirmed_ni,
  rm_error: UPLOADER_CONFIRMATION_LABELS.rm_error,
  reopen: UPLOADER_CONFIRMATION_LABELS.reopen,
};

export function parseUploaderConfirmationFilter(
  raw: string | null
): UploaderConfirmationFilter {
  if (!raw || raw === "all") return "all";
  if (raw === "pending") return "pending";
  if (raw in UPLOADER_CONFIRMATION_LABELS) {
    return raw as UploaderConfirmation;
  }
  return "all";
}

export type UploadLeadTab = "pending" | "verified" | "review" | "closed";

/** Legacy tab query params map to the simplified uploader workspace. */
export function parseUploadLeadTab(
  tabParam: string | null,
  verifiedLegacy: string | null
): UploadLeadTab {
  if (
    tabParam === "review" ||
    tabParam === "not_answering" ||
    tabParam === "not_interested" ||
    tabParam === "hostile"
  ) {
    return "review";
  }
  if (tabParam === "closed" || tabParam === "deactivated") return "closed";
  if (tabParam === "verified") return "verified";
  if (verifiedLegacy === "true") return "verified";
  return "pending";
}

export type AdminExitBucket = "all" | "not_answering" | "not_interested" | "closed";

export function parseAdminExitBucket(raw: string | null): AdminExitBucket {
  if (
    raw === "not_answering" ||
    raw === "hostile" ||
    raw === "not_interested" ||
    raw === "closed"
  ) {
    if (raw === "hostile") return "not_answering";
    return raw;
  }
  return "all";
}

export type ExitKind =
  | "not_answering"
  | "not_interested"
  | "archived"
  | "missed"
  | "commission_rm";

export const EXIT_KIND_LABELS: Record<ExitKind, string> = {
  not_answering: LEAD_EXIT_LABELS.notAnswering,
  not_interested: LEAD_EXIT_LABELS.notInterested,
  archived: LEAD_EXIT_LABELS.archived,
  missed: "Missed",
  commission_rm: "Commission (NI)",
};

export function handoverIndicatesNotInterested(
  handoverReason?: string | null,
  exitMarkedByRole?: string | null
): boolean {
  if ((handoverReason ?? "").toLowerCase().includes("not interested")) return true;
  return exitMarkedByRole === "regional_rm" || exitMarkedByRole === "commission_rm";
}

export function exitKindFromRow(row: {
  status: string;
  hostileNote?: string | null;
  handoverReason?: string | null;
  exitMarkedByRole?: string | null;
}): ExitKind | null {
  const status = row.status as LeadStatus;
  const hostile = (row.hostileNote ?? "").trim();
  if (status === "archived" && hostile) return "not_answering";
  const ni = handoverIndicatesNotInterested(row.handoverReason, row.exitMarkedByRole);
  if ((status === "commissionRm" || status === "archived") && ni) {
    return "not_interested";
  }
  if (status === "archived") return "archived";
  if (status === "missed") return "missed";
  if (status === "commissionRm") return "commission_rm";
  return null;
}
