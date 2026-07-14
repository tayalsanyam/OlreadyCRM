import { sql } from "@/db/index";
import { toDbStatus, toDbTier } from "@/lib/db-mappers";
import type { AssignLeadsFilter } from "@/lib/admin-leads-query";
import {
  bucketFilter,
  type AdminExitBucket,
} from "@/lib/admin-exit-leads-query";
import { commEntryLabel } from "@/lib/lead-comms-export";
import { rowsToCsv } from "@/lib/csv";
import { csvDateCell } from "@/lib/utils";
import type { ExitSourceFilter } from "@/lib/lead-exit";
import type { LeadStatus } from "@/lib/types";

export type AssignLeadLogView = "unassigned" | "assigned" | "attrition";

type LogRow = {
  leadDisplayId: string;
  brideName: string;
  region: string;
  eventDate: string;
  entryType: string;
  description: string;
  actorName: string | null;
  createdAt: string;
};

export async function fetchAssignLeadLogRows(params: {
  view: AssignLeadLogView;
  region?: AssignLeadsFilter["region"];
  budgetTier?: AssignLeadsFilter["budgetTier"];
  eventFrom?: string | null;
  eventTo?: string | null;
  status?: LeadStatus | null;
  bucket?: AdminExitBucket;
  source?: ExitSourceFilter;
}): Promise<LogRow[]> {
  const region = params.region ?? null;
  const eventFrom = params.eventFrom ?? null;
  const eventTo = params.eventTo ?? null;
  const dbTier = params.budgetTier ? toDbTier(params.budgetTier) : null;
  const dbStatus = params.status ? toDbStatus(params.status) : null;
  const source = params.source ?? "all";
  const sourceDb = source === "all" ? null : source;
  const bucket = params.bucket ?? "all";

  if (params.view === "unassigned") {
    return sql<LogRow[]>`
      SELECT
        bl.display_id AS "leadDisplayId",
        bl.bride_name AS "brideName",
        bl.region::text AS region,
        bl.event_date::text AS "eventDate",
        c.entry_type::text AS "entryType",
        c.description,
        s.name AS "actorName",
        c.created_at::text AS "createdAt"
      FROM comms c
      JOIN bride_leads bl ON bl.id = c.lead_id
      LEFT JOIN staff s ON s.id = c.actor_id
      WHERE bl.lead_phase = 'verified_pool'
        AND bl.assigned_rm_id IS NULL
        AND bl.status = 'verified'
        AND (${region}::text IS NULL OR bl.region = ${region}::region)
        AND (${eventFrom}::date IS NULL OR bl.event_date >= ${eventFrom}::date)
        AND (${eventTo}::date IS NULL OR bl.event_date <= ${eventTo}::date)
        AND (${dbTier}::text IS NULL OR bl.budget_tier = ${dbTier}::budget_tier)
      ORDER BY bl.display_id, c.created_at DESC
      LIMIT 10000
    `;
  }

  if (params.view === "assigned") {
    return sql<LogRow[]>`
      SELECT
        bl.display_id AS "leadDisplayId",
        bl.bride_name AS "brideName",
        bl.region::text AS region,
        bl.event_date::text AS "eventDate",
        c.entry_type::text AS "entryType",
        c.description,
        s.name AS "actorName",
        c.created_at::text AS "createdAt"
      FROM comms c
      JOIN bride_leads bl ON bl.id = c.lead_id
      LEFT JOIN staff s ON s.id = c.actor_id
      WHERE bl.status IN ('assigned', 'commission_rm', 'booked')
        AND (${dbStatus}::text IS NULL OR bl.status = ${dbStatus}::lead_status)
        AND (${region}::text IS NULL OR bl.region = ${region}::region)
        AND (${eventFrom}::date IS NULL OR bl.event_date >= ${eventFrom}::date)
        AND (${eventTo}::date IS NULL OR bl.event_date <= ${eventTo}::date)
        AND (${dbTier}::text IS NULL OR bl.budget_tier = ${dbTier}::budget_tier)
      ORDER BY bl.display_id, c.created_at DESC
      LIMIT 10000
    `;
  }

  return sql<LogRow[]>`
    WITH scoped AS (
      SELECT
        bl.id,
        bl.display_id,
        bl.bride_name,
        bl.region,
        bl.event_date,
        bl.status,
        bl.hostile_note,
        bl.handover_reason,
        bl.uploader_confirmation,
        bl.assigned_rm_id,
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
                FROM comms c2
                JOIN staff st ON st.id = c2.actor_id
                WHERE c2.lead_id = bl.id
                  AND c2.entry_type = 'hostile_flagged'
                ORDER BY c2.created_at DESC
                LIMIT 1
              )
            ELSE NULL
          END
        ) AS effective_exit_role
      FROM bride_leads bl
      WHERE ${bucketFilter(bucket)}
        AND (${region}::text IS NULL OR bl.region = ${region}::region)
        AND (${eventFrom}::date IS NULL OR bl.event_date >= ${eventFrom}::date)
        AND (${eventTo}::date IS NULL OR bl.event_date <= ${eventTo}::date)
        AND (${dbTier}::text IS NULL OR bl.budget_tier = ${dbTier}::budget_tier)
    )
    SELECT
      s.display_id AS "leadDisplayId",
      s.bride_name AS "brideName",
      s.region::text AS region,
      s.event_date::text AS "eventDate",
      c.entry_type::text AS "entryType",
      c.description,
      st.name AS "actorName",
      c.created_at::text AS "createdAt"
    FROM comms c
    JOIN scoped s ON s.id = c.lead_id
    LEFT JOIN staff st ON st.id = c.actor_id
    WHERE (${sourceDb}::text IS NULL OR s.effective_exit_role = ${sourceDb})
    ORDER BY s.display_id, c.created_at DESC
    LIMIT 10000
  `;
}

export function assignLeadLogToCsv(rows: LogRow[]): string {
  const headers = [
    "Lead ID",
    "Bride",
    "Region",
    "Event date",
    "When",
    "Type",
    "Actor",
    "Description",
  ];
  const data = rows.map((r) => [
    r.leadDisplayId,
    r.brideName,
    r.region,
    csvDateCell(r.eventDate),
    csvDateCell(r.createdAt),
    commEntryLabel(r.entryType),
    r.actorName ?? "",
    r.description,
  ]);
  return rowsToCsv(headers, data);
}
