import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireGrievanceAccess } from "@/lib/api-auth";
import { getTicketById } from "@/lib/ticket-create";
import { logCareComm } from "@/lib/ticket-ledger";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: ticketId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    description?: string;
    metadata?: Record<string, unknown>;
  };

  const description = body.description?.trim();
  if (!description) {
    return NextResponse.json({ data: null, error: "description is required" }, { status: 400 });
  }

  const ok = await withTransaction(async (tx) => {
    const ticket = await getTicketById(tx, ticketId);
    if (!ticket) return null;

    await tx`
      INSERT INTO support.ticket_comments (
        ticket_id, author_id, body, is_internal, correspondence_kind, channel
      )
      VALUES (
        ${ticketId}::uuid,
        ${auth.session.userId}::uuid,
        ${description},
        true,
        'care_reply',
        'whatsapp'
      )
    `;

    if (ticket.muaId) {
      await logCareComm(tx, {
        muaId: ticket.muaId,
        leadId: ticket.leadId,
        entryType: "careWhatsappLogged",
        description,
        actorId: auth.session.userId,
        metadata: {
          ...body.metadata,
          ticketId,
          source: "grievance_centre",
        },
      });
    }

    return { ok: true };
  });

  if (!ok) {
    return NextResponse.json({ data: null, error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ data: ok, error: null }, { status: 201 });
}
