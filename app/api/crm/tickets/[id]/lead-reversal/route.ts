import { NextResponse } from "next/server";
import { sql, withTransaction } from "@/db/index";
import { requireGrievanceAccess, requireSession } from "@/lib/api-auth";
import { getTicketById } from "@/lib/ticket-create";
import { notifyAdminsOfTicket } from "@/lib/ticket-ledger";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const [row] = await sql`
    SELECT leads_requested AS "leadsRequested", leads_approved AS "leadsApproved",
      decision, decision_reason AS "decisionReason"
    FROM support.lead_reversal_reviews
    WHERE ticket_id = ${id}::uuid
  `;

  return NextResponse.json({ data: row ?? null, error: null });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const isOperator = ["careAgent", "admin", "owner"].includes(auth.session.role);
  if (!isOperator) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    leadsRequested?: number;
    leadsApproved?: number | null;
    decision?: string | null;
    decisionReason?: string | null;
  };

  const isAdmin = ["admin", "owner"].includes(auth.session.role);

  const row = await withTransaction(async (tx) => {
    const ticket = await getTicketById(tx, id);
    if (!ticket) return { notFound: true as const };

    const [existing] = await tx<{ id: string; decision: string | null }[]>`
      SELECT id, decision FROM support.lead_reversal_reviews WHERE ticket_id = ${id}::uuid
    `;

    let updated;
    if (existing) {
      const [result] = await tx`
        UPDATE support.lead_reversal_reviews SET
          leads_requested = COALESCE(${body.leadsRequested ?? null}, leads_requested),
          leads_approved = CASE WHEN ${isAdmin} THEN ${body.leadsApproved ?? null} ELSE leads_approved END,
          decision = CASE WHEN ${isAdmin} THEN ${body.decision ?? null} ELSE decision END,
          decision_reason = CASE WHEN ${isAdmin} THEN ${body.decisionReason ?? null} ELSE decision_reason END,
          reviewed_by = CASE WHEN ${isAdmin} AND ${body.decision ?? null} IS NOT NULL THEN ${auth.session.userId}::uuid ELSE reviewed_by END,
          reviewed_at = CASE WHEN ${isAdmin} AND ${body.decision ?? null} IS NOT NULL THEN NOW() ELSE reviewed_at END,
          updated_at = NOW()
        WHERE ticket_id = ${id}::uuid
        RETURNING leads_requested AS "leadsRequested", leads_approved AS "leadsApproved",
          decision, decision_reason AS "decisionReason"
      `;
      updated = result;
    } else {
      const [result] = await tx`
        INSERT INTO support.lead_reversal_reviews (ticket_id, leads_requested)
        VALUES (${id}::uuid, ${body.leadsRequested ?? 0})
        RETURNING leads_requested AS "leadsRequested", leads_approved AS "leadsApproved",
          decision, decision_reason AS "decisionReason"
      `;
      updated = result;
    }

    if (isAdmin && body.decision && body.decision !== existing?.decision) {
      await tx`
        INSERT INTO support.ticket_interventions (ticket_id, admin_id, action, payload)
        VALUES (
          ${id}::uuid,
          ${auth.session.userId}::uuid,
          'lead_reversal_decision',
          ${tx.json({
            decision: body.decision,
            leadsApproved: body.leadsApproved ?? null,
            reason: body.decisionReason ?? null,
          })}
        )
      `;

      await tx`
        INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal)
        VALUES (
          ${id}::uuid,
          ${auth.session.userId}::uuid,
          ${`Lead reversal decision: ${body.decision}${body.leadsApproved != null ? ` — ${body.leadsApproved} leads approved` : ""}${body.decisionReason ? `. ${body.decisionReason}` : ""}`},
          true
        )
      `;

      await notifyAdminsOfTicket(tx, {
        ticketId: id,
        ticketNumber: ticket.ticketNumber,
        message: `Lead reversal ${body.decision} on ${ticket.ticketNumber}`,
      });
    }

    return updated;
  });

  if (row && "notFound" in row) {
    return NextResponse.json({ data: null, error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ data: row, error: null });
}
