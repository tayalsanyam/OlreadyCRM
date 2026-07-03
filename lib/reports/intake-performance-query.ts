import { sql } from "@/db/index";
import { INTAKE_MIN_PROFILES } from "@/lib/lead-intake-config";

export type IntakePerformanceRow = {
  staffId: string;
  staffName: string;
  role: string;
  region: string | null;
  pendingConfirmation: number;
  awaitingProfiles: number;
  intakeGateComplete: number;
  overdueIntakeTasks: number;
  pendingIntakeTasks: number;
};

export type IntakeLeadRow = {
  leadId: string;
  displayId: string;
  brideName: string;
  region: string | null;
  status: string;
  confirmationStatus: string;
  intakeProfilesCount: number;
  intakeGateComplete: boolean;
  confirmationAttempts: number;
  pendingTaskType: string | null;
  pendingTaskTitle: string | null;
  pendingTaskDue: string | null;
  assignedRmName: string | null;
  daysSinceAssignment: number | null;
  daysToConfirm: number | null;
};

const INTAKE_TASK_TYPES = [
  "bride_confirmation",
  "share_profiles",
  "lead_progress_follow_up",
] as const;

const INTAKE_TASK_TYPES_SQL = sql.unsafe(
  INTAKE_TASK_TYPES.map((t) => `'${t}'`).join(", ")
);

export type IntakeOverdueTaskRow = {
  taskId: string;
  taskType: string;
  title: string;
  dueDate: string;
  staffId: string;
  staffName: string;
  leadId: string | null;
  displayId: string | null;
  brideName: string | null;
  leadStatus: string | null;
};

export async function fetchIntakePerformanceSummary(params: {
  region?: string | null;
  staffId?: string | null;
  roleFilter?: "regional_rm" | "commission_rm" | null;
}): Promise<IntakePerformanceRow[]> {
  const region = params.region ?? null;
  const staffId = params.staffId ?? null;
  const roleFilter = params.roleFilter ?? null;

  return sql<IntakePerformanceRow[]>`
    WITH lead_intake AS (
      SELECT
        bl.id AS lead_id,
        bl.assigned_rm_id AS staff_id,
        bl.confirmation_status::text AS confirmation_status,
        (
          SELECT COUNT(DISTINCT mp.mua_id)::int
          FROM mua_pushes mp
          WHERE mp.lead_id = bl.id
            AND mp.status NOT IN ('closed', 'booked')
            AND (
              bl.owner_assigned_at IS NULL
              OR mp.created_at >= bl.owner_assigned_at
            )
        ) AS profile_count
      FROM bride_leads bl
      WHERE bl.status IN ('assigned', 'commission_rm')
        AND bl.assigned_rm_id IS NOT NULL
    ),
    task_counts AS (
      SELECT
        t.staff_id,
        COUNT(*) FILTER (
          WHERE t.status = 'pending'
            AND t.due_date < CURRENT_DATE
        )::int AS overdue,
        COUNT(*) FILTER (WHERE t.status = 'pending')::int AS pending
      FROM rm_tasks t
      WHERE t.task_type IN (${INTAKE_TASK_TYPES_SQL})
      GROUP BY t.staff_id
    )
    SELECT
      s.id AS "staffId",
      s.name AS "staffName",
      s.role::text AS role,
      s.region::text AS region,
      COUNT(li.lead_id) FILTER (
        WHERE li.confirmation_status = 'pending'
      )::int AS "pendingConfirmation",
      COUNT(li.lead_id) FILTER (
        WHERE li.confirmation_status = 'confirmed'
          AND COALESCE(li.profile_count, 0) < ${INTAKE_MIN_PROFILES}
      )::int AS "awaitingProfiles",
      COUNT(li.lead_id) FILTER (
        WHERE li.confirmation_status = 'confirmed'
          AND COALESCE(li.profile_count, 0) >= ${INTAKE_MIN_PROFILES}
      )::int AS "intakeGateComplete",
      COALESCE(tc.overdue, 0)::int AS "overdueIntakeTasks",
      COALESCE(tc.pending, 0)::int AS "pendingIntakeTasks"
    FROM staff s
    LEFT JOIN lead_intake li ON li.staff_id = s.id
    LEFT JOIN task_counts tc ON tc.staff_id = s.id
    WHERE s.active = true
      AND s.role IN ('regional_rm'::user_role, 'commission_rm'::user_role)
      AND (${region}::text IS NULL OR s.region = ${region}::region)
      AND (${staffId}::uuid IS NULL OR s.id = ${staffId}::uuid)
      AND (${roleFilter}::text IS NULL OR s.role = ${roleFilter}::user_role)
    GROUP BY s.id, s.name, s.role, s.region, tc.overdue, tc.pending
    HAVING
      COUNT(li.lead_id) > 0
      OR COALESCE(tc.pending, 0) > 0
      OR COALESCE(tc.overdue, 0) > 0
    ORDER BY "overdueIntakeTasks" DESC, "pendingIntakeTasks" DESC, s.name
  `;
}

export async function fetchIntakeLeadRows(params: {
  region?: string | null;
  staffId?: string | null;
  roleFilter?: "regional_rm" | "commission_rm" | null;
  confirmationStatus?: string | null;
  gate?: "open" | "complete" | null;
}): Promise<IntakeLeadRow[]> {
  const region = params.region ?? null;
  const staffId = params.staffId ?? null;
  const roleFilter = params.roleFilter ?? null;
  const confirmationStatus = params.confirmationStatus ?? null;
  const gate = params.gate ?? null;

  return sql<IntakeLeadRow[]>`
    WITH profile_counts AS (
      SELECT
        bl.id AS lead_id,
        (
          SELECT COUNT(DISTINCT mp.mua_id)::int
          FROM mua_pushes mp
          WHERE mp.lead_id = bl.id
            AND mp.status NOT IN ('closed', 'booked')
            AND (
              bl.owner_assigned_at IS NULL
              OR mp.created_at >= bl.owner_assigned_at
            )
        ) AS profile_count
      FROM bride_leads bl
    ),
    pending_task AS (
      SELECT DISTINCT ON (t.lead_id)
        t.lead_id,
        t.task_type,
        t.title,
        t.due_date::text AS due_date
      FROM rm_tasks t
      WHERE t.status = 'pending'
        AND t.task_type IN (${INTAKE_TASK_TYPES_SQL})
      ORDER BY t.lead_id, t.due_date ASC NULLS LAST, t.created_at ASC
    )
    SELECT
      bl.id AS "leadId",
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      bl.region::text AS region,
      bl.status::text AS status,
      bl.confirmation_status::text AS "confirmationStatus",
      COALESCE(pc.profile_count, 0)::int AS "intakeProfilesCount",
      (
        bl.confirmation_status = 'confirmed'
        AND COALESCE(pc.profile_count, 0) >= ${INTAKE_MIN_PROFILES}
      ) AS "intakeGateComplete",
      bl.confirmation_attempts::int AS "confirmationAttempts",
      pt.task_type AS "pendingTaskType",
      pt.title AS "pendingTaskTitle",
      pt.due_date AS "pendingTaskDue",
      s.name AS "assignedRmName",
      CASE
        WHEN bl.assignment_date IS NOT NULL
        THEN (CURRENT_DATE - bl.assignment_date)::int
        ELSE NULL
      END AS "daysSinceAssignment",
      CASE
        WHEN bl.requirements_confirmed_at IS NOT NULL AND bl.assignment_date IS NOT NULL
        THEN (bl.requirements_confirmed_at::date - bl.assignment_date)::int
        ELSE NULL
      END AS "daysToConfirm"
    FROM bride_leads bl
    JOIN profile_counts pc ON pc.lead_id = bl.id
    LEFT JOIN pending_task pt ON pt.lead_id = bl.id
    LEFT JOIN staff s ON s.id = bl.assigned_rm_id
    WHERE bl.status IN ('assigned', 'commission_rm')
      AND (${region}::text IS NULL OR bl.region = ${region}::region)
      AND (${staffId}::uuid IS NULL OR bl.assigned_rm_id = ${staffId}::uuid)
      AND (
        ${roleFilter}::text IS NULL
        OR EXISTS (
          SELECT 1 FROM staff sf
          WHERE sf.id = bl.assigned_rm_id
            AND sf.role = ${roleFilter}::user_role
        )
      )
      AND (
        ${confirmationStatus}::text IS NULL
        OR bl.confirmation_status::text = ${confirmationStatus}
      )
      AND (
        ${gate}::text IS NULL
        OR (
          ${gate} = 'complete'
          AND bl.confirmation_status = 'confirmed'
          AND COALESCE(pc.profile_count, 0) >= ${INTAKE_MIN_PROFILES}
        )
        OR (
          ${gate} = 'open'
          AND (
            bl.confirmation_status = 'pending'
            OR COALESCE(pc.profile_count, 0) < ${INTAKE_MIN_PROFILES}
          )
        )
      )
    ORDER BY
      pt.due_date ASC NULLS LAST,
      bl.event_date ASC NULLS LAST
  `;
}

export async function fetchIntakeOverdueTasks(params: {
  region?: string | null;
  staffId?: string | null;
  roleFilter?: "regional_rm" | "commission_rm" | null;
}): Promise<IntakeOverdueTaskRow[]> {
  const region = params.region ?? null;
  const staffId = params.staffId ?? null;
  const roleFilter = params.roleFilter ?? null;

  return sql<IntakeOverdueTaskRow[]>`
    SELECT
      t.id AS "taskId",
      t.task_type::text AS "taskType",
      t.title,
      t.due_date::text AS "dueDate",
      s.id AS "staffId",
      s.name AS "staffName",
      bl.id AS "leadId",
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      bl.status::text AS "leadStatus"
    FROM rm_tasks t
    JOIN staff s ON s.id = t.staff_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    WHERE t.status = 'pending'
      AND t.task_type IN (${INTAKE_TASK_TYPES_SQL})
      AND t.due_date < CURRENT_DATE
      AND s.active = true
      AND s.role IN ('regional_rm'::user_role, 'commission_rm'::user_role)
      AND (${region}::text IS NULL OR s.region = ${region}::region)
      AND (${staffId}::uuid IS NULL OR t.staff_id = ${staffId}::uuid)
      AND (${roleFilter}::text IS NULL OR s.role = ${roleFilter}::user_role)
    ORDER BY t.due_date ASC, s.name, t.title
  `;
}
