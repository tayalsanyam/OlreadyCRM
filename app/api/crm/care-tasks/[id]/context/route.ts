import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { hasCareTaskAccess } from "@/lib/ticket-access";
import { allCategoriesFromTicket } from "@/lib/ticket-categories";
import { categoriesRequireLedger } from "@/lib/ticket-category-config";
import {
  allowedTicketStatusesOnComplete,
  suggestedTicketStatusOnComplete,
  ticketStatusOptionLabel,
} from "@/lib/care-task-status-options";
import { hasOpenPrimaryCareTask } from "@/lib/ticket-care-workflow";
import { isGrievanceOperator } from "@/lib/ticket-access";
import { normalizeTicketStatusKey } from "@/lib/ticket-status";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: taskId } = await params;

  const data = await withTransaction(async (tx) => {
    const allowed = await hasCareTaskAccess(tx, auth.session, taskId);
    if (!allowed) return { forbidden: true as const };

    const [task] = await tx<
      {
        id: string;
        displayId: string;
        taskType: string;
        status: string;
        priority: string;
        title: string;
        description: string | null;
        dueAt: string | null;
        ticketId: string;
        taskPayload: Record<string, unknown>;
      }[]
    >`
      SELECT
        id,
        display_id AS "displayId",
        task_type::text AS "taskType",
        status::text AS status,
        priority::text AS priority,
        title,
        description,
        due_at AS "dueAt",
        ticket_id AS "ticketId",
        COALESCE(task_payload, '{}'::jsonb) AS "taskPayload"
      FROM support.ticket_tasks
      WHERE id = ${taskId}::uuid
    `;
    if (!task) return null;

    const [ticket] = await tx<
      {
        id: string;
        ticketNumber: string;
        category: string;
        status: string;
        urgency: string;
        complaintText: string;
        muaId: string | null;
        muaName: string | null;
        raisedByName: string | null;
        raisedByPhone: string | null;
        raisedByType: string;
        brideName: string | null;
        tags: string[];
        createdAt: string;
      }[]
    >`
      SELECT
        t.id,
        t.ticket_number AS "ticketNumber",
        t.category,
        t.status::text AS status,
        t.urgency::text AS urgency,
        t.complaint_text AS "complaintText",
        t.mua_id AS "muaId",
        m.name AS "muaName",
        t.raised_by_name AS "raisedByName",
        t.raised_by_phone AS "raisedByPhone",
        t.raised_by_type::text AS "raisedByType",
        bl.bride_name AS "brideName",
        t.tags,
        t.created_at AS "createdAt"
      FROM support.tickets t
      LEFT JOIN muas m ON m.id = t.mua_id
      LEFT JOIN bride_leads bl ON bl.id = t.lead_id
      WHERE t.id = ${task.ticketId}::uuid
    `;
    if (!ticket) return null;

    const categories = allCategoriesFromTicket(ticket.category, ticket.tags ?? []);
    const requiresLedger = await categoriesRequireLedger(tx, categories);
    const hasLedger = (ticket.tags ?? []).includes("ledger-attached");

    const attachments = await tx<
      { id: string; fileName: string; filePath: string; createdAt: string; taskId: string | null }[]
    >`
      SELECT
        id,
        file_name AS "fileName",
        file_path AS "filePath",
        created_at AS "createdAt",
        task_id AS "taskId"
      FROM support.ticket_attachments
      WHERE ticket_id = ${task.ticketId}::uuid
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const ticketStatus = normalizeTicketStatusKey(ticket.status);
    const allowedStatuses = allowedTicketStatusesOnComplete(
      auth.session.role,
      task.taskType,
      ticketStatus,
      ticket.raisedByType
    );
    const suggestedStatus = suggestedTicketStatusOnComplete(task.taskType, ticketStatus);

    const [ledgerStats] = await tx<{ total: number; matched: number }[]>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE matched_lead_id IS NOT NULL)::int AS matched
      FROM support.lead_usage_rows
      WHERE ticket_id = ${task.ticketId}::uuid
    `;

    const hasOpenPrimaryTask = await hasOpenPrimaryCareTask(tx, task.ticketId, task.id);
    const emailApproval = task.taskPayload.emailApproval === true;

    return {
      task,
      emailApproval,
      ticket: { ...ticket, status: ticketStatus },
      categories,
      requiresLedger,
      hasLedger,
      attachments,
      taskAttachments: attachments.filter((a: { taskId: string | null; id: string }) => a.taskId === task.id),
      ledgerStats: ledgerStats ?? { total: 0, matched: 0 },
      isOperator: isGrievanceOperator(auth.session.role),
      canSendBack: !isGrievanceOperator(auth.session.role),
      hasOpenPrimaryTask,
      allowedStatuses: allowedStatuses.map((s) => ({
        value: s,
        label: ticketStatusOptionLabel(s, ticket.raisedByType),
      })),
      suggestedStatus,
    };
  });

  if (data && "forbidden" in data) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }
  if (!data) {
    return NextResponse.json({ data: null, error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ data, error: null });
}
