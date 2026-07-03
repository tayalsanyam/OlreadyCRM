import { NextResponse } from "next/server";
import { sql, withTransaction } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { isAdminRole } from "@/lib/ticket-admin-watch";
import {
  assignSupportInquiry,
  completeSupportInquiry,
  createSupportInquiryFollowUp,
} from "@/lib/support-inquiry-workflow";
import { SUPPORT_SEGMENT_LABELS } from "@/lib/support-chat-intake";
import type { SupportVisitorSegment } from "@/lib/support-chat-intake";

async function loadDetail(id: string) {
  const [inquiry] = await sql<
    {
      id: string;
      displayId: string;
      sessionId: string | null;
      parentInquiryId: string | null;
      parentDisplayId: string | null;
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
      assigneeName: string | null;
      assignedByName: string | null;
      dueAt: string | null;
      completionNotes: string | null;
      completionOutcome: string | null;
      completedAt: string | null;
      completedByName: string | null;
      createdAt: string;
    }[]
  >`
    SELECT
      i.id,
      i.display_id AS "displayId",
      i.session_id AS "sessionId",
      i.parent_inquiry_id AS "parentInquiryId",
      p.display_id AS "parentDisplayId",
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
      s.name AS "assigneeName",
      ab.name AS "assignedByName",
      i.due_at AS "dueAt",
      i.completion_notes AS "completionNotes",
      i.completion_outcome AS "completionOutcome",
      i.completed_at AS "completedAt",
      cb.name AS "completedByName",
      i.created_at AS "createdAt"
    FROM support.support_inquiries i
    LEFT JOIN support.support_inquiries p ON p.id = i.parent_inquiry_id
    LEFT JOIN staff s ON s.id = i.assigned_to
    LEFT JOIN staff ab ON ab.id = i.assigned_by
    LEFT JOIN staff cb ON cb.id = i.completed_by
    WHERE i.id = ${id}::uuid
  `;

  if (!inquiry) return null;

  let messages: { role: string; content: string; createdAt: string; replySource: string | null }[] = [];
  if (inquiry.sessionId) {
    messages = await sql`
      SELECT role, content, created_at AS "createdAt", reply_source AS "replySource"
      FROM support.public_chat_messages
      WHERE session_id = ${inquiry.sessionId}::uuid
      ORDER BY created_at ASC
    `;
  }

  const followUps = await sql<
    {
      id: string;
      displayId: string;
      status: string;
      assigneeName: string | null;
      dueAt: string | null;
      createdAt: string;
    }[]
  >`
    SELECT
      f.id,
      f.display_id AS "displayId",
      f.status::text AS status,
      s.name AS "assigneeName",
      f.due_at AS "dueAt",
      f.created_at AS "createdAt"
    FROM support.support_inquiries f
    LEFT JOIN staff s ON s.id = f.assigned_to
    WHERE f.parent_inquiry_id = ${id}::uuid
    ORDER BY f.created_at ASC
  `;

  return {
    ...inquiry,
    segmentLabel:
      SUPPORT_SEGMENT_LABELS[inquiry.segment as SupportVisitorSegment] ?? inquiry.segment,
    messages,
    followUps,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const detail = await loadDetail(id);
  if (!detail) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  const isAssignee = detail.assignedTo === auth.session.userId;
  const isOperator =
    isAdminRole(auth.session.role) ||
    auth.session.role === "careAgent" ||
    isAssignee;

  if (!isOperator) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ data: detail, error: null });
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
    action?: "assign" | "complete" | "followUp" | "close";
    assignedTo?: string | null;
    dueAt?: string | null;
    summary?: string;
    outcome?: string;
    nextFollowUpAt?: string;
    followUpAssignedTo?: string | null;
    followUpDueAt?: string;
    followUpMessage?: string;
    status?: "cancelled";
  };

  const isAdmin = isAdminRole(auth.session.role);
  const isCare = auth.session.role === "careAgent";

  const [existing] = await sql<
    { assignedTo: string | null; status: string; displayId: string }[]
  >`
    SELECT assigned_to AS "assignedTo", status::text AS status, display_id AS "displayId"
    FROM support.support_inquiries
    WHERE id = ${id}::uuid
  `;

  if (!existing) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  const isAssignee = existing.assignedTo === auth.session.userId;

  try {
    const result = await withTransaction(async (tx) => {
      if (body.action === "assign" || body.assignedTo !== undefined) {
        if (!isAdmin && !isCare) {
          return { error: "Only admin can reassign", status: 403 };
        }
        const assigned = await assignSupportInquiry(tx, {
          inquiryId: id,
          assignedTo: body.assignedTo ?? null,
          dueAt: body.dueAt,
          assignedBy: auth.session.userId,
        });
        if (!assigned) return { error: "Not found", status: 404 };
        return { data: assigned };
      }

      if (body.action === "complete") {
        if (!isAssignee && !isAdmin && !isCare) {
          return { error: "Forbidden", status: 403 };
        }
        if (!body.summary?.trim()) {
          return { error: "Summary is required", status: 400 };
        }
        if (existing.status === "done") {
          return { error: "Already completed", status: 400 };
        }
        const completed = await completeSupportInquiry(tx, {
          inquiryId: id,
          completedBy: auth.session.userId,
          summary: body.summary,
          outcome: body.outcome,
          nextFollowUpAt: body.nextFollowUpAt,
          followUpAssignedTo: body.followUpAssignedTo,
        });
        if (!completed) return { error: "Not found", status: 404 };
        return { data: completed };
      }

      if (body.action === "followUp") {
        if (!isAdmin && !isCare) {
          return { error: "Only admin can create follow-ups", status: 403 };
        }
        const followUp = await createSupportInquiryFollowUp(tx, {
          parentInquiryId: id,
          assignedTo: body.followUpAssignedTo ?? body.assignedTo ?? existing.assignedTo,
          dueAt: body.followUpDueAt ?? body.dueAt,
          message: body.followUpMessage,
          assignedBy: auth.session.userId,
        });
        if (!followUp) return { error: "Not found", status: 404 };
        return { data: followUp };
      }

      if (body.action === "close" || body.status === "cancelled") {
        if (!isAdmin && !isCare) {
          return { error: "Only admin can close", status: 403 };
        }
        await tx`
          UPDATE support.support_inquiries
          SET status = 'cancelled'::support.care_task_status, updated_at = NOW()
          WHERE id = ${id}::uuid
        `;
        return { data: { ok: true } };
      }

      return { error: "Unknown action", status: 400 };
    });

    if ("error" in result && result.error) {
      return NextResponse.json(
        { data: null, error: result.error },
        { status: result.status ?? 400 },
      );
    }

    const detail = await loadDetail(id);
    return NextResponse.json({ data: { ...(result.data ?? {}), detail }, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
