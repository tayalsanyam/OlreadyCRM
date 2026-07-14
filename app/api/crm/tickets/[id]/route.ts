import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireGrievanceAccess, requireSession } from "@/lib/api-auth";
import { getTicketById } from "@/lib/ticket-create";
import { buildTicketContext } from "@/lib/ticket-context";
import { fetchTicketUpdates } from "@/lib/ticket-update";
import { hasTicketViewAccess } from "@/lib/ticket-access";
import { allCategoriesFromTicket } from "@/lib/ticket-categories";
import { categoriesRequireLedger } from "@/lib/ticket-category-config";
import { toDbTicketStatus } from "@/lib/ticket-db-mappers";
import type { TicketStatus } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  try {
    const data = await withTransaction(async (tx) => {
    const allowed = await hasTicketViewAccess(tx, auth.session, id);
    if (!allowed) return { forbidden: true as const };

    const ticket = await getTicketById(tx, id);
    if (!ticket) return null;

    const [comments, tasks, context, updates] = await Promise.all([
      tx`
        SELECT
          c.id,
          c.body,
          c.is_internal AS "isInternal",
          c.is_ai_generated AS "isAiGenerated",
          c.ai_mode AS "aiMode",
          c.correspondence_kind AS "correspondenceKind",
          c.channel,
          c.created_at AS "createdAt",
          s.name AS "authorName"
        FROM support.ticket_comments c
        LEFT JOIN staff s ON s.id = c.author_id
        WHERE c.ticket_id = ${id}::uuid
        ORDER BY c.created_at ASC
      `,
      tx`
        SELECT
          tt.id,
          tt.display_id AS "displayId",
          tt.task_type::text AS "taskType",
          tt.status::text AS status,
          tt.priority::text AS priority,
          tt.title,
          tt.description,
          tt.due_at AS "dueAt",
          tt.assigned_to AS "assignedTo",
          s.name AS "assigneeName"
        FROM support.ticket_tasks tt
        LEFT JOIN staff s ON s.id = tt.assigned_to
        WHERE tt.ticket_id = ${id}::uuid
        ORDER BY
          CASE tt.status::text
            WHEN 'pending' THEN 0
            WHEN 'in_progress' THEN 0
            ELSE 1
          END,
          CASE tt.status::text WHEN 'done' THEN 0 WHEN 'cancelled' THEN 1 ELSE 2 END,
          tt.completed_at DESC NULLS LAST,
          tt.updated_at DESC,
          tt.created_at ASC
      `,
      buildTicketContext(tx, ticket.muaId, ticket.id, ticket.leadId),
      fetchTicketUpdates(tx, id),
    ]);

    const categories = allCategoriesFromTicket(ticket.category, ticket.tags ?? []);
    const requiresLedger = await categoriesRequireLedger(tx, categories);
    const hasLedger = (ticket.tags ?? []).includes("ledger-attached");

    return { ticket, comments, tasks, context, updates, requiresLedger, hasLedger };
    });

    if (data && "forbidden" in data) {
      return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
    }
    if (!data) {
      return NextResponse.json({ data: null, error: "Ticket not found" }, { status: 404 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error("[GET /api/crm/tickets/:id]", err);
    const message = err instanceof Error ? err.message : "Failed to load ticket";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    status?: TicketStatus;
    urgency?: "high" | "medium" | "low";
    assignedTo?: string | null;
    muaId?: string | null;
    leadId?: string | null;
    reason?: string;
  };

  const ticket = await withTransaction(async (tx) => {
    const existing = await getTicketById(tx, id);
    if (!existing) return null;

    if (body.status) {
      const dbStatus = toDbTicketStatus(body.status);
      await tx`
        UPDATE support.tickets
        SET status = ${dbStatus}::support.ticket_status,
            updated_at = NOW(),
            closed_at = CASE WHEN ${dbStatus} = 'closed' THEN NOW() ELSE closed_at END,
            closed_by = CASE WHEN ${dbStatus} = 'closed' THEN ${auth.session.userId}::uuid ELSE closed_by END
        WHERE id = ${id}::uuid
      `;
      await tx`
        INSERT INTO support.ticket_status_history (ticket_id, from_status, to_status, changed_by, reason)
        VALUES (
          ${id}::uuid,
          ${toDbTicketStatus(existing.status)}::support.ticket_status,
          ${dbStatus}::support.ticket_status,
          ${auth.session.userId}::uuid,
          ${body.reason ?? null}
        )
      `;
    }

    if (body.urgency) {
      await tx`
        UPDATE support.tickets
        SET urgency = ${body.urgency}::support.ticket_urgency, updated_at = NOW()
        WHERE id = ${id}::uuid
      `;
    }

    if (body.assignedTo !== undefined) {
      await tx`
        UPDATE support.tickets
        SET assigned_to = ${body.assignedTo}, updated_at = NOW()
        WHERE id = ${id}::uuid
      `;
    }

    if (body.muaId !== undefined || body.leadId !== undefined) {
      await tx`
        UPDATE support.tickets
        SET
          mua_id = COALESCE(${body.muaId ?? null}::uuid, mua_id),
          lead_id = COALESCE(${body.leadId ?? null}::uuid, lead_id),
          updated_at = NOW()
        WHERE id = ${id}::uuid
      `;
    }

    return getTicketById(tx, id);
  });

  if (!ticket) {
    return NextResponse.json({ data: null, error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ data: ticket, error: null });
}
