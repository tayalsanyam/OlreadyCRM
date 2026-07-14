import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { canAccessLead, getLeadForAccess } from "@/lib/lead-access";
import {
  assertFeedbackLeadAccess,
  closeFeedbackNoContact,
  countUnreachableFeedbackAttempts,
  scheduleFeedbackCallback,
  submitLeadFeedback,
  type FeedbackSubmitBody,
} from "@/lib/feedback-submit";
import type { FeedbackConnectionStatus } from "@/lib/types";
import type { FeedbackUnreachableAttemptKind } from "@/lib/feedback-constants";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const accessRow = await getLeadForAccess(id);
  if (!accessRow || !canAccessLead(auth.session, accessRow)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const rows = await sql`
    SELECT * FROM lead_feedback WHERE lead_id = ${id}::uuid ORDER BY created_at DESC LIMIT 1
  `;
  const unreachableAttempts = await countUnreachableFeedbackAttempts(id);
  return NextResponse.json({
    data: rows[0] ?? null,
    unreachableAttempts,
    error: null,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: leadId } = await params;
  const accessRow = await getLeadForAccess(leadId);
  if (!accessRow || !canAccessLead(auth.session, accessRow)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as FeedbackSubmitBody & {
    connectionStatus?: FeedbackConnectionStatus;
    muaType?: FeedbackSubmitBody["muaType"];
    nonOlreadyMuaName?: string | null;
    valuableOptions?: boolean | null;
    referencesNote?: string | null;
    improvementsNote?: string | null;
  };

  const busyOnly = (body as { busyCallbackOnly?: boolean }).busyCallbackOnly;
  const closeNoContactOnly = (body as { closeNoContactOnly?: boolean })
    .closeNoContactOnly;

  if (closeNoContactOnly) {
    try {
      await assertFeedbackLeadAccess(
        leadId,
        auth.session.userId,
        auth.session.role
      );
      const feedbackId = await closeFeedbackNoContact(
        leadId,
        auth.session.userId,
        body.followUpNote ?? body.improvementsNote
      );
      return NextResponse.json({ data: { feedbackId }, error: null });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not close as no contact";
      return NextResponse.json({ data: null, error: message }, { status: 400 });
    }
  }

  if (busyOnly) {
    const followUpAt = body.followUpAt;
    if (!followUpAt) {
      return NextResponse.json(
        { data: null, error: "followUpAt required" },
        { status: 400 }
      );
    }
    const attemptKind =
      (body as { attemptKind?: FeedbackUnreachableAttemptKind }).attemptKind ??
      "busy";
    try {
      await assertFeedbackLeadAccess(
        leadId,
        auth.session.userId,
        auth.session.role
      );
      const taskId = await scheduleFeedbackCallback(
        leadId,
        auth.session.userId,
        followUpAt,
        body.followUpNote,
        attemptKind
      );
      const unreachableAttempts = await countUnreachableFeedbackAttempts(leadId);
      return NextResponse.json({
        data: { followUpTaskId: taskId, unreachableAttempts },
        error: null,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not schedule call-back";
      return NextResponse.json({ data: null, error: message }, { status: 400 });
    }
  }

  if (!body.connectionStatus) {
    return NextResponse.json(
      { data: null, error: "connectionStatus required" },
      { status: 400 }
    );
  }

  try {
    await assertFeedbackLeadAccess(
      leadId,
      auth.session.userId,
      auth.session.role
    );
    const { feedbackId, followUpTaskId, referralFollowUpTaskId, careTicketId } =
      await submitLeadFeedback(
      leadId,
      auth.session.userId,
      body
    );
    return NextResponse.json({
      data: { feedbackId, followUpTaskId, referralFollowUpTaskId, careTicketId, prospectTaskId: null },
      error: null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not save feedback";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
