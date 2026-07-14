import { sql } from "@/db/index";
import { fromDbTaskType } from "@/lib/db-mappers";
import { loadDiscountRequestsByStageLogIds } from "@/lib/sales-deal-discount";
import {
  formatDiscountTaskDisplayTitle,
  formatDiscountTaskMeta,
  parseDiscountTaskTitle,
  type AdminDiscountTaskDetails,
} from "@/lib/sales-deal-discount-shared";
import { TASK_TYPE_LABELS } from "@/lib/types";

export type AdminTaskOverviewItem = {
  id: string;
  kind: "crm" | "team" | "care" | "support";
  displayId: string;
  title: string;
  status: string;
  dueAt: string | null;
  assigneeId: string;
  assigneeName: string;
  assignedByName?: string | null;
  taskType?: string | null;
  leadId?: string | null;
  muaId?: string | null;
  meta?: string | null;
  link?: string | null;
  discountDetails?: AdminDiscountTaskDetails;
};

export type AdminTaskOverviewStaff = {
  id: string;
  name: string;
  role: string;
  pending: number;
  dueToday: number;
  overdue: number;
  tasks: AdminTaskOverviewItem[];
};

export async function fetchAdminTasksOverview(opts: {
  staffId?: string | null;
  includeDoneToday?: boolean;
}): Promise<AdminTaskOverviewStaff[]> {
  const staffFilter = opts.staffId ?? null;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const staff = await sql<{ id: string; name: string; role: string }[]>`
    SELECT id, name, role::text AS role
    FROM staff
    WHERE active = true
      AND (${staffFilter}::uuid IS NULL OR id = ${staffFilter}::uuid)
    ORDER BY name
  `;

  const crmRows = await sql<
    {
      id: string;
      displayId: string;
      title: string;
      taskType: string;
      status: string;
      dueDate: string | null;
      staffId: string;
      leadId: string | null;
      leadName: string | null;
    }[]
  >`
    SELECT
      t.id,
      t.display_id AS "displayId",
      t.title,
      t.task_type::text AS "taskType",
      t.status::text AS status,
      t.due_date::text AS "dueDate",
      t.staff_id AS "staffId",
      t.lead_id AS "leadId",
      bl.bride_name AS "leadName"
    FROM rm_tasks t
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    WHERE t.status = 'pending'
      AND (${staffFilter}::uuid IS NULL OR t.staff_id = ${staffFilter}::uuid)
  `;

  const teamRows = await sql<
    {
      id: string;
      displayId: string;
      title: string;
      status: string;
      dueAt: string | null;
      assignedTo: string;
      assignedByName: string;
      muaId: string | null;
      muaName: string | null;
      leadId: string | null;
      brideName: string | null;
    }[]
  >`
    SELECT
      t.id,
      t.display_id AS "displayId",
      t.title,
      t.status::text AS status,
      t.due_at AS "dueAt",
      t.assigned_to AS "assignedTo",
      ab.name AS "assignedByName",
      t.mua_id AS "muaId",
      m.name AS "muaName",
      t.lead_id AS "leadId",
      bl.bride_name AS "brideName"
    FROM rm.ops_tasks t
    JOIN staff ab ON ab.id = t.assigned_by
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    WHERE t.status = 'pending'
      AND (${staffFilter}::uuid IS NULL OR t.assigned_to = ${staffFilter}::uuid)
  `;

  const teamAssignedByRows = await sql<
    {
      id: string;
      displayId: string;
      title: string;
      status: string;
      dueAt: string | null;
      assignedBy: string;
      assigneeName: string;
      muaId: string | null;
      muaName: string | null;
      leadId: string | null;
      brideName: string | null;
    }[]
  >`
    SELECT
      t.id,
      t.display_id AS "displayId",
      t.title,
      t.status::text AS status,
      t.due_at AS "dueAt",
      t.assigned_by AS "assignedBy",
      s.name AS "assigneeName",
      t.mua_id AS "muaId",
      m.name AS "muaName",
      t.lead_id AS "leadId",
      bl.bride_name AS "brideName"
    FROM rm.ops_tasks t
    JOIN staff s ON s.id = t.assigned_to
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    WHERE t.status = 'pending'
      AND (${staffFilter}::uuid IS NULL OR t.assigned_by = ${staffFilter}::uuid OR t.created_by = ${staffFilter}::uuid)
  `;

  const careRows = await sql<
    {
      id: string;
      displayId: string;
      title: string;
      taskType: string;
      status: string;
      dueAt: string | null;
      assignedTo: string;
      ticketId: string;
      ticketNumber: string;
      muaId: string | null;
      muaName: string | null;
      leadId: string | null;
      brideName: string | null;
    }[]
  >`
    SELECT
      tt.id,
      tt.display_id AS "displayId",
      tt.title,
      tt.task_type::text AS "taskType",
      tt.status::text AS status,
      tt.due_at AS "dueAt",
      tt.assigned_to AS "assignedTo",
      t.id AS "ticketId",
      t.ticket_number AS "ticketNumber",
      t.mua_id AS "muaId",
      m.name AS "muaName",
      t.lead_id AS "leadId",
      bl.bride_name AS "brideName"
    FROM support.ticket_tasks tt
    JOIN support.tickets t ON t.id = tt.ticket_id
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    WHERE tt.status IN ('pending', 'in_progress')
      AND (${staffFilter}::uuid IS NULL OR tt.assigned_to = ${staffFilter}::uuid)
  `;

  const supportRows = await sql<
    {
      id: string;
      displayId: string;
      title: string;
      status: string;
      assignedTo: string | null;
      createdAt: string;
    }[]
  >`
    SELECT
      si.id,
      si.display_id AS "displayId",
      COALESCE(NULLIF(TRIM(si.message), ''), si.name, 'Support inquiry') AS title,
      si.status::text AS status,
      si.assigned_to AS "assignedTo",
      si.created_at AS "createdAt"
    FROM support.support_inquiries si
    WHERE si.status IN ('pending', 'in_progress')
      AND si.assigned_to IS NOT NULL
      AND (${staffFilter}::uuid IS NULL OR si.assigned_to = ${staffFilter}::uuid)
  `;

  const byStaff = new Map<string, AdminTaskOverviewItem[]>();

  const discountStageLogIds = crmRows
    .map((row) => parseDiscountTaskTitle(row.title)?.stageLogId)
    .filter((id): id is string => Boolean(id));
  const discountDetailsByLogId = await loadDiscountRequestsByStageLogIds(sql, discountStageLogIds);

  for (const row of crmRows) {
    const type = fromDbTaskType(row.taskType);
    const label = TASK_TYPE_LABELS[type] ?? row.taskType;
    const discountRef = parseDiscountTaskTitle(row.title);
    const discountDetails = discountRef ? discountDetailsByLogId.get(discountRef.stageLogId) : undefined;
    const list = byStaff.get(row.staffId) ?? [];
    list.push({
      id: row.id,
      kind: "crm",
      displayId: row.displayId,
      title: discountDetails
        ? `Approve deal discount — ${discountDetails.muaName}`
        : formatDiscountTaskDisplayTitle(row.title || label),
      status: row.status,
      dueAt: row.dueDate,
      assigneeId: row.staffId,
      assigneeName: "",
      taskType: row.taskType,
      leadId: row.leadId,
      meta: discountDetails
        ? formatDiscountTaskMeta(discountDetails)
        : row.leadName
          ? `Lead: ${row.leadName}`
          : label,
      link: `/admin/tasks?tab=team&open=crm:${row.id}`,
      discountDetails,
    });
    byStaff.set(row.staffId, list);
  }

  for (const row of teamRows) {
    const list = byStaff.get(row.assignedTo) ?? [];
    list.push({
      id: row.id,
      kind: "team",
      displayId: row.displayId,
      title: row.title,
      status: row.status,
      dueAt: row.dueAt,
      assigneeId: row.assignedTo,
      assigneeName: "",
      assignedByName: row.assignedByName,
      muaId: row.muaId,
      leadId: row.leadId,
      meta: row.muaName ?? row.brideName ?? null,
      link: `/tasks/ops/${row.id}?from=admin`,
    });
    byStaff.set(row.assignedTo, list);
  }

  for (const row of teamAssignedByRows) {
    const list = byStaff.get(row.assignedBy) ?? [];
    if (list.some((t) => t.kind === "team" && t.id === row.id)) continue;
    const ref = row.muaName ?? row.brideName;
    list.push({
      id: row.id,
      kind: "team",
      displayId: row.displayId,
      title: row.title,
      status: row.status,
      dueAt: row.dueAt,
      assigneeId: row.assignedBy,
      assigneeName: "",
      assignedByName: row.assigneeName,
      muaId: row.muaId,
      leadId: row.leadId,
      meta: ref ? `To ${row.assigneeName} · ${ref}` : `To ${row.assigneeName}`,
      link: `/tasks/ops/${row.id}?view=assigned&from=admin`,
    });
    byStaff.set(row.assignedBy, list);
  }

  for (const row of careRows) {
    const list = byStaff.get(row.assignedTo) ?? [];
    list.push({
      id: row.id,
      kind: "care",
      displayId: row.displayId,
      title: row.title,
      status: row.status,
      dueAt: row.dueAt,
      assigneeId: row.assignedTo,
      assigneeName: "",
      taskType: row.taskType,
      muaId: row.muaId,
      leadId: row.leadId,
      meta: [row.ticketNumber, row.muaName, row.brideName].filter(Boolean).join(" · ") || row.ticketNumber,
      link: `/tasks/care/${row.id}`,
    });
    byStaff.set(row.assignedTo, list);
  }

  for (const row of supportRows) {
    if (!row.assignedTo) continue;
    const list = byStaff.get(row.assignedTo) ?? [];
    list.push({
      id: row.id,
      kind: "support",
      displayId: row.displayId,
      title: row.title,
      status: row.status,
      dueAt: row.createdAt,
      assigneeId: row.assignedTo,
      assigneeName: "",
      meta: "Support inquiry",
      link: `/tasks/support/${row.id}`,
    });
    byStaff.set(row.assignedTo, list);
  }

  const startMs = todayStart.getTime();
  const endMs = todayEnd.getTime();

  return staff.map((s) => {
    const tasks = (byStaff.get(s.id) ?? []).map((t) => ({
      ...t,
      assigneeName: s.name,
    }));
    let dueToday = 0;
    let overdue = 0;
    for (const t of tasks) {
      if (!t.dueAt) continue;
      const due = new Date(t.dueAt);
      due.setHours(0, 0, 0, 0);
      const dueMs = due.getTime();
      if (dueMs < startMs) overdue++;
      else if (dueMs >= startMs && dueMs < endMs) dueToday++;
    }
    return {
      id: s.id,
      name: s.name,
      role: s.role,
      pending: tasks.length,
      dueToday,
      overdue,
      tasks: tasks.sort((a, b) => {
        const ad = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
        const bd = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
        return ad - bd;
      }),
    };
  }).filter((s) => s.pending > 0 || !staffFilter);
}

export async function fetchAdminMineCompletedTasks(
  staffId: string,
): Promise<AdminTaskOverviewItem[]> {
  const crmRows = await sql<
    {
      id: string;
      displayId: string;
      title: string;
      taskType: string;
      status: string;
      dueDate: string | null;
      completedAt: string | null;
      leadId: string | null;
      leadName: string | null;
    }[]
  >`
    SELECT
      t.id,
      t.display_id AS "displayId",
      t.title,
      t.task_type::text AS "taskType",
      t.status::text AS status,
      t.due_date::text AS "dueDate",
      t.updated_at::text AS "completedAt",
      t.lead_id AS "leadId",
      bl.bride_name AS "leadName"
    FROM rm_tasks t
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    WHERE t.status = 'done'
      AND t.staff_id = ${staffId}::uuid
    ORDER BY t.updated_at DESC
  `;

  const teamRows = await sql<
    {
      id: string;
      displayId: string;
      title: string;
      status: string;
      dueAt: string | null;
      completedAt: string | null;
      assignedByName: string;
      muaId: string | null;
      muaName: string | null;
      leadId: string | null;
      brideName: string | null;
    }[]
  >`
    SELECT
      t.id,
      t.display_id AS "displayId",
      t.title,
      t.status::text AS status,
      t.due_at AS "dueAt",
      t.completed_at::text AS "completedAt",
      ab.name AS "assignedByName",
      t.mua_id AS "muaId",
      m.name AS "muaName",
      t.lead_id AS "leadId",
      bl.bride_name AS "brideName"
    FROM rm.ops_tasks t
    JOIN staff ab ON ab.id = t.assigned_by
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    WHERE t.status = 'done'
      AND t.assigned_to = ${staffId}::uuid
    ORDER BY t.completed_at DESC NULLS LAST, t.updated_at DESC
  `;

  const careRows = await sql<
    {
      id: string;
      displayId: string;
      title: string;
      taskType: string;
      status: string;
      dueAt: string | null;
      completedAt: string | null;
      ticketNumber: string;
      muaId: string | null;
      muaName: string | null;
      leadId: string | null;
      brideName: string | null;
    }[]
  >`
    SELECT
      tt.id,
      tt.display_id AS "displayId",
      tt.title,
      tt.task_type::text AS "taskType",
      tt.status::text AS status,
      tt.due_at AS "dueAt",
      tt.completed_at::text AS "completedAt",
      t.ticket_number AS "ticketNumber",
      t.mua_id AS "muaId",
      m.name AS "muaName",
      t.lead_id AS "leadId",
      bl.bride_name AS "brideName"
    FROM support.ticket_tasks tt
    JOIN support.tickets t ON t.id = tt.ticket_id
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    WHERE tt.status = 'done'
      AND tt.assigned_to = ${staffId}::uuid
    ORDER BY tt.completed_at DESC NULLS LAST, tt.updated_at DESC
  `;

  const supportRows = await sql<
    {
      id: string;
      displayId: string;
      title: string;
      status: string;
      completedAt: string | null;
      createdAt: string;
    }[]
  >`
    SELECT
      si.id,
      si.display_id AS "displayId",
      COALESCE(NULLIF(TRIM(si.message), ''), si.name, 'Support inquiry') AS title,
      si.status::text AS status,
      si.completed_at::text AS "completedAt",
      si.created_at AS "createdAt"
    FROM support.support_inquiries si
    WHERE si.status = 'done'
      AND si.assigned_to = ${staffId}::uuid
    ORDER BY si.completed_at DESC NULLS LAST, si.updated_at DESC
  `;

  const tasks: AdminTaskOverviewItem[] = [];

  for (const row of crmRows) {
    const type = fromDbTaskType(row.taskType);
    const label = TASK_TYPE_LABELS[type] ?? row.taskType;
    tasks.push({
      id: row.id,
      kind: "crm",
      displayId: row.displayId,
      title: row.title || label,
      status: row.status,
      dueAt: row.completedAt ?? row.dueDate,
      assigneeId: staffId,
      assigneeName: "",
      taskType: row.taskType,
      leadId: row.leadId,
      meta: row.leadName ? `Lead: ${row.leadName}` : label,
      link: `/admin/tasks?tab=team&open=crm:${row.id}`,
    });
  }

  for (const row of teamRows) {
    tasks.push({
      id: row.id,
      kind: "team",
      displayId: row.displayId,
      title: row.title,
      status: row.status,
      dueAt: row.completedAt ?? row.dueAt,
      assigneeId: staffId,
      assigneeName: "",
      assignedByName: row.assignedByName,
      muaId: row.muaId,
      leadId: row.leadId,
      meta: row.muaName ?? row.brideName ?? null,
      link: `/tasks/ops/${row.id}?from=admin`,
    });
  }

  for (const row of careRows) {
    tasks.push({
      id: row.id,
      kind: "care",
      displayId: row.displayId,
      title: row.title,
      status: row.status,
      dueAt: row.completedAt ?? row.dueAt,
      assigneeId: staffId,
      assigneeName: "",
      taskType: row.taskType,
      muaId: row.muaId,
      leadId: row.leadId,
      meta: [row.ticketNumber, row.muaName, row.brideName].filter(Boolean).join(" · ") || row.ticketNumber,
      link: `/tasks/care/${row.id}`,
    });
  }

  for (const row of supportRows) {
    tasks.push({
      id: row.id,
      kind: "support",
      displayId: row.displayId,
      title: row.title,
      status: row.status,
      dueAt: row.completedAt ?? row.createdAt,
      assigneeId: staffId,
      assigneeName: "",
      meta: "Support inquiry",
      link: `/tasks/support/${row.id}`,
    });
  }

  return tasks.sort((a, b) => {
    const ad = a.dueAt ? new Date(a.dueAt).getTime() : 0;
    const bd = b.dueAt ? new Date(b.dueAt).getTime() : 0;
    return bd - ad;
  });
}
