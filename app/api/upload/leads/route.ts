import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { sql } from "@/db/index";
import { fromDbStatus, fromDbTier } from "@/lib/db-mappers";
import {
  parseUploadLeadTab,
  parseExitSourceFilter,
  SQL_EXIT_MARKED_BY_ROLE,
  SQL_UPLOADER_PENDING_QUEUE,
  type UploadLeadTab,
  type ExitSourceFilter,
} from "@/lib/lead-exit";
import {
  SQL_PHASE_CLOSED,
  SQL_PHASE_UPLOADER_REVIEW,
} from "@/lib/lead-phase";
import {
  parseExcludeBooked,
  parseExcludeExpired,
  parseOptionalDate,
  parseVerifiedRoutingFilter,
  sqlVerifiedRoutingFilter,
} from "@/lib/upload-verified-filters";
import {
  parseUploadConnectAttemptFilter,
  parseUploadPendingSort,
  type UploadConnectAttemptFilter,
  type UploadPendingSort,
} from "@/lib/upload-pending-filters";
import type { BrideLead } from "@/lib/types";
import { toIsoTimestamp } from "@/lib/utils";
import { uploadLeadsToCsv } from "@/lib/upload-leads-csv";

export async function GET(request: Request) {
  const auth = await requireRoles(["leadUploader", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const params = new URL(request.url).searchParams;
  const format = params.get("format");
  const tab: UploadLeadTab = parseUploadLeadTab(
    params.get("tab"),
    params.get("verified")
  );
  const searchQ =
    tab === "verified" || tab === "closed" || tab === "review"
      ? params.get("q")?.trim() || null
      : null;
  const routingFilter =
    tab === "verified" ? parseVerifiedRoutingFilter(params.get("routing")) : "all";
  const rmIdFilter =
    tab === "verified" ? params.get("rmId")?.trim() || null : null;
  const eventFrom = tab === "verified" ? parseOptionalDate(params.get("eventFrom")) : null;
  const eventTo = tab === "verified" ? parseOptionalDate(params.get("eventTo")) : null;
  const excludeExpired = tab === "verified" ? parseExcludeExpired(params.get("excludeExpired")) : true;
  const excludeBooked = tab === "verified" ? parseExcludeBooked(params.get("excludeBooked")) : true;
  const stateFilter =
    tab === "verified" || tab === "pending" || tab === "review"
      ? params.get("state")?.trim() || null
      : null;
  const exitSourceFilter: ExitSourceFilter =
    tab === "review" ? parseExitSourceFilter(params.get("source")) : "all";
  const connectAttemptFilterReview: UploadConnectAttemptFilter =
    tab === "review"
      ? parseUploadConnectAttemptFilter(params.get("connectAttempts"))
      : "all";
  const connectAttemptCountReview =
    tab === "review" && connectAttemptFilterReview !== "all"
      ? Number(connectAttemptFilterReview)
      : null;
  const pendingSort: UploadPendingSort =
    tab === "pending" ? parseUploadPendingSort(params.get("sort")) : "latest";
  const reviewSort: UploadPendingSort =
    tab === "review" ? parseUploadPendingSort(params.get("sort")) : "latest";
  const connectAttemptFilter: UploadConnectAttemptFilter =
    tab === "pending"
      ? parseUploadConnectAttemptFilter(params.get("connectAttempts"))
      : "all";
  const connectAttemptCount =
    tab === "pending" && connectAttemptFilter !== "all"
      ? Number(connectAttemptFilter)
      : null;

  if (USE_MOCK) {
    const mockRows = mockStore.getUploadLeads(tab, {
      searchQ,
      routing: routingFilter,
      rmId: rmIdFilter,
      eventFrom,
      eventTo,
      excludeExpired,
      excludeBooked,
      state: stateFilter,
      exitSource: exitSourceFilter,
      connectAttemptsReview: connectAttemptFilterReview,
      pendingSort,
      reviewSort,
      connectAttempts: connectAttemptFilter,
    });
    if (format === "csv" && (tab === "review" || tab === "closed")) {
      const csv = uploadLeadsToCsv(tab, mockRows);
      const filename = tab === "closed" ? "closed-leads.csv" : "review-leads.csv";
      return new NextResponse(`\uFEFF${csv}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }
    return NextResponse.json({
      data: mockRows,
      error: null,
    });
  }

  const pendingOrderBy =
    pendingSort === "oldest" ? "bl.created_at ASC" : "bl.created_at DESC";
  const reviewOrderBy =
    reviewSort === "oldest" ? "bl.updated_at ASC" : "bl.updated_at DESC";
  const orderBySql =
    tab === "pending"
      ? pendingOrderBy
      : tab === "review"
        ? reviewOrderBy
        : "bl.updated_at DESC";

  const rows = await sql<
    {
      id: string;
      displayId: string;
      brideName: string;
      phone: string;
      email: string | null;
      city: string;
      region: string;
      eventLocation: string | null;
      eventDate: string;
      budgetAmount: string | null;
      budgetTier: string;
      source: string | null;
      status: string;
      portalOnly: boolean;
      hostileNote: string | null;
      handoverReason: string | null;
      verificationConnectAttempts: number;
      uploaderConfirmation: string | null;
      uploaderConfirmedAt: string | null;
      exitMarkedByRole: string | null;
      createdAt: string;
      eventCount: number;
      ceremonies: string | null;
      assignedRmId: string | null;
      assignedRmName: string | null;
      assignmentDate: string | null;
    }[]
  >`
    SELECT
      bl.id,
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      bl.phone,
      bl.email,
      bl.city,
      bl.region::text AS region,
      bl.event_location AS "eventLocation",
      bl.event_date::text AS "eventDate",
      bl.budget_amount::text AS "budgetAmount",
      bl.budget_tier::text AS "budgetTier",
      bl.source,
      bl.status::text AS status,
      COALESCE(bl.portal_only, false) AS "portalOnly",
      bl.hostile_note AS "hostileNote",
      bl.verification_connect_attempts AS "verificationConnectAttempts",
      bl.handover_reason AS "handoverReason",
      bl.uploader_confirmation AS "uploaderConfirmation",
      bl.uploader_confirmed_at AS "uploaderConfirmedAt",
      bl.assigned_rm_id AS "assignedRmId",
      rm.name AS "assignedRmName",
      bl.assignment_date::text AS "assignmentDate",
      (${sql.unsafe(SQL_EXIT_MARKED_BY_ROLE)}) AS "exitMarkedByRole",
      bl.created_at AS "createdAt",
      (SELECT COUNT(*)::int FROM lead_events le WHERE le.lead_id = bl.id) AS "eventCount",
      (
        SELECT string_agg(le.ceremony_type, ', ' ORDER BY le.event_date)
        FROM lead_events le
        WHERE le.lead_id = bl.id
      ) AS ceremonies
    FROM bride_leads bl
    LEFT JOIN staff rm ON rm.id = bl.assigned_rm_id
    WHERE (
      (
        ${tab} = 'review'
        AND ${sql.unsafe(SQL_PHASE_UPLOADER_REVIEW)}
      ) OR (
        ${tab} = 'closed'
        AND ${sql.unsafe(SQL_PHASE_CLOSED)}
      ) OR (
        ${tab} = 'verified'
        AND bl.verified = true
        AND bl.status NOT IN ('pending_verification', 'archived')
        AND (${excludeExpired} = false OR bl.status <> 'expired')
        AND (${excludeBooked} = false OR bl.status <> 'booked')
      ) OR (
        ${tab} = 'pending'
        AND ${sql.unsafe(SQL_UPLOADER_PENDING_QUEUE)}
      )
    )
    AND (
      ${searchQ}::text IS NULL
      OR bl.bride_name ILIKE '%' || ${searchQ} || '%'
      OR bl.city ILIKE '%' || ${searchQ} || '%'
      OR bl.phone ILIKE '%' || ${searchQ} || '%'
      OR regexp_replace(bl.phone, '\\D', '', 'g') LIKE '%' || regexp_replace(${searchQ}, '\\D', '', 'g') || '%'
    )
    AND (
      ${tab} <> 'verified'
      OR ${sql.unsafe(sqlVerifiedRoutingFilter(routingFilter))}
    )
    AND (
      ${rmIdFilter}::text IS NULL
      OR bl.assigned_rm_id = ${rmIdFilter}::uuid
    )
    AND (
      ${eventFrom}::date IS NULL
      OR bl.event_date >= ${eventFrom}::date
    )
    AND (
      ${eventTo}::date IS NULL
      OR bl.event_date <= ${eventTo}::date
    )
    AND (
      ${tab} NOT IN ('verified', 'pending', 'review')
      OR ${stateFilter}::text IS NULL
      OR EXISTS (
        SELECT 1 FROM city_regions cr
        WHERE lower(trim(cr.city)) = lower(trim(bl.city))
          AND cr.state = ${stateFilter}
      )
    )
    AND (
      ${tab} <> 'review'
      OR ${exitSourceFilter} = 'all'
      OR (${sql.unsafe(SQL_EXIT_MARKED_BY_ROLE)}) = ${exitSourceFilter}
    )
    AND (
      ${tab} <> 'review'
      OR ${connectAttemptCountReview}::int IS NULL
      OR bl.verification_connect_attempts = ${connectAttemptCountReview}::int
    )
    AND (
      ${tab} <> 'pending'
      OR ${connectAttemptCount}::int IS NULL
      OR bl.verification_connect_attempts = ${connectAttemptCount}::int
    )
    ORDER BY ${sql.unsafe(orderBySql)}
  `;

  const data: (BrideLead & {
    eventCount: number;
    ceremonies: string | null;
    portalOnly: boolean;
    handoverReason: string | null;
  })[] = rows.map((r) => ({
    id: r.id,
    displayId: r.displayId,
    brideName: r.brideName,
    phone: r.phone,
    email: r.email,
    city: r.city,
    region: r.region as BrideLead["region"],
    eventLocation: r.eventLocation,
    eventDate: r.eventDate,
    budgetAmount: r.budgetAmount ? Number(r.budgetAmount) : null,
    budgetTier: fromDbTier(String(r.budgetTier)),
    source: r.source,
    status: fromDbStatus(String(r.status)),
    verified: tab === "verified",
    verifiedAt: null,
    verifiedBy: null,
    assignedRmId: r.assignedRmId,
    assignmentDate: r.assignmentDate,
    assignedRmName: r.assignedRmName,
    shiftedAt: null,
    ownerAssignedAt: null,
    handoverReason: r.handoverReason,
    groupSize: 1,
    groupNotes: null,
    hostileNote: r.hostileNote,
    verificationConnectAttempts: Number(r.verificationConnectAttempts ?? 0),
    uploaderConfirmation: r.uploaderConfirmation as BrideLead["uploaderConfirmation"],
    uploaderConfirmedAt: r.uploaderConfirmedAt
      ? toIsoTimestamp(r.uploaderConfirmedAt)
      : null,
    exitMarkedByRole: r.exitMarkedByRole,
    portalOnly: r.portalOnly,
    createdAt: toIsoTimestamp(r.createdAt),
    updatedAt: toIsoTimestamp(r.createdAt),
    eventCount: r.eventCount,
    ceremonies: r.ceremonies,
  }));

  if (format === "csv") {
    if (tab !== "review" && tab !== "closed") {
      return NextResponse.json(
        { data: null, error: "CSV export is only supported for review and closed tabs" },
        { status: 400 },
      );
    }
    const csv = uploadLeadsToCsv(tab, data);
    const filename = tab === "closed" ? "closed-leads.csv" : "review-leads.csv";
    return new NextResponse(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return NextResponse.json({ data, error: null });
}
