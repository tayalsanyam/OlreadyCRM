import { sql } from "@/db/index";
import { fromDbPushStage, fromDbTaskType } from "@/lib/db-mappers";
import type { MuaPushStage, TaskType } from "@/lib/types";

export type BackendTeamTaskRow = {
  id: string;
  displayId: string;
  title: string;
  taskType: TaskType;
  status: string;
  dueDate: string | null;
  createdAt: string;
  staffId: string;
  staffName: string;
  staffRole: string;
  staffRegion: string | null;
  leadId: string | null;
  leadName: string | null;
  leadDisplayId: string | null;
  leadRegion: string | null;
  leadStatus: string | null;
  confirmationStatus: string | null;
  muaName: string | null;
  pushStage: MuaPushStage | null;
  overdue: boolean;
  dueToday: boolean;
};

export type BackendTeamTaskFilters = {
  staffId?: string | null;
  role?: "regional_rm" | "commission_rm" | null;
  region?: string | null;
  taskType?: string | null;
  due?: "all" | "overdue" | "today" | "upcoming" | null;
  status?: "pending" | "done" | null;
  search?: string | null;
};

export async function fetchBackendTeamTasks(
  filters: BackendTeamTaskFilters
): Promise<BackendTeamTaskRow[]> {
  const staffId = filters.staffId ?? null;
  const role = filters.role ?? null;
  const region = filters.region ?? null;
  const taskType = filters.taskType ?? null;
  const due = filters.due ?? "all";
  const status = filters.status ?? "pending";
  const search = filters.search?.trim() ? `%${filters.search.trim()}%` : null;

  const rows = await sql<
    {
      id: string;
      displayId: string;
      title: string;
      taskType: string;
      status: string;
      dueDate: string | null;
      createdAt: string;
      staffId: string;
      staffName: string;
      staffRole: string;
      staffRegion: string | null;
      leadId: string | null;
      leadName: string | null;
      leadDisplayId: string | null;
      leadRegion: string | null;
      leadStatus: string | null;
      confirmationStatus: string | null;
      muaName: string | null;
      pushStage: string | null;
    }[]
  >`
    SELECT
      t.id,
      t.display_id AS "displayId",
      t.title,
      t.task_type::text AS "taskType",
      t.status::text AS status,
      t.due_date::text AS "dueDate",
      t.created_at::text AS "createdAt",
      s.id AS "staffId",
      s.name AS "staffName",
      s.role::text AS "staffRole",
      s.region::text AS "staffRegion",
      t.lead_id AS "leadId",
      bl.bride_name AS "leadName",
      bl.display_id AS "leadDisplayId",
      bl.region::text AS "leadRegion",
      bl.status::text AS "leadStatus",
      bl.confirmation_status::text AS "confirmationStatus",
      m.name AS "muaName",
      mp.stage::text AS "pushStage"
    FROM rm_tasks t
    JOIN staff s ON s.id = t.staff_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    LEFT JOIN mua_pushes mp ON mp.id = t.push_id
    LEFT JOIN muas m ON m.id = mp.mua_id
    WHERE s.role IN ('regional_rm'::user_role, 'commission_rm'::user_role)
      AND s.active = true
      AND t.status::text = ${status}
      AND (${staffId}::uuid IS NULL OR t.staff_id = ${staffId}::uuid)
      AND (${role}::text IS NULL OR s.role = ${role}::user_role)
      AND (
        ${region}::text IS NULL
        OR s.region = ${region}::region
        OR bl.region = ${region}::region
      )
      AND (${taskType}::text IS NULL OR t.task_type::text = ${taskType})
      AND (
        ${search}::text IS NULL
        OR t.title ILIKE ${search}
        OR bl.bride_name ILIKE ${search}
        OR bl.display_id ILIKE ${search}
        OR s.name ILIKE ${search}
        OR m.name ILIKE ${search}
      )
      AND (
        ${due} = 'all'
        OR (${due} = 'overdue' AND t.due_date < CURRENT_DATE)
        OR (${due} = 'today' AND t.due_date = CURRENT_DATE)
        OR (${due} = 'upcoming' AND t.due_date > CURRENT_DATE)
      )
    ORDER BY
      CASE WHEN t.due_date < CURRENT_DATE THEN 0 ELSE 1 END,
      t.due_date ASC NULLS LAST,
      t.created_at DESC
  `;

  const today = new Date().toISOString().slice(0, 10);

  return rows.map((r) => ({
    ...r,
    taskType: fromDbTaskType(r.taskType),
    pushStage: r.pushStage ? fromDbPushStage(r.pushStage) : null,
    overdue: r.dueDate != null && r.dueDate < today,
    dueToday: r.dueDate === today,
  }));
}

export async function fetchBackendTeamTaskStats(): Promise<{
  pending: number;
  overdue: number;
  dueToday: number;
  byRole: Array<{ role: string; pending: number; overdue: number }>;
}> {
  const [totals] = await sql<
    { pending: number; overdue: number; dueToday: number }[]
  >`
    SELECT
      COUNT(*)::int AS pending,
      COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE)::int AS overdue,
      COUNT(*) FILTER (WHERE t.due_date = CURRENT_DATE)::int AS "dueToday"
    FROM rm_tasks t
    JOIN staff s ON s.id = t.staff_id
    WHERE t.status = 'pending'
      AND s.role IN ('regional_rm'::user_role, 'commission_rm'::user_role)
      AND s.active = true
  `;

  const byRole = await sql<
    { role: string; pending: number; overdue: number }[]
  >`
    SELECT
      s.role::text AS role,
      COUNT(*)::int AS pending,
      COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE)::int AS overdue
    FROM rm_tasks t
    JOIN staff s ON s.id = t.staff_id
    WHERE t.status = 'pending'
      AND s.role IN ('regional_rm'::user_role, 'commission_rm'::user_role)
      AND s.active = true
    GROUP BY s.role
  `;

  return {
    pending: totals?.pending ?? 0,
    overdue: totals?.overdue ?? 0,
    dueToday: totals?.dueToday ?? 0,
    byRole,
  };
}
