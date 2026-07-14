import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireGrievanceAccess } from "@/lib/api-auth";
import { getTicketById } from "@/lib/ticket-create";
import {
  communicationsToCsv,
  fetchTicketCommunications,
} from "@/lib/ticket-communications";
import { hasTicketViewAccess } from "@/lib/ticket-access";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");

  const data = await withTransaction(async (tx) => {
    const allowed = await hasTicketViewAccess(tx, auth.session, id);
    if (!allowed) return { forbidden: true as const };

    const ticket = await getTicketById(tx, id);
    if (!ticket) return null;

    const communications = await fetchTicketCommunications(tx, id);
    return { ticketNumber: ticket.ticketNumber, communications };
  });

  if (data && "forbidden" in data) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }
  if (!data) {
    return NextResponse.json({ data: null, error: "Ticket not found" }, { status: 404 });
  }

  if (format === "csv") {
    const csv = communicationsToCsv(data.ticketNumber, data.communications);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${data.ticketNumber}-communications.csv"`,
      },
    });
  }

  return NextResponse.json({ data, error: null });
}
