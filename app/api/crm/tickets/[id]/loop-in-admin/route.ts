import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireGrievanceAccess } from "@/lib/api-auth";
import { loopInAdminOnTicket } from "@/lib/ticket-admin-watch";
import { getTicketById } from "@/lib/ticket-create";
import type { CareTaskPriority } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    adminId?: string;
    brief?: string;
    dueAt?: string;
    priority?: CareTaskPriority;
  };

  if (!body.adminId) {
    return NextResponse.json({ data: null, error: "adminId is required" }, { status: 400 });
  }

  try {
    const result = await withTransaction(async (tx) => {
      const ticket = await getTicketById(tx, id);
      if (!ticket) return null;

      const task = await loopInAdminOnTicket(tx, {
        ticket,
        adminId: body.adminId!,
        brief: body.brief,
        dueAt: body.dueAt ?? null,
        priority: body.priority,
        createdBy: auth.session.userId,
      });

      const updated = await getTicketById(tx, id);
      return { task, ticket: updated };
    });

    if (!result) {
      return NextResponse.json({ data: null, error: "Ticket not found" }, { status: 404 });
    }

    return NextResponse.json({ data: result, error: null }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Loop-in failed";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
