import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireGrievanceAccess } from "@/lib/api-auth";
import { getTicketById } from "@/lib/ticket-create";
import { buildTicketInvestigation } from "@/lib/ticket-investigation";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const data = await withTransaction(async (tx) => {
    const ticket = await getTicketById(tx, id);
    if (!ticket) return null;
    const investigation = await buildTicketInvestigation(
      tx,
      ticket.muaId,
      id,
      ticket.leadId,
    );
    return { ticketId: id, muaId: ticket.muaId, investigation };
  });

  if (!data) {
    return NextResponse.json({ data: null, error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ data, error: null });
}
