import type { Sql } from "@/db/index";

export interface RmPerformanceRow {
  rmId: string;
  rmName: string;
  role: string;
  region: string;
  totalActive: number;
  totalBooked: number;
  totalShifted: number;
  conversionPct: number | null;
  avgPushesPerLead: number | null;
  staleLeads: number;
  pendingConfirmation: number;
  awaitingProfiles: number;
  overdueIntakeTasks: number;
}

import { INTAKE_MIN_PROFILES } from "@/lib/lead-intake-config";

export async function queryRmPerformance(
  db: Sql,
  staleHours = 48
): Promise<RmPerformanceRow[]> {
  return db<RmPerformanceRow[]>`
    SELECT
      s.id AS "rmId",
      s.name AS "rmName",
      s.role::text AS role,
      COALESCE(s.region::text, '—') AS region,
      COUNT(DISTINCT bl.id) FILTER (WHERE bl.status IN ('assigned','booked','commission_rm'))
        ::int AS "totalActive",
      COUNT(DISTINCT bl.id) FILTER (WHERE bl.status = 'booked')
        ::int AS "totalBooked",
      COUNT(DISTINCT bl.id) FILTER (WHERE bl.status = 'commission_rm')
        ::int AS "totalShifted",
      ROUND(
        100.0 * COUNT(DISTINCT bl.id) FILTER (WHERE bl.status = 'booked') /
        NULLIF(COUNT(DISTINCT bl.id) FILTER (WHERE bl.status IN ('assigned','booked','commission_rm')), 0),
        1
      )::float AS "conversionPct",
      ROUND(
        COUNT(mp.id)::numeric /
        NULLIF(COUNT(DISTINCT bl.id) FILTER (WHERE bl.status IN ('assigned','booked')), 0),
        1
      )::float AS "avgPushesPerLead",
      COUNT(DISTINCT bl.id) FILTER (
        WHERE bl.status = 'assigned'
        AND NOT EXISTS (
          SELECT 1 FROM comms c WHERE c.lead_id = bl.id
          AND c.created_at > NOW() - (${staleHours} || ' hours')::interval
        )
      )::int AS "staleLeads",
      COUNT(DISTINCT bl.id) FILTER (
        WHERE bl.status IN ('assigned', 'commission_rm')
          AND bl.confirmation_status = 'pending'
      )::int AS "pendingConfirmation",
      COUNT(DISTINCT bl.id) FILTER (
        WHERE bl.status IN ('assigned', 'commission_rm')
          AND bl.confirmation_status = 'confirmed'
          AND (
            SELECT COUNT(DISTINCT mp2.mua_id)::int
            FROM mua_pushes mp2
            WHERE mp2.lead_id = bl.id
              AND mp2.status NOT IN ('closed', 'booked')
              AND (
                bl.owner_assigned_at IS NULL
                OR mp2.created_at >= bl.owner_assigned_at
              )
          ) < ${INTAKE_MIN_PROFILES}
      )::int AS "awaitingProfiles",
      (
        SELECT COUNT(*)::int
        FROM rm_tasks t
        WHERE t.staff_id = s.id
          AND t.status = 'pending'
          AND t.task_type IN ('bride_confirmation', 'share_profiles', 'lead_progress_follow_up')
          AND t.due_date < CURRENT_DATE
      ) AS "overdueIntakeTasks"
    FROM staff s
    LEFT JOIN bride_leads bl ON bl.assigned_rm_id = s.id
    LEFT JOIN mua_pushes mp ON mp.lead_id = bl.id
    WHERE s.role IN ('regional_rm'::user_role, 'commission_rm'::user_role)
      AND s.active = true
    GROUP BY s.id, s.name, s.role, s.region
    ORDER BY "conversionPct" DESC NULLS LAST
  `;
}
