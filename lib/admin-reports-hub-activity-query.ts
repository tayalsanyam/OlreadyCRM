import { sql } from "@/db/index";
import {
  parseStaffActivityEntryGroups,
  staffActivityEntryGroupForType,
  staffActivityEntryGroupLabel,
  staffActivityEntryTypesForGroups,
  STAFF_ACTIVITY_ENTRY_GROUPS,
  type StaffActivityEntryGroupKey,
} from "@/lib/admin-reports-hub-activity-types";
import type {
  StaffActivityEntryGroupSummary,
  StaffActivityPayload,
  StaffActivityRoleFilter,
  StaffActivityRow,
  StaffActivitySummary,
} from "@/lib/admin-reports-hub-types";
import { rowsToCsv } from "@/lib/csv";
import { toIsoTimestamp } from "@/lib/utils";

function defaultDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 13);
  return d.toISOString().slice(0, 10);
}

function defaultDateTo(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseStaffActivityRole(raw: string | null): StaffActivityRoleFilter {
  if (raw === "regional_rm" || raw === "commission_rm" || raw === "lead_uploader") {
    return raw;
  }
  return "all";
}

function buildEntryGroupSummary(
  entryTypeCounts: Map<string, number>
): StaffActivityEntryGroupSummary[] {
  return STAFF_ACTIVITY_ENTRY_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    count: group.entryTypes.reduce(
      (sum, entryType) => sum + (entryTypeCounts.get(entryType) ?? 0),
      0
    ),
  }));
}

export async function fetchStaffActivityReport(opts: {
  dateFrom?: string | null;
  dateTo?: string | null;
  role?: StaffActivityRoleFilter;
  staffId?: string | null;
  search?: string | null;
  entryGroups?: StaffActivityEntryGroupKey[] | string | null;
  limit?: number;
}): Promise<StaffActivityPayload> {
  const dateFrom = opts.dateFrom || defaultDateFrom();
  const dateTo = opts.dateTo || defaultDateTo();
  const role = opts.role ?? "all";
  const staffId = opts.staffId ?? null;
  const search = opts.search?.trim() || null;
  const limit = opts.limit ?? 500;
  const entryGroups =
    typeof opts.entryGroups === "string"
      ? parseStaffActivityEntryGroups(opts.entryGroups)
      : (opts.entryGroups ?? []);
  const entryTypes = staffActivityEntryTypesForGroups(entryGroups);
  const entryTypesFilter = entryTypes ?? [];

  const roleParam = role === "all" ? null : role;
  const staffIdParam = staffId ?? null;
  const searchParam = search;
  const noEntryTypeFilter = entryTypes === null;

  const rows = await sql<
    {
      id: string;
      createdAt: string;
      entryType: string;
      description: string;
      actorName: string | null;
      actorRole: string;
      leadId: string | null;
      leadDisplayId: string | null;
      brideName: string | null;
      leadRegion: string | null;
    }[]
  >`
    SELECT
      c.id,
      c.created_at AS "createdAt",
      c.entry_type::text AS "entryType",
      c.description,
      s.name AS "actorName",
      s.role::text AS "actorRole",
      c.lead_id AS "leadId",
      bl.display_id AS "leadDisplayId",
      bl.bride_name AS "brideName",
      bl.region::text AS "leadRegion"
    FROM comms c
    JOIN staff s ON s.id = c.actor_id
    LEFT JOIN bride_leads bl ON bl.id = c.lead_id
    WHERE s.role IN (
        'regional_rm'::user_role,
        'commission_rm'::user_role,
        'lead_uploader'::user_role
      )
      AND (${roleParam}::text IS NULL OR s.role = ${roleParam}::user_role)
      AND (${staffIdParam}::uuid IS NULL OR s.id = ${staffIdParam}::uuid)
      AND c.created_at::date >= ${dateFrom}::date
      AND c.created_at::date <= ${dateTo}::date
      AND (
        ${searchParam}::text IS NULL
        OR c.description ILIKE '%' || ${searchParam} || '%'
        OR bl.bride_name ILIKE '%' || ${searchParam} || '%'
        OR bl.display_id ILIKE '%' || ${searchParam} || '%'
        OR bl.phone ILIKE '%' || ${searchParam} || '%'
      )
      AND (
        ${noEntryTypeFilter}::boolean
        OR c.entry_type::text = ANY(${entryTypesFilter}::text[])
      )
    ORDER BY c.created_at DESC
    LIMIT ${limit}
  `;

  const summaryRows = await sql<
    { actorRole: string; count: number }[]
  >`
    SELECT s.role::text AS "actorRole", COUNT(*)::int AS count
    FROM comms c
    JOIN staff s ON s.id = c.actor_id
    LEFT JOIN bride_leads bl ON bl.id = c.lead_id
    WHERE s.role IN (
        'regional_rm'::user_role,
        'commission_rm'::user_role,
        'lead_uploader'::user_role
      )
      AND (${roleParam}::text IS NULL OR s.role = ${roleParam}::user_role)
      AND (${staffIdParam}::uuid IS NULL OR s.id = ${staffIdParam}::uuid)
      AND c.created_at::date >= ${dateFrom}::date
      AND c.created_at::date <= ${dateTo}::date
      AND (
        ${searchParam}::text IS NULL
        OR c.description ILIKE '%' || ${searchParam} || '%'
        OR bl.bride_name ILIKE '%' || ${searchParam} || '%'
        OR bl.display_id ILIKE '%' || ${searchParam} || '%'
        OR bl.phone ILIKE '%' || ${searchParam} || '%'
      )
      AND (
        ${noEntryTypeFilter}::boolean
        OR c.entry_type::text = ANY(${entryTypesFilter}::text[])
      )
    GROUP BY s.role
  `;

  const entryTypeRows = await sql<{ entryType: string; count: number }[]>`
    SELECT c.entry_type::text AS "entryType", COUNT(*)::int AS count
    FROM comms c
    JOIN staff s ON s.id = c.actor_id
    LEFT JOIN bride_leads bl ON bl.id = c.lead_id
    WHERE s.role IN (
        'regional_rm'::user_role,
        'commission_rm'::user_role,
        'lead_uploader'::user_role
      )
      AND (${roleParam}::text IS NULL OR s.role = ${roleParam}::user_role)
      AND (${staffIdParam}::uuid IS NULL OR s.id = ${staffIdParam}::uuid)
      AND c.created_at::date >= ${dateFrom}::date
      AND c.created_at::date <= ${dateTo}::date
      AND (
        ${searchParam}::text IS NULL
        OR c.description ILIKE '%' || ${searchParam} || '%'
        OR bl.bride_name ILIKE '%' || ${searchParam} || '%'
        OR bl.display_id ILIKE '%' || ${searchParam} || '%'
        OR bl.phone ILIKE '%' || ${searchParam} || '%'
      )
      AND (
        ${noEntryTypeFilter}::boolean
        OR c.entry_type::text = ANY(${entryTypesFilter}::text[])
      )
    GROUP BY c.entry_type
  `;

  const entryTypeCounts = new Map<string, number>();
  for (const row of entryTypeRows) {
    entryTypeCounts.set(row.entryType, Number(row.count));
  }

  const summary: StaffActivitySummary = {
    total: summaryRows.reduce((s, r) => s + Number(r.count), 0),
    regionalRm: Number(summaryRows.find((r) => r.actorRole === "regional_rm")?.count ?? 0),
    commissionRm: Number(summaryRows.find((r) => r.actorRole === "commission_rm")?.count ?? 0),
    leadUploader: Number(summaryRows.find((r) => r.actorRole === "lead_uploader")?.count ?? 0),
    entryGroups: buildEntryGroupSummary(entryTypeCounts),
  };

  const mapped: StaffActivityRow[] = rows.map((r) => ({
    id: r.id,
    createdAt: toIsoTimestamp(r.createdAt),
    entryType: r.entryType,
    description: r.description,
    actorName: r.actorName,
    actorRole: r.actorRole,
    leadId: r.leadId,
    leadDisplayId: r.leadDisplayId,
    brideName: r.brideName,
    leadRegion: r.leadRegion,
  }));

  return {
    dateFrom,
    dateTo,
    role,
    staffId,
    search,
    entryGroups,
    summary,
    rows: mapped,
  };
}

export function staffActivityToCsv(rows: StaffActivityRow[]): string {
  const headers = [
    "When",
    "Role",
    "Staff",
    "Activity type",
    "Entry type",
    "Lead ID",
    "Bride",
    "Region",
    "Description",
  ];
  const data = rows.map((r) => [
    r.createdAt,
    r.actorRole,
    r.actorName ?? "",
    staffActivityEntryGroupForType(r.entryType)
      ? staffActivityEntryGroupLabel(staffActivityEntryGroupForType(r.entryType)!)
      : "",
    r.entryType,
    r.leadDisplayId ?? "",
    r.brideName ?? "",
    r.leadRegion ?? "",
    r.description,
  ]);
  return rowsToCsv(headers, data);
}
