import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireGrievanceAccess } from "@/lib/api-auth";
import { loopInAdminOnTicket, notifyTicketStakeholders } from "@/lib/ticket-admin-watch";
import { createStatusChangeCareTask, cancelPendingPrimaryCareTasks } from "@/lib/ticket-care-workflow";
import { getTicketById } from "@/lib/ticket-create";
import { toDbTicketStatus } from "@/lib/ticket-db-mappers";
import { ticketStatusLabel } from "@/lib/ticket-status";
import type { TicketStatus } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    status?: TicketStatus;
    note?: string;
    nextFollowUpAt?: string;
    whatsappLogged?: boolean;
    whatsappSummary?: string;
    loopInAdminId?: string;
    adminBrief?: string;
    adminDueAt?: string;
  };

  if (!body.status) {
    return NextResponse.json({ data: null, error: "status is required" }, { status: 400 });
  }

  const toStatus = body.status;

  const result = await withTransaction(async (tx) => {
    const existing = await getTicketById(tx, id);
    if (!existing) return null;

    const dbStatus = toDbTicketStatus(toStatus);
    const fromDb = toDbTicketStatus(existing.status);

    if (fromDb === dbStatus) {
      return { ticket: existing, unchanged: true as const };
    }

    await tx`
      UPDATE support.tickets
      SET status = ${dbStatus}::support.ticket_status,
          updated_at = NOW(),
          closed_at = CASE WHEN ${dbStatus} = 'closed' THEN NOW() ELSE closed_at END,
          closed_by = CASE WHEN ${dbStatus} = 'closed' THEN ${auth.session.userId}::uuid ELSE closed_by END
      WHERE id = ${id}::uuid
    `;

    const reason = [body.note, body.whatsappSummary].filter(Boolean).join(" · ") || null;

    await tx`
      INSERT INTO support.ticket_status_history (ticket_id, from_status, to_status, changed_by, reason)
      VALUES (
        ${id}::uuid,
        ${fromDb}::support.ticket_status,
        ${dbStatus}::support.ticket_status,
        ${auth.session.userId}::uuid,
        ${reason}
      )
    `;

    const commentParts = [`Status → ${ticketStatusLabel(toStatus)}`];
    if (body.note?.trim()) commentParts.push(body.note.trim());
    if (body.whatsappLogged) commentParts.push("WhatsApp logged with status change");

    await tx`
      INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal)
      VALUES (
        ${id}::uuid,
        ${auth.session.userId}::uuid,
        ${commentParts.join("\n")},
        true
      )
    `;

    const updated = await getTicketById(tx, id);
    if (!updated) return null;

    if (toStatus === "closed") {
      await cancelPendingPrimaryCareTasks(tx, id);
    } else {
      await createStatusChangeCareTask(tx, updated, toStatus, {
        createdBy: auth.session.userId,
        nextFollowUpAt: body.nextFollowUpAt ?? null,
        note: body.note,
      });
    }

    if (body.loopInAdminId) {
      await loopInAdminOnTicket(tx, {
        ticket: updated,
        adminId: body.loopInAdminId,
        brief: body.adminBrief,
        dueAt: body.adminDueAt ?? body.nextFollowUpAt ?? null,
        createdBy: auth.session.userId,
      });
    }

    const finalTicket = await getTicketById(tx, id);
    if (finalTicket) {
      const statusLabel = ticketStatusLabel(toStatus);
      await notifyTicketStakeholders(
        tx,
        finalTicket,
        `${finalTicket.ticketNumber} status → ${statusLabel}`,
        { excludeStaffId: auth.session.userId }
      );
    }

    return { ticket: finalTicket ?? updated, unchanged: false as const };
  });

  if (!result) {
    return NextResponse.json({ data: null, error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ data: result, error: null });
}
