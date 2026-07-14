import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireGrievanceAccess } from "@/lib/api-auth";
import { getTicketById } from "@/lib/ticket-create";
import { appendTicketUpdate, fetchTicketUpdates } from "@/lib/ticket-update";
import { hasTicketViewAccess } from "@/lib/ticket-access";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const updates = await withTransaction(async (tx) => {
    const allowed = await hasTicketViewAccess(tx, auth.session, id);
    if (!allowed) return { forbidden: true as const };
    return fetchTicketUpdates(tx, id);
  });

  if (updates && "forbidden" in updates) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ data: { updates }, error: null });
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    updateText?: string;
    categories?: string[];
    leadIds?: string[];
    reopenIfClosed?: boolean;
  };

  try {
    const result = await withTransaction(async (tx) => {
      const allowed = await hasTicketViewAccess(tx, auth.session, id);
      if (!allowed) return { forbidden: true as const };

      const ticket = await getTicketById(tx, id);
      if (!ticket) return null;

      return appendTicketUpdate(tx, id, {
        updateText: body.updateText ?? "",
        categories: body.categories,
        leadIds: body.leadIds,
        source: "internal",
        createdBy: auth.session.userId,
        reopenIfClosed: body.reopenIfClosed,
      });
    });

    if (result && "forbidden" in result) {
      return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
    }
    if (!result) {
      return NextResponse.json({ data: null, error: "Ticket not found" }, { status: 404 });
    }

    return NextResponse.json({ data: result, error: null }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add update";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
