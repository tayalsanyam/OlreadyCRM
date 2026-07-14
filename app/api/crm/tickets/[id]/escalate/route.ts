import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireGrievanceAccess } from "@/lib/api-auth";
import { loopInAdminOnTicket, notifyWatchingAdmin } from "@/lib/ticket-admin-watch";
import { logCareComm, notifyAdminsOfTicket } from "@/lib/ticket-ledger";
import { getTicketById } from "@/lib/ticket-create";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    toLevel?: number;
    reason?: string;
    loopInAdminId?: string;
  };

  const toLevel = body.toLevel ?? 2;
  if (toLevel < 2 || toLevel > 3) {
    return NextResponse.json({ data: null, error: "toLevel must be 2 or 3" }, { status: 400 });
  }

  if (!body.reason?.trim() || body.reason.trim().length < 10) {
    return NextResponse.json(
      { data: null, error: "Escalation reason is required (min 10 characters)" },
      { status: 400 }
    );
  }

  try {
    const ticket = await withTransaction(async (tx) => {
      const existing = await getTicketById(tx, id);
      if (!existing) return null;

      if (toLevel <= existing.escalationLevel) {
        throw new Error(`Ticket is already at L${existing.escalationLevel}`);
      }

      const fromLevel = existing.escalationLevel;
      const reason = body.reason!.trim();

      await tx`
        UPDATE support.tickets
        SET
          escalation_level = ${toLevel},
          escalated_at = NOW(),
          escalated_by = ${auth.session.userId}::uuid,
          escalation_reason = ${reason},
          flags = array_append(COALESCE(flags, '{}'), ${`escalated-l${toLevel}`}),
          updated_at = NOW()
        WHERE id = ${id}::uuid
      `;

      await tx`
        INSERT INTO support.ticket_escalations (ticket_id, from_level, to_level, reason, escalated_by)
        VALUES (${id}::uuid, ${fromLevel}, ${toLevel}, ${reason}, ${auth.session.userId}::uuid)
      `;

      await tx`
        INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal)
        VALUES (
          ${id}::uuid,
          ${auth.session.userId}::uuid,
          ${`Escalated L${fromLevel} → L${toLevel}: ${reason}`},
          true
        )
      `;

      if (existing.muaId) {
        await logCareComm(tx, {
          muaId: existing.muaId,
          leadId: existing.leadId,
          entryType: "careEscalation",
          description: `Care ticket ${existing.ticketNumber} escalated to L${toLevel}`,
          actorId: auth.session.userId,
          metadata: { ticketId: id, toLevel, fromLevel },
        });
      }

      let updated = await getTicketById(tx, id);
      if (!updated) return null;

      if (body.loopInAdminId) {
        await loopInAdminOnTicket(tx, {
          ticket: updated,
          adminId: body.loopInAdminId,
          brief: reason,
          createdBy: auth.session.userId,
        });
        updated = (await getTicketById(tx, id)) ?? updated;
      }

      const message = `Escalated ${updated.ticketNumber} to L${toLevel}`;
      if (updated.assignedAdminId) {
        await notifyWatchingAdmin(tx, updated, message, { excludeStaffId: auth.session.userId });
      } else {
        await notifyAdminsOfTicket(tx, {
          ticketId: id,
          ticketNumber: updated.ticketNumber,
          message,
        });
      }

      return updated;
    });

    if (!ticket) {
      return NextResponse.json({ data: null, error: "Ticket not found" }, { status: 404 });
    }

    return NextResponse.json({ data: ticket, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Escalation failed";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
