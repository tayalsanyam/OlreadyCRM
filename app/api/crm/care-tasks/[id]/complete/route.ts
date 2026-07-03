import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { completeCareTask } from "@/lib/care-task-complete";
import type { TicketStatus } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    outcome?: string;
    summary?: string;
    taskPayload?: Record<string, unknown>;
    nextFollowUpAt?: string;
    ticketStatus?: TicketStatus;
    sendBack?: boolean;
    sendBackNote?: string;
  };

  if (!body.summary?.trim() && !body.sendBack) {
    return NextResponse.json({ data: null, error: "summary is required" }, { status: 400 });
  }

  const result = await withTransaction(async (tx) =>
    completeCareTask(tx, {
      taskId: id,
      actorId: auth.session.userId,
      actorRole: auth.session.role,
      summary: body.summary?.trim() ?? "",
      outcome: body.outcome ?? null,
      nextFollowUpAt: body.nextFollowUpAt ?? null,
      ticketStatus: body.ticketStatus ?? null,
      sendBack: Boolean(body.sendBack),
      sendBackNote: body.sendBackNote ?? null,
      taskPayload: body.taskPayload,
    })
  );

  if ("error" in result) {
    return NextResponse.json(
      { data: null, error: result.error },
      { status: result.status ?? 400 }
    );
  }

  return NextResponse.json({ data: { ok: true }, error: null });
}
