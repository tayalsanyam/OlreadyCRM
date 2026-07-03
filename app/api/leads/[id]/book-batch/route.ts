import { NextResponse } from "next/server";
import { sql, withTransaction } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { confirmBooking } from "@/lib/booking";
import { canAccessLead, getLeadForAccess } from "@/lib/lead-access";
import { leadTracksCommission } from "@/lib/lead-commission";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";

type BatchItem = {
  eventId: string;
  bookedPrice: number;
  advancePaid?: number | null;
  fullPaid?: number | null;
  commissionAmount?: number | null;
  commissionPaid?: number | null;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: leadId } = await params;
  const body = (await request.json()) as {
    pushId?: string;
    items?: BatchItem[];
    zohoInvoiceRef?: string | null;
  };

  const pushId = body.pushId?.trim();
  const items = body.items?.filter((i) => i.eventId && i.bookedPrice != null) ?? [];

  if (!pushId || !items.length) {
    return NextResponse.json(
      { data: null, error: "pushId and at least one booking item required" },
      { status: 400 }
    );
  }

  const { session } = auth;
  const tracks = USE_MOCK
    ? mockStore.leadTracksCommission(leadId)
    : await leadTracksCommission(leadId);

  if (tracks) {
    for (const item of items) {
      if (item.commissionAmount == null || item.commissionAmount < 0) {
        return NextResponse.json(
          { data: null, error: "Commission amount required for each ceremony" },
          { status: 400 }
        );
      }
      const paid = item.commissionPaid ?? 0;
      if (paid < 0 || paid > item.commissionAmount) {
        return NextResponse.json(
          { data: null, error: "Invalid commission received on one or more ceremonies" },
          { status: 400 }
        );
      }
    }
  }

  if (USE_MOCK) {
    for (const item of items) {
      mockStore.confirmBooking({
        leadId,
        eventId: item.eventId,
        pushId,
        bookedPrice: item.bookedPrice,
        advancePaid: item.advancePaid,
        fullPaid: item.fullPaid,
        zohoInvoiceRef: body.zohoInvoiceRef,
        commissionAmount: tracks ? item.commissionAmount ?? null : null,
        commissionPaid: tracks ? item.commissionPaid ?? null : null,
        trackCommission: tracks,
        actorId: session.userId,
        actorName: session.name,
      });
    }
    return NextResponse.json({ data: { booked: items.length }, error: null });
  }

  const lead = await getLeadForAccess(leadId);
  if (!lead || !canAccessLead(session, lead)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const [push] = await sql<{ muaId: string; eventIds: string[] }[]>`
    SELECT mua_id, event_ids
    FROM mua_pushes
    WHERE id = ${pushId}::uuid AND lead_id = ${leadId}::uuid
  `;

  if (!push?.muaId) {
    return NextResponse.json(
      { data: null, error: "Push not found for this lead" },
      { status: 400 }
    );
  }

  const missing = items.filter((i) => !push.eventIds.includes(i.eventId));
  if (missing.length) {
    return NextResponse.json(
      {
        data: null,
        error: "Push does not include all selected ceremonies",
      },
      { status: 400 }
    );
  }

  await withTransaction(async (tx) => {
    for (const item of items) {
      await confirmBooking(tx, {
        leadId,
        eventId: item.eventId,
        muaId: push.muaId,
        pushId,
        bookedPrice: item.bookedPrice,
        advancePaid: item.advancePaid,
        fullPaid: item.fullPaid,
        zohoInvoiceRef: body.zohoInvoiceRef,
        commissionAmount: tracks ? item.commissionAmount ?? null : null,
        commissionPaid: tracks ? item.commissionPaid ?? null : null,
        trackCommission: tracks,
        actorId: session.userId,
      });
    }
  });

  return NextResponse.json({ data: { booked: items.length }, error: null });
}
