import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { lookupOpenTicketsByPhone } from "@/lib/public-ticket-intake";
import { normalizePhone } from "@/lib/phone";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get("phone")?.trim() ?? "";

  if (normalizePhone(phone).length < 10) {
    return NextResponse.json(
      { data: null, error: "A valid 10-digit phone number is required." },
      { status: 400 }
    );
  }

  const tickets = await withTransaction(async (tx) => lookupOpenTicketsByPhone(tx, phone));

  return NextResponse.json({ data: { tickets }, error: null });
}
