import { NextResponse } from "next/server";
import { sql, withTransaction } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { confirmBooking } from "@/lib/booking";
import { canAccessLead, getLeadForAccess } from "@/lib/lead-access";
import { leadTracksCommission } from "@/lib/lead-commission";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    eventId: string;
    pushId: string;
    bookedPrice: number;
    advancePaid?: number | null;
    fullPaid?: number | null;
    zohoInvoiceRef?: string | null;
    commissionAmount?: number | null;
    commissionPaid?: number | null;
  };

  if (!body.eventId || !body.pushId || body.bookedPrice == null) {
    return NextResponse.json(
      { data: null, error: "eventId, pushId, bookedPrice required" },
      { status: 400 }
    );
  }

  const { session } = auth;
  const tracks = USE_MOCK
    ? mockStore.leadTracksCommission(id)
    : await leadTracksCommission(id);

  if (tracks) {
    if (body.commissionAmount == null || body.commissionAmount < 0) {
      return NextResponse.json(
        { data: null, error: "Commission amount (from MUA) is required" },
        { status: 400 }
      );
    }
    const paid = body.commissionPaid ?? 0;
    if (paid < 0 || paid > body.commissionAmount) {
      return NextResponse.json(
        { data: null, error: "Commission received cannot exceed commission due" },
        { status: 400 }
      );
    }
  }

  if (USE_MOCK) {
    mockStore.confirmBooking({
      leadId: id,
      eventId: body.eventId,
      pushId: body.pushId,
      bookedPrice: body.bookedPrice,
      advancePaid: body.advancePaid,
      fullPaid: body.fullPaid,
      zohoInvoiceRef: body.zohoInvoiceRef,
      commissionAmount: tracks ? body.commissionAmount ?? null : null,
      commissionPaid: tracks ? body.commissionPaid ?? null : null,
      trackCommission: tracks,
      actorId: session.userId,
      actorName: session.name,
    });
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  const lead = await getLeadForAccess(id);
  if (!lead || !canAccessLead(session, lead)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const [push] = await sql<{ muaId: string }[]>`
    SELECT mua_id FROM mua_pushes WHERE id = ${body.pushId}::uuid
  `;

  await withTransaction((tx) =>
    confirmBooking(tx, {
      leadId: id,
      eventId: body.eventId,
      muaId: push?.muaId ?? "",
      pushId: body.pushId,
      bookedPrice: body.bookedPrice,
      advancePaid: body.advancePaid,
      fullPaid: body.fullPaid,
      zohoInvoiceRef: body.zohoInvoiceRef,
      commissionAmount: tracks ? body.commissionAmount ?? null : null,
      commissionPaid: tracks ? body.commissionPaid ?? null : null,
      trackCommission: tracks,
      actorId: session.userId,
    })
  );

  return NextResponse.json({ data: { ok: true }, error: null });
}
