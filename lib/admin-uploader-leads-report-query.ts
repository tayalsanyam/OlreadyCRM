import { sql } from "@/db/index";
import type { OverviewDateRange } from "@/lib/admin-overview-date-range";
import {
  parseUploaderLeadsReportRegion,
  parseUploaderLeadsReportRouting,
  parseUploaderLeadsReportState,
  parseUploaderLeadsReportStatus,
  parseUploaderLeadsReportAllTime,
  type UploaderLeadReportRow,
  type UploaderLeadsReportRouting,
  type UploaderLeadsReportStatus,
  type UploaderLeadsReportStatusCounts,
} from "@/lib/admin-uploader-leads-report-types";
import {
  LEAD_EXIT_LABELS,
  SQL_UPLOADER_PENDING_QUEUE,
} from "@/lib/lead-exit";
import {
  SQL_LEAD_IS_EXPIRED,
  SQL_LEAD_NO_FUTURE_CEREMONIES,
} from "@/lib/lead-lifecycle";
import {
  LEAD_LAST_CONTACT_UNION,
  LEAD_CONTACT_TOUCHES_UNION,
} from "@/lib/lead-contact-sql";
import { fromDbStatus, fromDbTier } from "@/lib/db-mappers";
import type { Region } from "@/lib/types";
import { toIsoTimestamp } from "@/lib/utils";

export type {
  UploaderLeadReportRow,
  UploaderLeadsReportStatusCounts,
} from "@/lib/admin-uploader-leads-report-types";

const SQL_PHASE_UPLOADER_REVIEW = `bl.lead_phase = 'uploader_review'`;
const SQL_PHASE_CLOSED = `bl.lead_phase = 'closed'`;
const SQL_PHASE_BOOKED = `(bl.status = 'booked' OR bl.lead_phase = 'booked')`;
const SQL_VERIFIED_ACTIVE = `
  bl.verified = true
  AND bl.status NOT IN ('pending_verification', 'archived')
  AND bl.status <> 'expired'
  AND bl.status <> 'booked'
  AND bl.lead_phase NOT IN ('uploader_review', 'closed', 'expired', 'booked')
  AND NOT (${SQL_LEAD_NO_FUTURE_CEREMONIES.trim()})
`.trim();

function sqlUploaderWorkspaceStatusFilter(status: UploaderLeadsReportStatus): string {
  switch (status) {
    case "pending":
      return SQL_UPLOADER_PENDING_QUEUE.trim();
    case "verified":
      return SQL_VERIFIED_ACTIVE;
    case "review":
      return SQL_PHASE_UPLOADER_REVIEW.trim();
    case "closed":
      return SQL_PHASE_CLOSED.trim();
    case "booked":
      return SQL_PHASE_BOOKED;
    case "expired":
      return SQL_LEAD_IS_EXPIRED.trim();
    default:
      return "TRUE";
  }
}

function sqlUploaderReportRoutingFilter(routing: UploaderLeadsReportRouting): string {
  switch (routing) {
    case "portal":
      return `
        COALESCE(bl.portal_only, false) = true
        AND bl.status = 'verified'
        AND NOT (${SQL_LEAD_NO_FUTURE_CEREMONIES.trim()})
      `.trim();
    case "rm":
      return `
        bl.status = 'assigned' AND bl.assigned_rm_id IS NOT NULL
        AND NOT (${SQL_LEAD_NO_FUTURE_CEREMONIES.trim()})
      `.trim();
    case "commission":
      return `
        bl.status = 'commission_rm'
        AND NOT (${SQL_LEAD_NO_FUTURE_CEREMONIES.trim()})
      `.trim();
    case "rm_pool":
      return `
        bl.status = 'verified'
        AND COALESCE(bl.portal_only, false) = false
        AND bl.assigned_rm_id IS NULL
        AND NOT (${SQL_LEAD_NO_FUTURE_CEREMONIES.trim()})
      `.trim();
    default:
      return "TRUE";
  }
}

type ReportScope = {
  dateFrom: string;
  dateTo: string;
  allTime?: boolean;
  region?: Region | null;
  state?: string | null;
};

function reportScopeFilters(opts: ReportScope) {
  return {
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    allTime: opts.allTime ?? false,
    regionFilter: opts.region ?? null,
    stateFilter: opts.state ?? null,
  };
}

export async function fetchUploaderLeadsReportStatusCounts(
  opts: ReportScope
): Promise<{ counts: UploaderLeadsReportStatusCounts; totalInRange: number }> {
  const { dateFrom, dateTo, allTime, regionFilter, stateFilter } = reportScopeFilters(opts);

  const [row] = await sql<
    {
      total: number;
      pending: number;
      verified: number;
      review: number;
      closed: number;
      booked: number;
      expired: number;
    }[]
  >`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE ${sql.unsafe(SQL_UPLOADER_PENDING_QUEUE)})::int AS pending,
      COUNT(*) FILTER (WHERE ${sql.unsafe(SQL_VERIFIED_ACTIVE)})::int AS verified,
      COUNT(*) FILTER (WHERE ${sql.unsafe(SQL_PHASE_UPLOADER_REVIEW)})::int AS review,
      COUNT(*) FILTER (WHERE ${sql.unsafe(SQL_PHASE_CLOSED)})::int AS closed,
      COUNT(*) FILTER (WHERE ${sql.unsafe(SQL_PHASE_BOOKED)})::int AS booked,
      COUNT(*) FILTER (WHERE ${sql.unsafe(SQL_LEAD_IS_EXPIRED)})::int AS expired
    FROM bride_leads bl
    LEFT JOIN city_regions cr ON lower(trim(cr.city)) = lower(trim(bl.city))
    WHERE (
        ${allTime} = true
        OR (
          bl.created_at::date >= ${dateFrom}::date
          AND bl.created_at::date <= ${dateTo}::date
        )
      )
      AND (
        ${regionFilter}::text IS NULL
        OR bl.region::text = ${regionFilter}
      )
      AND (
        ${stateFilter}::text IS NULL
        OR cr.state = ${stateFilter}
      )
  `;

  return {
    totalInRange: Number(row?.total ?? 0),
    counts: {
      pending: Number(row?.pending ?? 0),
      verified: Number(row?.verified ?? 0),
      review: Number(row?.review ?? 0),
      closed: Number(row?.closed ?? 0),
      booked: Number(row?.booked ?? 0),
      expired: Number(row?.expired ?? 0),
    },
  };
}

export async function fetchUploaderLeadsReport(opts: {
  dateFrom: string;
  dateTo: string;
  allTime?: boolean;
  status?: UploaderLeadsReportStatus;
  routing?: UploaderLeadsReportRouting;
  region?: Region | null;
  state?: string | null;
}): Promise<UploaderLeadReportRow[]> {
  const status = opts.status ?? "all";
  const routing = opts.routing ?? "all";
  const statusSql = sqlUploaderWorkspaceStatusFilter(status);
  const routingSql = sqlUploaderReportRoutingFilter(routing);
  const { dateFrom, dateTo, allTime, regionFilter, stateFilter } = reportScopeFilters(opts);

  const rows = await sql<
    {
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
      budgetAmount: string | number | null;
      budgetTierRaw: string | null;
      eventDate: string | null;
      isExpired: boolean;
      muaPushCount: number;
      createdAt: string;
      verifiedAt: string | null;
      contactCount: number;
      lastContactAt: string | null;
      lastContactChannel: string | null;
      verificationConnectAttempts: number;
    }[]
  >`
    SELECT
      bl.id,
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      bl.phone,
      bl.city,
      cr.state,
      bl.region::text AS region,
      CASE
        WHEN bl.verified = false
          AND (
            bl.status = 'pending_verification'
            OR (bl.status = 'expired' AND bl.verified_at IS NULL)
          )
          THEN 'Pending verification'
        WHEN ${sql.unsafe(SQL_LEAD_IS_EXPIRED)} THEN 'Expired'
        WHEN bl.status = 'booked' OR bl.lead_phase = 'booked' THEN 'Booked'
        WHEN bl.verified = true AND bl.status NOT IN ('pending_verification', 'archived') THEN
          CASE
            WHEN bl.status = 'assigned' THEN 'Assigned'
            WHEN bl.status = 'commission_rm' THEN 'Commission'
            WHEN COALESCE(bl.portal_only, false) THEN 'Portal'
            WHEN bl.status = 'verified' AND bl.assigned_rm_id IS NULL THEN 'RM pool'
            ELSE 'Verified'
          END
        WHEN bl.lead_phase = 'uploader_review' THEN ${LEAD_EXIT_LABELS.uploaderReview}
        WHEN bl.lead_phase = 'closed' THEN ${LEAD_EXIT_LABELS.uploaderClosed}
        ELSE INITCAP(REPLACE(bl.status::text, '_', ' '))
      END AS "workspaceStatus",
      CASE
        WHEN COALESCE(bl.portal_only, false)
          AND bl.verified = true
          AND bl.status NOT IN ('archived', 'pending_verification')
          THEN 'Portal'
        WHEN bl.status = 'commission_rm' THEN 'Commission'
        WHEN bl.status = 'assigned' THEN 'RM'
        WHEN bl.verified = true AND bl.status = 'verified' THEN 'RM pool'
        ELSE NULL
      END AS routing,
      CASE
        WHEN bl.status IN ('assigned', 'commission_rm', 'booked') THEN rm.name
        ELSE NULL
      END AS "assignedTo",
      bl.assigned_rm_id AS "assignedRmId",
      COALESCE(bl.portal_only, false) AS "portalOnly",
      bl.lead_phase::text AS "leadPhase",
      bl.status::text AS "dbStatus",
      bl.source,
      bl.budget_amount AS "budgetAmount",
      bl.budget_tier::text AS "budgetTierRaw",
      rm.lead_sla_event_date(bl.id)::text AS "eventDate",
      (${sql.unsafe(SQL_LEAD_IS_EXPIRED)}) AS "isExpired",
      (
        SELECT COUNT(*)::int
        FROM mua_pushes mp
        WHERE mp.lead_id = bl.id
      ) AS "muaPushCount",
      bl.created_at AS "createdAt",
      bl.verified_at AS "verifiedAt",
      (
        SELECT COUNT(*)::int
        FROM (${sql.unsafe(LEAD_CONTACT_TOUCHES_UNION)}) touches
      ) AS "contactCount",
      (
        SELECT lc.at
        FROM (${sql.unsafe(LEAD_LAST_CONTACT_UNION)}) lc
        WHERE lc.at IS NOT NULL
        ORDER BY lc.at DESC
        LIMIT 1
      ) AS "lastContactAt",
      (
        SELECT lc.channel
        FROM (${sql.unsafe(LEAD_LAST_CONTACT_UNION)}) lc
        WHERE lc.at IS NOT NULL
        ORDER BY lc.at DESC
        LIMIT 1
      ) AS "lastContactChannel",
      COALESCE(bl.verification_connect_attempts, 0) AS "verificationConnectAttempts"
    FROM bride_leads bl
    LEFT JOIN staff rm ON rm.id = bl.assigned_rm_id
    LEFT JOIN city_regions cr ON lower(trim(cr.city)) = lower(trim(bl.city))
    WHERE (
        ${allTime} = true
        OR (
          bl.created_at::date >= ${dateFrom}::date
          AND bl.created_at::date <= ${dateTo}::date
        )
      )
      AND (${sql.unsafe(`(${statusSql})`)})
      AND (${sql.unsafe(`(${routingSql})`)})
      AND (
        ${regionFilter}::text IS NULL
        OR bl.region::text = ${regionFilter}
      )
      AND (
        ${stateFilter}::text IS NULL
        OR cr.state = ${stateFilter}
      )
    ORDER BY bl.created_at DESC
    LIMIT 2500
  `;

  return rows.map((r) => ({
    id: r.id,
    displayId: r.displayId,
    brideName: r.brideName,
    phone: r.phone,
    city: r.city,
    state: r.state,
    region: r.region,
    workspaceStatus: r.workspaceStatus,
    routing: r.routing,
    assignedTo: r.assignedTo,
    assignedRmId: r.assignedRmId,
    portalOnly: r.portalOnly,
    leadPhase: r.leadPhase,
    dbStatus: fromDbStatus(r.dbStatus),
    source: r.source,
    budgetAmount: r.budgetAmount != null ? Number(r.budgetAmount) : null,
    budgetTier: r.budgetTierRaw ? fromDbTier(r.budgetTierRaw) : null,
    eventDate: r.eventDate,
    isExpired: r.isExpired,
    muaPushCount: Number(r.muaPushCount ?? 0),
    createdAt: toIsoTimestamp(r.createdAt),
    verifiedAt: r.verifiedAt ? toIsoTimestamp(r.verifiedAt) : null,
    contactCount: Number(r.contactCount ?? 0),
    lastContactAt: r.lastContactAt ? toIsoTimestamp(r.lastContactAt) : null,
    lastContactChannel: r.lastContactChannel,
    verificationConnectAttempts: Number(r.verificationConnectAttempts ?? 0),
  }));
}

export function parseUploaderLeadsReportParams(
  searchParams: URLSearchParams,
  fallbackRange: OverviewDateRange
): {
  dateFrom: string;
  dateTo: string;
  allTime: boolean;
  status: UploaderLeadsReportStatus;
  routing: UploaderLeadsReportRouting;
  region: Region | null;
  state: string | null;
} {
  const dateFrom = searchParams.get("dateFrom")?.trim() || fallbackRange.dateFrom;
  const dateTo = searchParams.get("dateTo")?.trim() || fallbackRange.dateTo;
  const allTime = parseUploaderLeadsReportAllTime(searchParams.get("allTime"));
  const status = parseUploaderLeadsReportStatus(searchParams.get("status"));
  const routing = parseUploaderLeadsReportRouting(searchParams.get("routing"));
  const region = parseUploaderLeadsReportRegion(searchParams.get("region"));
  const state = parseUploaderLeadsReportState(searchParams.get("state"));
  return { dateFrom, dateTo, allTime, status, routing, region, state };
}

export async function fetchUploaderLeadsReportStates(): Promise<string[]> {
  const rows = await sql<{ state: string }[]>`
    SELECT DISTINCT state
    FROM city_regions
    WHERE state IS NOT NULL AND trim(state) <> ''
    ORDER BY state ASC
  `;
  return rows.map((r) => r.state);
}
