import { sql } from "@/db/index";
import type {
  AdminExitBucket,
  AdminExitCounts,
  AdminExitLeadRow,
} from "@/lib/admin-exit-leads-shared";
export type {
  AdminExitBucket,
  AdminExitCounts,
  AdminExitLeadRow,
} from "@/lib/admin-exit-leads-shared";
import { fromDbStatus, toDbTier } from "@/lib/db-mappers";
import { rowsToCsv } from "@/lib/csv";
import {
  adminOffWorkingFilterSql,
  LEAD_PHASE_LABELS,
  parseAdminOffWorkingView,
  parseAdminReviewSubFilter,
  SQL_PHASE_CLOSED,
  SQL_PHASE_UPLOADER_REVIEW,
  SQL_UPLOADER_REVIEW_NOT_ANSWERING,
  SQL_UPLOADER_REVIEW_NOT_INTERESTED,
  type AdminOffWorkingView,
  type AdminReviewSubFilter,
  type LeadPhase,
} from "@/lib/lead-phase";
import {
  EXIT_KIND_LABELS,
  EXIT_MARKED_BY_LABELS,
  SQL_IS_NOT_ANSWERING,
  SQL_NI_CLOSURE_EVIDENCE,
  type ExitKind,
  type ExitMarkedByRole,
  type ExitSourceFilter,
} from "@/lib/lead-exit";
import {
  LEAD_STATUS_LABELS,
  type BudgetTier,
  type LeadStatus,
  type Region,
  type UploaderConfirmation,
} from "@/lib/types";

const EFFECTIVE_EXIT_ROLE_SQL = `
  COALESCE(
    bl.exit_marked_by_role,
    CASE
      WHEN bl.handover_reason ILIKE '%uploader verification%'
        OR bl.handover_reason ILIKE '%from not answering review%'
        OR bl.uploader_confirmation IS NOT NULL
        THEN 'lead_uploader'
      WHEN bl.status = 'commission_rm'
        AND ${SQL_NI_CLOSURE_EVIDENCE}
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

const EXIT_KIND_CASE_SQL = `
  CASE
    WHEN ${SQL_IS_NOT_ANSWERING} THEN 'not_answering'
    WHEN ${SQL_NI_CLOSURE_EVIDENCE}
      AND NOT ${SQL_IS_NOT_ANSWERING}
      AND bl.lead_phase IN ('uploader_review', 'closed')
      THEN 'not_interested'
    WHEN bl.status = 'missed' THEN 'missed'
    WHEN bl.status = 'commission_rm' THEN 'commission_rm'
    WHEN bl.lead_phase = 'closed' THEN 'archived'
    WHEN bl.status = 'archived' THEN 'archived'
    ELSE 'archived'
  END
`;

export function bucketToViewSub(bucket: AdminExitBucket): {
  view: AdminOffWorkingView;
  sub: AdminReviewSubFilter;
} {
  if (bucket === "closed") return { view: "closed", sub: "all" };
  return { view: "uploader_review", sub: "all" };
}

export function bucketFilterSql(
  view: AdminOffWorkingView,
  sub: AdminReviewSubFilter
): string {
  if (view === "closed") return SQL_PHASE_CLOSED;
  if (sub === "not_answering") return SQL_UPLOADER_REVIEW_NOT_ANSWERING;
  if (sub === "not_interested") return SQL_UPLOADER_REVIEW_NOT_INTERESTED;
  if (sub === "all" && view === "uploader_review") return SQL_PHASE_UPLOADER_REVIEW;
  return adminOffWorkingFilterSql(view, sub);
}

/** Legacy bucket filter for log export. */
export function bucketFilter(bucket: AdminExitBucket) {
  const { view, sub } = bucketToViewSub(bucket);
  return sql`${sql.unsafe(bucketFilterSql(view, sub))}`;
}

function mapRow(r: {
  id: string;
  displayId: string;
  brideName: string;
  region: string;
  status: string;
  leadPhase: string;
  eventDate: string;
  updatedAt: string;
  exitKind: string;
  exitMarkedByRole: string | null;
  assignedRmName: string | null;
  hostileNote: string | null;
  handoverReason: string | null;
  uploaderConfirmation: string | null;
  portalOnly: boolean;
}): AdminExitLeadRow {
  return {
    id: r.id,
    displayId: r.displayId,
    brideName: r.brideName,
    region: r.region as Region,
    status: fromDbStatus(r.status),
    leadPhase: r.leadPhase as LeadPhase,
    eventDate: r.eventDate,
    updatedAt: r.updatedAt,
    exitKind: r.exitKind as ExitKind,
    exitMarkedByRole: (r.exitMarkedByRole as ExitMarkedByRole | null) ?? null,
    assignedRmName: r.assignedRmName,
    hostileNote: r.hostileNote,
    handoverReason: r.handoverReason,
    uploaderConfirmation: (r.uploaderConfirmation as UploaderConfirmation | null) ?? null,
    portalOnly: r.portalOnly,
  };
}

export type AdminExitQueryFilters = {
  region?: Region | null;
  state?: string | null;
  rmId?: string | null;
  budgetTier?: BudgetTier | null;
  eventFrom?: string | null;
  eventTo?: string | null;
};

export type AdminExitListParams = AdminExitQueryFilters & {
  view?: AdminOffWorkingView;
  subFilter?: AdminReviewSubFilter;
  /** @deprecated */
  bucket?: AdminExitBucket;
  source?: ExitSourceFilter;
};

function resolveViewSub(params: AdminExitListParams): {
  view: AdminOffWorkingView;
  sub: AdminReviewSubFilter;
} {
  if (params.view) {
    return {
      view: params.view,
      sub: params.subFilter ?? "all",
    };
  }
  return bucketToViewSub(params.bucket ?? "all");
}

export async function fetchAdminExitLeads(
  params: AdminExitListParams
): Promise<AdminExitLeadRow[]> {
  const { view, sub } = resolveViewSub(params);
  const region = params.region ?? null;
  const state = params.state ?? null;
  const rmId = params.rmId ?? null;
  const eventFrom = params.eventFrom ?? null;
  const eventTo = params.eventTo ?? null;
  const dbTier = params.budgetTier ? toDbTier(params.budgetTier) : null;
  const source = params.source ?? "all";
  const sourceDb = source === "all" ? null : source;

  const rows = await sql<
    Parameters<typeof mapRow>[0][]
  >`
    WITH scoped AS (
      SELECT
        bl.id,
        bl.display_id,
        bl.bride_name,
        bl.region,
        bl.status,
        bl.lead_phase,
        bl.event_date,
        bl.updated_at,
        bl.hostile_note,
        bl.handover_reason,
        bl.uploader_confirmation,
        bl.assigned_rm_id,
        COALESCE(bl.portal_only, false) AS portal_only,
        ${sql.unsafe(EFFECTIVE_EXIT_ROLE_SQL)} AS effective_exit_role,
        ${sql.unsafe(EXIT_KIND_CASE_SQL)} AS exit_kind
      FROM bride_leads bl
      WHERE ${sql.unsafe(bucketFilterSql(view, sub))}
        AND (${region}::text IS NULL OR bl.region = ${region}::region)
        AND (${rmId}::uuid IS NULL OR bl.assigned_rm_id = ${rmId}::uuid)
        AND (${eventFrom}::date IS NULL OR bl.event_date >= ${eventFrom}::date)
        AND (${eventTo}::date IS NULL OR bl.event_date <= ${eventTo}::date)
        AND (${dbTier}::text IS NULL OR bl.budget_tier = ${dbTier}::budget_tier)
        AND (
          ${state}::text IS NULL
          OR EXISTS (
            SELECT 1 FROM city_regions cr
            WHERE lower(trim(cr.city)) = lower(trim(bl.city))
              AND cr.state = ${state}
          )
        )
    )
    SELECT
      s.id,
      s.display_id AS "displayId",
      s.bride_name AS "brideName",
      s.region::text AS region,
      s.status::text AS status,
      s.lead_phase::text AS "leadPhase",
      s.event_date::text AS "eventDate",
      s.updated_at::text AS "updatedAt",
      s.exit_kind AS "exitKind",
      s.effective_exit_role AS "exitMarkedByRole",
      st.name AS "assignedRmName",
      s.hostile_note AS "hostileNote",
      s.handover_reason AS "handoverReason",
      s.uploader_confirmation AS "uploaderConfirmation",
      s.portal_only AS "portalOnly"
    FROM scoped s
    LEFT JOIN staff st ON st.id = s.assigned_rm_id
    WHERE (${sourceDb}::text IS NULL OR s.effective_exit_role = ${sourceDb})
    ORDER BY s.updated_at DESC
  `;

  return rows.map(mapRow);
}

export async function fetchAdminExitCounts(
  params: AdminExitQueryFilters & {
    view?: AdminOffWorkingView;
    /** Scope counts to this view; default all off-working */
    scope?: "all" | AdminOffWorkingView;
  } = {}
): Promise<AdminExitCounts> {
  const scope = params.scope ?? "all";
  const region = params.region ?? null;
  const state = params.state ?? null;
  const rmId = params.rmId ?? null;
  const eventFrom = params.eventFrom ?? null;
  const eventTo = params.eventTo ?? null;
  const dbTier = params.budgetTier ? toDbTier(params.budgetTier) : null;

  const scopeSql =
    scope === "closed"
      ? SQL_PHASE_CLOSED
      : scope === "uploader_review"
        ? SQL_PHASE_UPLOADER_REVIEW
        : `(${SQL_PHASE_UPLOADER_REVIEW} OR ${SQL_PHASE_CLOSED})`;

  const [row] = await sql<
    {
      uploaderReview: number;
      notAnswering: number;
      notInterested: number;
      closed: number;
      total: number;
      regionalRm: number;
      commissionRm: number;
      leadUploader: number;
      admin: number;
      owner: number;
    }[]
  >`
    WITH scoped AS (
      SELECT
        bl.lead_phase,
        ${sql.unsafe(EFFECTIVE_EXIT_ROLE_SQL)} AS effective_exit_role,
        ${sql.unsafe(SQL_IS_NOT_ANSWERING)} AS is_not_answering,
        (${sql.unsafe(SQL_UPLOADER_REVIEW_NOT_INTERESTED)}) AS is_not_interested
      FROM bride_leads bl
      WHERE ${sql.unsafe(scopeSql)}
        AND (${region}::text IS NULL OR bl.region = ${region}::region)
        AND (${rmId}::uuid IS NULL OR bl.assigned_rm_id = ${rmId}::uuid)
        AND (${eventFrom}::date IS NULL OR bl.event_date >= ${eventFrom}::date)
        AND (${eventTo}::date IS NULL OR bl.event_date <= ${eventTo}::date)
        AND (${dbTier}::text IS NULL OR bl.budget_tier = ${dbTier}::budget_tier)
        AND (
          ${state}::text IS NULL
          OR EXISTS (
            SELECT 1 FROM city_regions cr
            WHERE lower(trim(cr.city)) = lower(trim(bl.city))
              AND cr.state = ${state}
          )
        )
    )
    SELECT
      COUNT(*) FILTER (WHERE lead_phase = 'uploader_review')::int AS uploader_review,
      COUNT(*) FILTER (WHERE is_not_answering)::int AS not_answering,
      COUNT(*) FILTER (WHERE is_not_interested)::int AS not_interested,
      COUNT(*) FILTER (WHERE lead_phase = 'closed')::int AS closed,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE effective_exit_role = 'regional_rm')::int AS regional_rm,
      COUNT(*) FILTER (WHERE effective_exit_role = 'commission_rm')::int AS commission_rm,
      COUNT(*) FILTER (WHERE effective_exit_role = 'lead_uploader')::int AS lead_uploader,
      COUNT(*) FILTER (WHERE effective_exit_role = 'admin')::int AS admin,
      COUNT(*) FILTER (WHERE effective_exit_role = 'owner')::int AS owner
    FROM scoped
  `;
  return {
    uploaderReview: row?.uploaderReview ?? 0,
    notAnswering: row?.notAnswering ?? 0,
    notInterested: row?.notInterested ?? 0,
    closed: row?.closed ?? 0,
    total: row?.total ?? 0,
    bySource: {
      regional_rm: row?.regionalRm ?? 0,
      commission_rm: row?.commissionRm ?? 0,
      lead_uploader: row?.leadUploader ?? 0,
      admin: row?.admin ?? 0,
      owner: row?.owner ?? 0,
    },
  };
}

export function adminExitLeadsToCsv(rows: AdminExitLeadRow[]): string {
  const headers = [
    "Display ID",
    "Bride",
    "Region",
    "Phase",
    "Exit type",
    "Marked by",
    "Status",
    "Assigned RM",
    "Context",
    "Uploader confirmation",
    "Event date",
    "Last updated",
  ];

  const data = rows.map((r) => [
    r.displayId,
    r.brideName,
    r.region,
    LEAD_PHASE_LABELS[r.leadPhase] ?? r.leadPhase,
    EXIT_KIND_LABELS[r.exitKind] ?? r.exitKind,
    r.exitMarkedByRole ? EXIT_MARKED_BY_LABELS[r.exitMarkedByRole] : "",
    LEAD_STATUS_LABELS[r.status] ?? r.status,
    r.assignedRmName ?? "",
    r.exitKind === "not_answering" ? r.hostileNote ?? "" : r.handoverReason ?? "",
    r.uploaderConfirmation ?? "",
    r.eventDate,
    r.updatedAt,
  ]);

  return rowsToCsv(headers, data);
}

export {
  parseAdminOffWorkingView,
  parseAdminReviewSubFilter,
  type AdminOffWorkingView,
  type AdminReviewSubFilter,
};
