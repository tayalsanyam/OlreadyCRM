import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { SUPPORT_SEGMENT_LABELS } from "@/lib/support-chat-intake";
import type { SupportVisitorSegment } from "@/lib/support-chat-intake";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner", "careAgent"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const scope = new URL(request.url).searchParams.get("scope") ?? "all";
  const pendingOnly = scope === "pending";

  const inquiries = await sql<
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
      assigneeName: string | null;
      dueAt: string | null;
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
      s.name AS "assigneeName",
      i.due_at AS "dueAt",
      i.completion_notes AS "completionNotes",
      i.completed_at AS "completedAt",
      cb.name AS "completedByName",
      i.created_at AS "createdAt"
    FROM support.support_inquiries i
    LEFT JOIN staff s ON s.id = i.assigned_to
    LEFT JOIN staff cb ON cb.id = i.completed_by
    WHERE (${pendingOnly} = false OR i.status IN ('pending', 'in_progress'))
    ORDER BY
      CASE WHEN i.status IN ('pending', 'in_progress') THEN 0 ELSE 1 END,
      i.created_at DESC
    LIMIT 200
  `;

  const sessions = await sql<
    {
      id: string;
      name: string;
      phone: string;
      visitorKind: string;
      segment: string;
      inquiryId: string | null;
      inquiryDisplayId: string | null;
      messageCount: number;
      lastMessageAt: string | null;
      createdAt: string;
    }[]
  >`
    SELECT
      pcs.id,
      pcs.name,
      pcs.phone,
      pcs.visitor_kind AS "visitorKind",
      pcs.segment,
      pcs.inquiry_id AS "inquiryId",
      si.display_id AS "inquiryDisplayId",
      (
        SELECT COUNT(*)::int FROM support.public_chat_messages m
        WHERE m.session_id = pcs.id
      ) AS "messageCount",
      pcs.last_message_at AS "lastMessageAt",
      pcs.created_at AS "createdAt"
    FROM support.public_chat_sessions pcs
    LEFT JOIN support.support_inquiries si ON si.id = pcs.inquiry_id
    ORDER BY pcs.created_at DESC
    LIMIT 200
  `;

  const enrichedSessions = sessions.map((row) => ({
    ...row,
    segmentLabel:
      SUPPORT_SEGMENT_LABELS[row.segment as SupportVisitorSegment] ?? row.segment,
  }));

  return NextResponse.json({
    data: { inquiries, sessions: enrichedSessions },
    error: null,
  });
}
