import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireGrievanceAccess } from "@/lib/api-auth";
import { getTicketById } from "@/lib/ticket-create";
import { logCareComm } from "@/lib/ticket-ledger";
import {
  CORRESPONDENCE_CHANNEL_LABEL,
  CORRESPONDENCE_KIND_LABEL,
  isCorrespondenceChannel,
  isCorrespondenceKind,
  type CorrespondenceChannel,
  type CorrespondenceKind,
} from "@/lib/ticket-correspondence";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: ticketId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    kind?: string;
    channel?: string;
    body?: string;
  };

  const kind = body.kind?.trim();
  const channel = body.channel?.trim();
  const text = body.body?.trim();

  if (!kind || !isCorrespondenceKind(kind)) {
    return NextResponse.json(
      { data: null, error: "kind must be care_reply, party_reply, or internal_note" },
      { status: 400 }
    );
  }
  if (!channel || !isCorrespondenceChannel(channel)) {
    return NextResponse.json(
      { data: null, error: "channel must be email, whatsapp, phone, in_person, or other" },
      { status: 400 }
    );
  }
  if (!text) {
    return NextResponse.json({ data: null, error: "body is required" }, { status: 400 });
  }

  const result = await withTransaction(async (tx) => {
    const ticket = await getTicketById(tx, ticketId);
    if (!ticket) return null;

    const [row] = await tx<{ id: string; createdAt: string }[]>`
      INSERT INTO support.ticket_comments (
        ticket_id,
        author_id,
        body,
        is_internal,
        correspondence_kind,
        channel
      ) VALUES (
        ${ticketId}::uuid,
        ${auth.session.userId}::uuid,
        ${text},
        true,
        ${kind},
        ${channel}
      )
      RETURNING id, created_at AS "createdAt"
    `;

    if (ticket.muaId) {
      const kindLabel = CORRESPONDENCE_KIND_LABEL[kind as CorrespondenceKind];
      const channelLabel = CORRESPONDENCE_CHANNEL_LABEL[channel as CorrespondenceChannel];
      await logCareComm(tx, {
        muaId: ticket.muaId,
        leadId: ticket.leadId,
        entryType: kind === "party_reply" ? "careCallbackLogged" : "note",
        description: `${kindLabel} (${channelLabel}, ${ticket.ticketNumber}): ${text.slice(0, 280)}${
          text.length > 280 ? "…" : ""
        }`,
        actorId: auth.session.userId,
        metadata: {
          ticketId,
          commentId: row.id,
          correspondenceKind: kind,
          channel,
          source: "grievance_correspondence",
        },
      });
    }

    return row;
  });

  if (!result) {
    return NextResponse.json({ data: null, error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ data: result, error: null }, { status: 201 });
}
