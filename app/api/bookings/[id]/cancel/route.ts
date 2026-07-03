import { NextResponse } from "next/server";
import { sql, withTransaction } from "@/db/index";
import { cancelBooking } from "@/lib/booking";
import { requireSession } from "@/lib/api-auth";
import { canAccessLead, getLeadForAccess } from "@/lib/lead-access";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  if (!["admin", "owner", "regionalRm", "commissionRm"].includes(auth.session.role)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const { id: bookingId } = await params;
  const body = (await request.json()) as { reason?: string };
  const reason = body.reason?.trim() || "Cancelled";

  if (USE_MOCK) {
    const result = mockStore.cancelBooking({
      bookingId,
      actorId: auth.session.userId,
      actorName: auth.session.name,
      reason,
    });
    if (!result) {
      return NextResponse.json(
        { data: null, error: "Booking not found or already cancelled" },
        { status: 404 }
      );
    }
    return NextResponse.json({ data: { ok: true, leadId: result.leadId }, error: null });
  }

  const [row] = await sql<{ leadId: string }[]>`
    SELECT lead_id AS "leadId"
    FROM bookings
    WHERE id = ${bookingId}::uuid AND cancelled = false
  `;
  if (!row) {
    return NextResponse.json(
      { data: null, error: "Booking not found or already cancelled" },
      { status: 404 }
    );
  }

  const lead = await getLeadForAccess(row.leadId);
  if (!lead || !canAccessLead(auth.session, lead)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const result = await withTransaction((tx) =>
    cancelBooking(tx, { bookingId, actorId: auth.session.userId, reason })
  );

  if (!result) {
    return NextResponse.json(
      { data: null, error: "Booking not found or already cancelled" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    data: { ok: true, leadId: result.leadId },
    error: null,
  });
}
