import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { lookupPublicTicket } from "@/lib/public-ticket-intake";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    ticketNumber?: string;
    phone?: string;
  };

  const ticketNumber = body.ticketNumber?.trim();
  const phone = body.phone?.trim();

  if (!ticketNumber || !phone) {
    return NextResponse.json(
      { data: null, error: "Ticket reference and phone are both required." },
      { status: 400 }
    );
  }

  try {
    const result = await lookupPublicTicket(sql, ticketNumber, phone);

    if (!result) {
      return NextResponse.json(
        {
          data: null,
          error: "No ticket found for that reference and phone. Check both and try again.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: result, error: null });
  } catch (err) {
    console.error("[public/concerns/lookup]", err);
    return NextResponse.json(
      { data: null, error: "Unable to look up ticket status. Try again later." },
      { status: 500 }
    );
  }
}
