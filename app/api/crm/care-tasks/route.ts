import { NextResponse } from "next/server";
import { sql, withTransaction } from "@/db/index";
import { requireGrievanceAccess, requireSession } from "@/lib/api-auth";
import { apiErrorResponse } from "@/lib/api-error-response";
import {
  notifyTicketStakeholders,
  resolveCareNotifyLink,
} from "@/lib/ticket-admin-watch";
import { generateCareTaskDisplayId, getTicketById } from "@/lib/ticket-create";
import { resolveCareTaskDueAt } from "@/lib/care-task-due";
import { toDbCareTaskType, toDbTaskPriority } from "@/lib/ticket-db-mappers";
import type { CareTaskPriority, CareTaskType } from "@/lib/types";
import { fromDbRole } from "@/lib/db-mappers";

const ASSIGNED_ROLE_MAP: Record<string, string> = {
  regionalRm: "regional_rm",
  commissionRm: "commission_rm",
  feedbackRm: "feedback_rm",
  careAgent: "care_agent",
  salesRm: "sales_rm",
  salesTl: "sales_tl",
  salesActivation: "sales_activation",
  admin: "admin",
  owner: "owner",
  leadUploader: "lead_uploader",
};

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const scope = new URL(request.url).searchParams.get("scope") ?? "mine";
  const ticketId = new URL(request.url).searchParams.get("ticketId");
  const priority = new URL(request.url).searchParams.get("priority");
  const taskType = new URL(request.url).searchParams.get("taskType");
  const raisedByType = new URL(request.url).searchParams.get("raisedByType");
  const overdueOnly = new URL(request.url).searchParams.get("overdue") === "true";
  const isOperator = ["careAgent", "admin", "owner"].includes(auth.session.role);
  const showAll = scope === "all" && isOperator;

  try {
    const rows = await sql`
    SELECT
      tt.id,
      tt.display_id AS "displayId",
      tt.task_type::text AS "taskType",
      tt.status::text AS status,
      tt.priority::text AS priority,
      tt.title,
      tt.description,
      tt.due_at AS "dueAt",
      tt.ticket_id AS "ticketId",
      t.ticket_number AS "ticketNumber",
      t.category AS "ticketCategory",
      t.raised_by_type::text AS "raisedByType",
      t.raised_by_name AS "raisedByName",
      bl.bride_name AS "brideName",
      m.name AS "muaName",
      s.name AS "assigneeName"
    FROM support.ticket_tasks tt
    JOIN support.tickets t ON t.id = tt.ticket_id
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    LEFT JOIN rm.staff s ON s.id = tt.assigned_to
    WHERE tt.status IN ('pending', 'in_progress')
      AND (${ticketId ?? null}::uuid IS NULL OR tt.ticket_id = ${ticketId ?? null}::uuid)
      AND (${priority ?? null}::text IS NULL OR tt.priority::text = ${priority ?? null})
      AND (${taskType ?? null}::text IS NULL OR tt.task_type::text = ${taskType ?? null})
      AND (${raisedByType ?? null}::text IS NULL OR t.raised_by_type::text = ${raisedByType ?? null})
      AND (
        ${overdueOnly} = false
        OR (tt.due_at IS NOT NULL AND tt.due_at < NOW())
      )
      AND (
        ${showAll}
        OR tt.assigned_to = ${auth.session.userId}::uuid
      )
    ORDER BY
      CASE WHEN tt.due_at IS NOT NULL AND tt.due_at < NOW() THEN 0 ELSE 1 END,
      CASE tt.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      tt.due_at NULLS LAST,
      tt.created_at DESC
  `;

    return NextResponse.json({ data: rows, error: null });
  } catch (error) {
    return apiErrorResponse(error, "Failed to load care tasks");
  }
}

export async function POST(request: Request) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    ticketId?: string;
    taskType?: CareTaskType;
    title?: string;
    description?: string;
    assignedTo?: string;
    priority?: CareTaskPriority;
    dueAt?: string;
    requiresAdminApproval?: boolean;
  };

  if (!body.ticketId || !body.taskType || !body.title?.trim()) {
    return NextResponse.json(
      { data: null, error: "ticketId, taskType, and title are required" },
      { status: 400 }
    );
  }

  const taskType = body.taskType;
  const title = body.title.trim();

  try {
    const task = await withTransaction(async (tx) => {
      const displayId = await generateCareTaskDisplayId(tx);

      let assignedRole: string | null = null;
      if (body.assignedTo) {
        const [staff] = await tx<{ role: string }[]>`
          SELECT role::text AS role FROM rm.staff WHERE id = ${body.assignedTo}::uuid
        `;
        if (staff) {
          const appRole = fromDbRole(staff.role);
          assignedRole = ASSIGNED_ROLE_MAP[appRole] ?? staff.role;
        }
      }

      const dueAt =
        body.dueAt ??
        (await resolveCareTaskDueAt(tx, { assigneeId: body.assignedTo ?? null }));

      const [row] = await tx<{ id: string; displayId: string }[]>`
        INSERT INTO support.ticket_tasks (
          ticket_id,
          display_id,
          task_type,
          title,
          description,
          assigned_to,
          assigned_role,
          priority,
          due_at,
          requires_admin_approval,
          created_by,
          task_payload
        ) VALUES (
          ${body.ticketId}::uuid,
          ${displayId},
          ${toDbCareTaskType(taskType)}::support.care_task_type,
          ${title},
          ${body.description ?? null},
          ${body.assignedTo ?? null},
          ${assignedRole}::rm.user_role,
          ${toDbTaskPriority(body.priority ?? "normal")}::support.task_priority,
          ${dueAt},
          ${body.requiresAdminApproval ?? false},
          ${auth.session.userId}::uuid,
          ${tx.json({ manual: true })}
        )
        RETURNING id, display_id AS "displayId"
      `;

      if (body.assignedTo && row) {
        const link = await resolveCareNotifyLink(tx, body.assignedTo, body.ticketId!);
        await tx`
          INSERT INTO notifications (staff_id, message, link)
          VALUES (
            ${body.assignedTo}::uuid,
            ${`New care task ${displayId}: ${title}`},
            ${link}
          )
        `;
      }

      await tx`
        INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal)
        VALUES (
          ${body.ticketId}::uuid,
          ${auth.session.userId}::uuid,
          ${`Care task ${displayId} assigned: ${title}`},
          true
        )
      `;

      const ticket = await getTicketById(tx, body.ticketId!);
      if (ticket) {
        await notifyTicketStakeholders(
          tx,
          ticket,
          `${displayId} assigned on ${ticket.ticketNumber}: ${title}`,
          { excludeStaffId: auth.session.userId }
        );
      }

      return row;
    });

    return NextResponse.json({ data: task, error: null }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create task";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
