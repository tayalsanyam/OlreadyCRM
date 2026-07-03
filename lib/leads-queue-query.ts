import { sql, type Sql } from "@/db/index";
import { QUEUE_EVENT_LABELS_COLUMN } from "@/lib/queue-event-labels-sql";
import type { LeadFull } from "@/lib/types";

export type QueueFilters = {
  dbStatus: string;
  region: string | null;
  assignedRmId: string | null;
  eventFrom: string | null;
  eventTo: string | null;
  portal: "on" | "off" | null;
  pageSize: number;
  offset: number;
  excludeNiByStaffId?: string | null;
  commissionStaffId?: string | null;
};

/** Fresh WHERE fragment per query — postgres.js fragments must not be reused across calls. */
function queueWhere(db: Sql, f: QueueFilters) {
  const commissionFilter = f.commissionStaffId
    ? db`AND (bl.assigned_rm_id = ${f.commissionStaffId}::uuid OR bl.assigned_rm_id IS NULL)`
    : db``;

  return db`
    WHERE bl.status = ${f.dbStatus}::lead_status
      AND bl.status NOT IN ('archived', 'missed', 'expired')
      AND (${f.region}::text IS NULL OR bl.region = ${f.region}::region)
      AND (${f.assignedRmId}::uuid IS NULL OR bl.assigned_rm_id = ${f.assignedRmId}::uuid)
      AND (${f.eventFrom}::date IS NULL OR bl.event_date >= ${f.eventFrom}::date)
      AND (${f.eventTo}::date IS NULL OR bl.event_date <= ${f.eventTo}::date)
      AND (
        ${f.portal}::text IS NULL
        OR (${f.portal} = 'on' AND bl.portal_pushed = true)
        OR (${f.portal} = 'off' AND bl.portal_pushed = false)
      )
      AND (
        ${f.excludeNiByStaffId ?? null}::uuid IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM mua_pushes mp
          WHERE mp.lead_id = bl.id
            AND mp.pushed_by = ${f.excludeNiByStaffId ?? null}::uuid
            AND mp.status = 'closed'
            AND mp.outcome = 'not_interested'
        )
      )
      ${commissionFilter}
  `;
}

export async function fetchQueuePage(
  db: Sql,
  filters: QueueFilters
): Promise<{ rows: LeadFull[]; total: number }> {
  const [countRow] = await db<{ total: number }[]>`
    SELECT COUNT(*)::int AS total
    FROM bride_leads bl
    ${queueWhere(db, filters)}
  `;

  const rows = await db<LeadFull[]>`
    SELECT
      bl.*,
      rm.compute_urgency_band(rm.lead_sla_event_date(bl.id)) AS urgency_band,
      (rm.lead_sla_event_date(bl.id) - CURRENT_DATE)::int AS days_to_event,
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
      (
        SELECT COUNT(DISTINCT mp.mua_id)::int
        FROM mua_pushes mp
        WHERE mp.lead_id = bl.id
      ) AS muas_offered_count,
      (
        SELECT string_agg(names.name, ', ' ORDER BY names.name)
        FROM (
          SELECT DISTINCT m.name
          FROM mua_pushes mp
          JOIN muas m ON m.id = mp.mua_id
          WHERE mp.lead_id = bl.id
        ) names
      ) AS muas_offered_names,
      (
        SELECT COUNT(*)::int
        FROM lead_events le
        WHERE le.lead_id = bl.id AND le.status != 'not_needed'
      ) AS event_count,
      (
        SELECT COUNT(*)::int
        FROM lead_events le
        WHERE le.lead_id = bl.id AND le.status = 'booked'
      ) AS booked_event_count,
      (
        SELECT COUNT(*)::int
        FROM lead_events le
        WHERE le.lead_id = bl.id AND le.status = 'open'
      ) AS open_event_count,
      ${sql.unsafe(QUEUE_EVENT_LABELS_COLUMN)},
      (SELECT MAX(c.created_at) FROM comms c WHERE c.lead_id = bl.id) AS last_activity_at,
      COALESCE(
        (
          SELECT array_agg(DISTINCT mp.stage::text)
          FROM mua_pushes mp
          WHERE mp.lead_id = bl.id AND mp.status = 'active'
        ),
        '{}'::text[]
      ) AS active_push_stages
    FROM bride_leads bl
    LEFT JOIN staff s ON s.id = bl.assigned_rm_id
    ${queueWhere(db, filters)}
    ORDER BY
      CASE rm.compute_urgency_band(rm.lead_sla_event_date(bl.id))::text
        WHEN 'critical' THEN 4
        WHEN 'hot' THEN 3
        WHEN 'active' THEN 2
        ELSE 1
      END DESC,
      CASE bl.budget_tier::text
        WHEN 'tier_1' THEN 4
        WHEN 'tier_2' THEN 3
        WHEN 'tier_3' THEN 2
        ELSE 1
      END DESC,
      bl.event_date ASC NULLS LAST,
      bl.id ASC
    LIMIT ${filters.pageSize}
    OFFSET ${filters.offset}
  `;

  return { rows, total: countRow?.total ?? 0 };
}
