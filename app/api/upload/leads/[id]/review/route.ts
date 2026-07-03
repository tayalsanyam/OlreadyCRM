import { NextResponse } from "next/server";
import {
  withTransaction,
  appendComm,
  insertAuditLog,
} from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { COMM } from "@/lib/comm-types";
import { LEAD_EXIT_LABELS, toDbExitMarkedByRole } from "@/lib/lead-exit";
import { completeUploaderReviewTasksForLead } from "@/lib/uploader-review-task";
import { refreshLeadPhase } from "@/lib/lead-phase";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";

type ReviewAction = "close_lead" | "move_to_not_interested" | "move_to_archived" | "confirm_ni";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(["leadUploader", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    action?: ReviewAction | "flag_rm_error";
    note?: string | null;
  };

  let action = body.action;
  if (action === "flag_rm_error") {
    return NextResponse.json(
      {
        data: null,
        error: "Use re-verify to reopen a lead — RM / Commission error is recorded automatically",
      },
      { status: 400 }
    );
  }

  if (
    action === "move_to_not_interested" ||
    action === "move_to_archived" ||
    action === "confirm_ni"
  ) {
    action = "close_lead";
  }

  if (action !== "close_lead") {
    return NextResponse.json({ data: null, error: "Invalid action" }, { status: 400 });
  }

  const note = body.note?.trim() || null;
  if (!note || note.length < 5) {
    return NextResponse.json(
      { data: null, error: "A closing note of at least 5 characters is required" },
      { status: 400 }
    );
  }

  const exitRole = toDbExitMarkedByRole(auth.session.role);
  const defaultHandover =
    auth.session.role === "leadUploader" ? "Closed by lead uploader" : "Closed by admin";

  if (USE_MOCK) {
    const ok = mockStore.reviewUploadLead(id, "close_lead", note, auth.session.userId);
    if (!ok) {
      return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  await withTransaction(async (tx) => {
    await tx`
      UPDATE bride_leads SET
        status = 'archived',
        hostile_note = NULL,
        handover_reason = COALESCE(
          NULLIF(TRIM(handover_reason), ''),
          ${defaultHandover}
        ),
        uploader_confirmed_at = NOW(),
        uploader_confirmed_by = ${auth.session.userId}::uuid,
        uploader_confirmation = 'confirmed_ni',
        exit_marked_by_role = COALESCE(
          exit_marked_by_role,
          ${exitRole}
        ),
        updated_at = NOW()
      WHERE id = ${id}::uuid
    `;
    await appendComm(tx, {
      leadId: id,
      entryType: COMM.note,
      description: `${LEAD_EXIT_LABELS.closeLead}: ${note}`,
      actorId: auth.session.userId,
    });

    await insertAuditLog(tx, {
      tableName: "bride_leads",
      recordId: id,
      action: "uploader_review",
      actorId: auth.session.userId,
      changes: { action: "close_lead", note, confirmation: "confirmed_ni" },
    });

    await completeUploaderReviewTasksForLead(tx, id, auth.session.userId);
    await refreshLeadPhase(tx, id);
  });

  return NextResponse.json({ data: { ok: true }, error: null });
}
