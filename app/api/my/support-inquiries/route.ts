import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { SUPPORT_SEGMENT_LABELS } from "@/lib/support-chat-intake";
import type { SupportVisitorSegment } from "@/lib/support-chat-intake";

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const rows = await sql<
    {
      id: string;
      displayId: string;
      visitorKind: string;
      segment: string;
      name: string;
      phone: string;
      source: string;
      status: string;
      dueAt: string | null;
      createdAt: string;
    }[]
  >`
    SELECT
      i.id,
      i.display_id AS "displayId",
      i.visitor_kind AS "visitorKind",
      i.segment,
      i.name,
      i.phone,
      i.source,
      i.status::text AS status,
      i.due_at AS "dueAt",
      i.created_at AS "createdAt"
    FROM support.support_inquiries i
    WHERE i.assigned_to = ${auth.session.userId}::uuid
      AND i.status IN ('pending', 'in_progress')
    ORDER BY
      CASE WHEN i.due_at IS NOT NULL AND i.due_at < NOW() THEN 0 ELSE 1 END,
      i.due_at NULLS LAST,
      i.created_at DESC
  `;

  const data = rows.map((row) => ({
    ...row,
    segmentLabel:
      SUPPORT_SEGMENT_LABELS[row.segment as SupportVisitorSegment] ?? row.segment,
  }));

  return NextResponse.json({ data, error: null });
}
