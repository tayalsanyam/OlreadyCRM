import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireGrievanceAccess } from "@/lib/api-auth";
import { getOpenAiModel } from "@/lib/ai-config";
import { buildTicketContext } from "@/lib/ticket-context";
import { runTicketAi, type AiMode } from "@/lib/ticket-ai";
import { getTicketById } from "@/lib/ticket-create";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    mode?: AiMode;
    message?: string;
  };

  const mode = body.mode ?? "issue_analysis";

  const data = await withTransaction(async (tx) => {
    const ticket = await getTicketById(tx, id);
    if (!ticket) return null;

    const context = await buildTicketContext(tx, ticket.muaId, ticket.id, ticket.leadId);
    const ai = await runTicketAi(tx, {
      mode,
      message: body.message,
      complaintText: ticket.complaintText,
      category: ticket.category,
      context,
    });

    await tx`
      INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal, is_ai_generated, ai_mode)
      VALUES (
        ${id}::uuid,
        ${auth.session.userId}::uuid,
        ${ai.response},
        true,
        true,
        ${mode}
      )
    `;

    await tx`
      INSERT INTO support.ticket_ai_logs (ticket_id, mode, prompt_summary, response, model, created_by)
      VALUES (
        ${id}::uuid,
        ${mode},
        ${body.message ?? ticket.complaintText.slice(0, 500)},
        ${ai.response},
        ${getOpenAiModel()},
        ${auth.session.userId}::uuid
      )
    `;

    return {
      response: ai.response,
      docTitles: ai.docTitles,
      triage: ai.triage,
      emailDraft: ai.emailDraft,
    };
  });

  if (!data) {
    return NextResponse.json({ data: null, error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ data, error: null });
}
