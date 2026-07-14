import { sql } from "@/db/index";
import { fromDbStatus, toDbStatus, toDbTier, fromDbTier } from "@/lib/db-mappers";
import { rowsToCsv } from "@/lib/csv";
import {
  LEAD_LAST_CONTACT_UNION,
} from "@/lib/lead-contact-sql";
import type { AdminExpiredLeadRow } from "@/lib/admin-expired-leads-shared";
import { BUDGET_TIER_LABELS, LEAD_STATUS_LABELS } from "@/lib/types";
import type { BrideLead, BudgetTier, LeadFull, Region } from "@/lib/types";
import { csvDateCell, toIsoTimestamp } from "@/lib/utils";

export type AssignLeadsFilter = {
  region?: Region | null;
  state?: string | null;
  budgetTier?: BudgetTier | null;
  eventFrom?: string | null;
  eventTo?: string | null;
  search?: string | null;
};

/** @deprecated use AssignLeadsFilter */
export type AssignLeadsDateFilter = AssignLeadsFilter;

export type AdminLeadsListParams = AssignLeadsFilter & {
  statuses: string[];
  rmId?: string | null;
  format?: "json" | "csv";
};

export async function fetchAdminLeadsByStatus(
  params: AdminLeadsListParams
): Promise<BrideLead[]> {
  const dbStatuses = params.statuses.map((s) => toDbStatus(s));
  const region = params.region ?? null;
  const rmId = params.rmId ?? null;
  const dbTier = params.budgetTier ? toDbTier(params.budgetTier) : null;

  return sql<BrideLead[]>`
    SELECT bl.*
    FROM bride_leads bl
    WHERE bl.status = ANY(${dbStatuses}::lead_status[])
      AND (${region}::text IS NULL OR bl.region = ${region}::region)
      AND (${rmId}::uuid IS NULL OR bl.assigned_rm_id = ${rmId}::uuid)
      AND (${params.eventFrom ?? null}::date IS NULL OR bl.event_date >= ${params.eventFrom ?? null}::date)
      AND (${params.eventTo ?? null}::date IS NULL OR bl.event_date <= ${params.eventTo ?? null}::date)
      AND (${dbTier}::text IS NULL OR bl.budget_tier = ${dbTier}::budget_tier)
    ORDER BY bl.updated_at DESC
  `;
}

export async function fetchExpiredAdminLeads(params: {
  region?: Region | null;
  rmId?: string | null;
} = {}): Promise<AdminExpiredLeadRow[]> {
  const region = params.region ?? null;
  const rmId = params.rmId ?? null;

  const rows = await sql<
    {
      id: string;
      displayId: string;
      brideName: string;
      region: string;
      eventDate: string;
      budgetTierRaw: string;
      budgetAmount: string | number | null;
      status: string;
      expiredAt: string | null;
      lastRouting: string | null;
      lastRmName: string | null;
      muaPushCount: number;
      lastContactAt: string | null;
      lastContactChannel: string | null;
    }[]
  >`
    SELECT
      bl.id,
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      bl.region::text AS region,
      rm.lead_sla_event_date(bl.id)::text AS "eventDate",
      bl.budget_tier::text AS "budgetTierRaw",
      bl.budget_amount AS "budgetAmount",
      bl.status::text AS status,
      bl.expired_at AS "expiredAt",
      CASE
        WHEN COALESCE(bl.portal_only, false) AND bl.assigned_rm_id IS NULL THEN 'Portal'
        WHEN last_rm.role = 'commission_rm'::user_role THEN 'Commission'
        WHEN bl.assigned_rm_id IS NOT NULL THEN 'RM'
        WHEN bl.verified THEN 'RM pool'
        ELSE NULL
      END AS "lastRouting",
      last_rm.name AS "lastRmName",
      (
        SELECT COUNT(*)::int
        FROM mua_pushes mp
        WHERE mp.lead_id = bl.id
      ) AS "muaPushCount",
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
      ) AS "lastContactChannel"
    FROM bride_leads bl
    LEFT JOIN staff last_rm ON last_rm.id = bl.assigned_rm_id
    WHERE bl.status = 'expired'::lead_status
      AND (${region}::text IS NULL OR bl.region = ${region}::region)
      AND (${rmId}::uuid IS NULL OR bl.assigned_rm_id = ${rmId}::uuid)
    ORDER BY bl.expired_at DESC NULLS LAST, bl.updated_at DESC
  `;

  return rows.map((r) => ({
    id: r.id,
    displayId: r.displayId,
    brideName: r.brideName,
    region: r.region as Region,
    eventDate: r.eventDate,
    budgetTier: fromDbTier(r.budgetTierRaw),
    budgetAmount: r.budgetAmount != null ? Number(r.budgetAmount) : null,
    status: fromDbStatus(r.status),
    expiredAt: r.expiredAt ? toIsoTimestamp(r.expiredAt) : null,
    lastRouting: r.lastRouting,
    lastRmName: r.lastRmName,
    muaPushCount: Number(r.muaPushCount ?? 0),
    lastContactAt: r.lastContactAt ? toIsoTimestamp(r.lastContactAt) : null,
    lastContactChannel: r.lastContactChannel,
  }));
}

export function expiredAdminLeadsToCsv(rows: AdminExpiredLeadRow[]): string {
  const headers = [
    "Display ID",
    "Bride",
    "Region",
    "Event date",
    "Budget amount",
    "Budget tier",
    "Last routing",
    "Last RM",
    "MUA pushes",
    "Last contact at",
    "Last contact channel",
    "Expired at",
  ];
  const data = rows.map((l) => [
    l.displayId,
    l.brideName,
    l.region,
    csvDateCell(l.eventDate),
    l.budgetAmount ?? "",
    BUDGET_TIER_LABELS[l.budgetTier] ?? l.budgetTier,
    l.lastRouting ?? "",
    l.lastRmName ?? "",
    l.muaPushCount,
    csvDateCell(l.lastContactAt),
    l.lastContactChannel ?? "",
    csvDateCell(l.expiredAt),
  ]);
  return rowsToCsv(headers, data);
}

export async function fetchUnassignedLeads(
  params: AssignLeadsFilter = {}
): Promise<BrideLead[]> {
  const region = params.region ?? null;
  const state = params.state ?? null;
  const eventFrom = params.eventFrom ?? null;
  const eventTo = params.eventTo ?? null;
  const dbTier = params.budgetTier ? toDbTier(params.budgetTier) : null;
  const search = params.search ?? null;

  return sql<BrideLead[]>`
    SELECT * FROM bride_leads bl
    WHERE bl.lead_phase = 'verified_pool'
      AND bl.assigned_rm_id IS NULL
      AND bl.status = 'verified'
      AND bl.status NOT IN ('expired', 'archived', 'missed')
      AND (${region}::text IS NULL OR bl.region = ${region}::region)
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
      AND (
        ${search}::text IS NULL
        OR bl.bride_name ILIKE '%' || ${search} || '%'
        OR bl.display_id ILIKE '%' || ${search} || '%'
        OR bl.phone ILIKE '%' || ${search} || '%'
        OR regexp_replace(bl.phone, '\\D', '', 'g') LIKE '%' || regexp_replace(${search}, '\\D', '', 'g') || '%'
      )
    ORDER BY bl.verified_at DESC NULLS LAST, bl.event_date ASC
  `;
}

export function unassignedLeadsToCsv(rows: BrideLead[]): string {
  const headers = [
    "Display ID",
    "Bride",
    "Phone",
    "City",
    "Region",
    "Event date",
    "Tier",
    "Source",
    "Verified on",
    "Created",
  ];
  const data = rows.map((l) => [
    l.displayId,
    l.brideName,
    l.phone ?? "",
    l.city ?? "",
    l.region,
    csvDateCell(l.eventDate),
    BUDGET_TIER_LABELS[l.budgetTier] ?? l.budgetTier,
    l.source ?? "",
    csvDateCell(l.verifiedAt),
    csvDateCell(l.createdAt),
  ]);
  return rowsToCsv(headers, data);
}

export type AssignedLeadRow = LeadFull & {
  assignedRmName: string | null;
};

export async function fetchAssignedLeads(
  params: AssignLeadsFilter & {
    status?: string | null;
    rmId?: string | null;
  }
): Promise<AssignedLeadRow[]> {
  const dbStatus = params.status ? toDbStatus(params.status) : null;
  const region = params.region ?? null;
  const state = params.state ?? null;
  const rmId = params.rmId ?? null;
  const eventFrom = params.eventFrom ?? null;
  const eventTo = params.eventTo ?? null;
  const dbTier = params.budgetTier ? toDbTier(params.budgetTier) : null;
  const search = params.search ?? null;

  return sql<AssignedLeadRow[]>`
    SELECT
      bl.*,
      rm.compute_urgency_band(rm.lead_sla_event_date(bl.id)) AS urgency_band,
      (rm.lead_sla_event_date(bl.id) - CURRENT_DATE)::int AS days_to_event,
      CASE
        WHEN bl.assignment_date IS NULL THEN NULL
        ELSE GREATEST(0, (SELECT assignment_window_days FROM sla_config WHERE id = 1) - (CURRENT_DATE - bl.assignment_date))
      END AS assignment_days_remaining,
      CASE
        WHEN bl.assignment_date IS NULL THEN NULL
        ELSE (CURRENT_DATE - bl.assignment_date)
      END AS days_since_assignment,
      s.name AS assigned_rm_name,
      0 AS active_pushes_count,
      0 AS muas_offered_count,
      NULL::text AS muas_offered_names,
      0 AS event_count,
      0 AS booked_event_count,
      0 AS open_event_count,
      NULL::text AS event_labels,
      (SELECT MAX(c.created_at) FROM comms c WHERE c.lead_id = bl.id) AS last_activity_at
    FROM bride_leads bl
    LEFT JOIN staff s ON s.id = bl.assigned_rm_id
    WHERE bl.lead_phase IN ('assigned', 'commission', 'booked')
      AND bl.status IN ('assigned', 'commission_rm', 'booked')
      AND (${dbStatus}::text IS NULL OR bl.status = ${dbStatus}::lead_status)
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
      AND (
        ${search}::text IS NULL
        OR bl.bride_name ILIKE '%' || ${search} || '%'
        OR bl.display_id ILIKE '%' || ${search} || '%'
        OR bl.phone ILIKE '%' || ${search} || '%'
        OR regexp_replace(bl.phone, '\\D', '', 'g') LIKE '%' || regexp_replace(${search}, '\\D', '', 'g') || '%'
      )
    ORDER BY bl.assignment_date DESC NULLS LAST, bl.event_date ASC
  `;
}

export function assignedLeadsToCsv(
  rows: (LeadFull & { assignedRmName?: string | null })[]
): string {
  const headers = [
    "Display ID",
    "Bride",
    "Region",
    "Tier",
    "Status",
    "Assigned RM",
    "Assignment date",
    "Event date",
    "Last activity",
  ];
  const data = rows.map((l) => [
    l.displayId,
    l.brideName,
    l.region,
    BUDGET_TIER_LABELS[l.budgetTier] ?? l.budgetTier,
    LEAD_STATUS_LABELS[l.status] ?? l.status,
    l.assignedRmName ?? "",
    csvDateCell(l.assignmentDate),
    csvDateCell(l.eventDate),
    csvDateCell(l.lastActivityAt),
  ]);
  return rowsToCsv(headers, data);
}
