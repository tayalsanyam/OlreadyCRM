import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireGrievanceAccess } from "@/lib/api-auth";
import { notifyCareIncharge } from "@/lib/ticket-admin-watch";
import { getTicketById } from "@/lib/ticket-create";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  if (!["admin", "owner"].includes(auth.session.role)) {
    return NextResponse.json({ data: null, error: "Admin only" }, { status: 403 });
  }

  const { id: ticketId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: "take_ownership" | "add_directive";
    directive?: string;
    reason?: string;
  };

  if (!body.action) {
    return NextResponse.json({ data: null, error: "action is required" }, { status: 400 });
  }

  const result = await withTransaction(async (tx) => {
    const ticket = await getTicketById(tx, ticketId);
    if (!ticket) return null;

    if (body.action === "take_ownership") {
      await tx`
        UPDATE support.tickets
        SET assigned_admin_id = ${auth.session.userId}::uuid, updated_at = NOW()
        WHERE id = ${ticketId}::uuid
      `;
      await tx`
        INSERT INTO support.ticket_interventions (ticket_id, admin_id, action, payload)
        VALUES (
          ${ticketId}::uuid,
          ${auth.session.userId}::uuid,
          'take_ownership',
          ${tx.json({ reason: body.reason ?? null })}
        )
      `;
      await tx`
        INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal)
        VALUES (
          ${ticketId}::uuid,
          ${auth.session.userId}::uuid,
          ${`Admin took ownership${body.reason ? `: ${body.reason}` : ""}`},
          true
        )
      `;
    }

    if (body.action === "add_directive") {
      const text = body.directive?.trim();
      if (!text) return { error: "directive is required" as const };
      await tx`
        INSERT INTO support.ticket_interventions (ticket_id, admin_id, action, payload)
        VALUES (
          ${ticketId}::uuid,
          ${auth.session.userId}::uuid,
          'admin_directive',
          ${tx.json({ directive: text })}
        )
      `;
      await tx`
        INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal)
        VALUES (
          ${ticketId}::uuid,
          ${auth.session.userId}::uuid,
          ${`Admin directive: ${text}`},
          true
        )
      `;
      const updated = await getTicketById(tx, ticketId);
      if (updated) {
        await notifyCareIncharge(tx, updated, `Admin directive on ${updated.ticketNumber}`, {
          excludeStaffId: auth.session.userId,
        });
      }
    }

    return { ok: true };
  });

  if (!result) {
    return NextResponse.json({ data: null, error: "Ticket not found" }, { status: 404 });
  }
  if ("error" in result) {
    return NextResponse.json({ data: null, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result, error: null });
}
