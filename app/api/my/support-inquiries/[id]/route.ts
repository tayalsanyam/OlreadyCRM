import { NextResponse } from "next/server";
import { sql, withTransaction } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { completeSupportInquiry } from "@/lib/support-inquiry-workflow";
import { SUPPORT_SEGMENT_LABELS } from "@/lib/support-chat-intake";
import type { SupportVisitorSegment } from "@/lib/support-chat-intake";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const [inquiry] = await sql<
    {
      id: string;
      displayId: string;
      sessionId: string | null;
      visitorKind: string;
      segment: string;
      name: string;
      phone: string;
      email: string | null;
      city: string | null;
      message: string | null;
      source: string;
      status: string;
      assignedTo: string | null;
      dueAt: string | null;
      completionNotes: string | null;
      completionOutcome: string | null;
      completedAt: string | null;
      createdAt: string;
    }[]
  >`
    SELECT
      i.id,
      i.display_id AS "displayId",
      i.session_id AS "sessionId",
      i.visitor_kind AS "visitorKind",
      i.segment,
      i.name,
      i.phone,
      i.email,
      i.city,
      i.message,
      i.source,
      i.status::text AS status,
      i.assigned_to AS "assignedTo",
      i.due_at AS "dueAt",
      i.completion_notes AS "completionNotes",
      i.completion_outcome AS "completionOutcome",
      i.completed_at AS "completedAt",
      i.created_at AS "createdAt"
    FROM support.support_inquiries i
    WHERE i.id = ${id}::uuid AND i.assigned_to = ${auth.session.userId}::uuid
  `;

  if (!inquiry) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  let messages: { role: string; content: string; createdAt: string; replySource: string | null }[] = [];
  if (inquiry.sessionId) {
    messages = await sql`
      SELECT role, content, created_at AS "createdAt", reply_source AS "replySource"
      FROM support.public_chat_messages
      WHERE session_id = ${inquiry.sessionId}::uuid
      ORDER BY created_at ASC
    `;
  }

  return NextResponse.json({
    data: {
      ...inquiry,
      segmentLabel:
        SUPPORT_SEGMENT_LABELS[inquiry.segment as SupportVisitorSegment] ?? inquiry.segment,
      messages,
    },
    error: null,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    summary?: string;
    outcome?: string;
    nextFollowUpAt?: string;
  };

  if (!body.summary?.trim()) {
    return NextResponse.json({ data: null, error: "Summary is required" }, { status: 400 });
  }

  const result = await withTransaction(async (tx) => {
    const [row] = await tx<{ status: string }[]>`
      SELECT status::text AS status
      FROM support.support_inquiries
      WHERE id = ${id}::uuid AND assigned_to = ${auth.session.userId}::uuid
    `;
    if (!row) return { error: "Not found", status: 404 };
    if (row.status === "done") return { error: "Already completed", status: 400 };

    const completed = await completeSupportInquiry(tx, {
      inquiryId: id,
      completedBy: auth.session.userId,
      summary: body.summary!,
      outcome: body.outcome,
      nextFollowUpAt: body.nextFollowUpAt,
      followUpAssignedTo: auth.session.userId,
    });
    if (!completed) return { error: "Not found", status: 404 };
    return { data: completed };
  });

  if ("error" in result && result.error) {
    return NextResponse.json(
      { data: null, error: result.error },
      { status: result.status ?? 400 },
    );
  }

  return NextResponse.json({ data: result.data, error: null });
}
