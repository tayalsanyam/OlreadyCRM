import { sql } from "@/db/index";
import type { PipelineHealthLead } from "@/lib/types";

function healthSelect() {
  return sql`
    SELECT
      bl.*,
      rm.compute_urgency_band(bl.event_date) AS urgency_band,
      (bl.event_date - CURRENT_DATE)::int AS days_to_event,
      CASE
        WHEN bl.assignment_date IS NULL THEN NULL
        ELSE GREATEST(
          0,
          (SELECT assignment_window_days FROM sla_config WHERE id = 1)
            - (CURRENT_DATE - bl.assignment_date)
        )
      END AS assignment_days_remaining,
      CASE
        WHEN bl.assignment_date IS NULL THEN NULL
        ELSE (CURRENT_DATE - bl.assignment_date)
      END AS days_since_assignment,
      s.name AS assigned_rm_name,
      (
        SELECT COUNT(*)::int
        FROM mua_pushes mp
        WHERE mp.lead_id = bl.id AND mp.status NOT IN ('closed', 'booked')
      ) AS active_pushes_count,
      COALESCE(pc.muas_offered_count, 0) AS muas_offered_count,
      NULL::text AS muas_offered_names,
      0::int AS event_count,
      0::int AS booked_event_count,
      0::int AS open_event_count,
      NULL::text AS event_labels,
      (SELECT MAX(c.created_at) FROM comms c WHERE c.lead_id = bl.id) AS last_activity_at,
      CASE
        WHEN COALESCE(pc.muas_offered_count, 0) = 0 THEN 'none'
        WHEN COALESCE(pc.muas_offered_count, 0) BETWEEN 1 AND 5 THEN '1-5'
        WHEN COALESCE(pc.muas_offered_count, 0) BETWEEN 6 AND 10 THEN '6-10'
        WHEN COALESCE(pc.muas_offered_count, 0) BETWEEN 11 AND 15 THEN '11-15'
        ELSE '16+'
      END AS bucket
    FROM bride_leads bl
    LEFT JOIN staff s ON s.id = bl.assigned_rm_id
    LEFT JOIN (
      SELECT lead_id, COUNT(DISTINCT mua_id)::int AS muas_offered_count
      FROM mua_pushes
      GROUP BY lead_id
    ) pc ON pc.lead_id = bl.id
  `;
}

export type PipelineHealthFilters = {
  dbStatus: string;
  region: string | null;
  assignedRmId: string | null;
  tierDbList: string[] | null;
  eventFrom: string | null;
  eventTo: string | null;
  limit?: number;
};

export type PipelineHealthExcludeFilters = {
  excludeStatuses: string[];
  region: string | null;
  assignedRmId: string | null;
  tierDbList: string[] | null;
  eventFrom: string | null;
  eventTo: string | null;
  limit?: number;
};

export async function fetchPipelineHealthByStatus(
  filters: PipelineHealthFilters
): Promise<PipelineHealthLead[]> {
  const {
    dbStatus,
    region,
    assignedRmId,
    tierDbList,
    eventFrom,
    eventTo,
    limit = 500,
  } = filters;

  return await sql<PipelineHealthLead[]>`
    ${healthSelect()}
    WHERE bl.status = ${dbStatus}::lead_status
      AND (${region}::text IS NULL OR bl.region = ${region}::region)
      AND (${assignedRmId}::uuid IS NULL OR bl.assigned_rm_id = ${assignedRmId}::uuid)
      AND (
        ${tierDbList}::text[] IS NULL
        OR bl.budget_tier::text = ANY(${tierDbList}::text[])
      )
      AND (${eventFrom}::date IS NULL OR bl.event_date >= ${eventFrom}::date)
      AND (${eventTo}::date IS NULL OR bl.event_date <= ${eventTo}::date)
    ORDER BY bl.event_date ASC NULLS LAST
    LIMIT ${limit}
  `;
}

export async function fetchPipelineHealthExcluding(
  filters: PipelineHealthExcludeFilters
): Promise<PipelineHealthLead[]> {
  const {
    excludeStatuses,
    region,
    assignedRmId,
    tierDbList,
    eventFrom,
    eventTo,
    limit = 1000,
  } = filters;

  return await sql<PipelineHealthLead[]>`
    ${healthSelect()}
    WHERE bl.status::text <> ALL(${excludeStatuses}::text[])
      AND (${region}::text IS NULL OR bl.region = ${region}::region)
      AND (${assignedRmId}::uuid IS NULL OR bl.assigned_rm_id = ${assignedRmId}::uuid)
      AND (
        ${tierDbList}::text[] IS NULL
        OR bl.budget_tier::text = ANY(${tierDbList}::text[])
      )
      AND (${eventFrom}::date IS NULL OR bl.event_date >= ${eventFrom}::date)
      AND (${eventTo}::date IS NULL OR bl.event_date <= ${eventTo}::date)
    ORDER BY bl.event_date ASC NULLS LAST
    LIMIT ${limit}
  `;
}
