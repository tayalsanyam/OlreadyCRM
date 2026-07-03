import { NextResponse } from "next/server";
import {
  sql,
  withTransaction,
  insertAuditLog,
  appendComm,
  generateTaskDisplayId,
} from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import type {
  Booking,
  CommEntry,
  LeadEvent,
  LeadFull,
  MuaPushEventPrice,
} from "@/lib/types";
import { scheduleCommissionHandoverTasks } from "@/lib/commission-handover";
import { requireActiveCommissionRm } from "@/lib/commission-rm-staff";
import { scheduleUploaderReviewTask } from "@/lib/uploader-review-task";
import { refreshLeadPhase } from "@/lib/lead-phase";
import { canAccessLead, getLeadForAccess } from "@/lib/lead-access";
import { cancelPendingTasksForLeads } from "@/lib/task-duplicates";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { COMM } from "@/lib/comm-types";
import { fromDbStatus, normalizeCommEntry, normalizeLeadFull } from "@/lib/db-mappers";
import {
  COMMISSION_NI_ARCHIVE_HANDOVER,
  LEAD_EXIT_LABELS,
  RM_NI_ARCHIVE_HANDOVER,
  toDbExitMarkedByRole,
} from "@/lib/lead-exit";
import { createNotification } from "@/lib/notifications";
import { getLastLeadContact } from "@/lib/lead-last-contact";
import { reconcileLeadLifecycle } from "@/lib/lead-lifecycle";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const { session } = auth;

  if (USE_MOCK) {
    const data = mockStore.getLead(id);
    if (!data) {
      return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data, error: null });
  }

  const accessRow = await getLeadForAccess(id);
  if (!accessRow) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }
  if (!canAccessLead(session, accessRow)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  await withTransaction(async (tx) => {
    await reconcileLeadLifecycle(tx, id);
  });

  const [lead] = await sql<LeadFull[]>`
    SELECT * FROM leads_full WHERE id = ${id}::uuid
  `;
  if (!lead) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  const events = await sql<LeadEvent[]>`
    SELECT * FROM lead_events WHERE lead_id = ${id}::uuid ORDER BY event_date NULLS LAST
  `;
  const comms = await sql<CommEntry[]>`
    SELECT c.*, s.name AS actor_name, s.role AS actor_role
    FROM comms c
    LEFT JOIN staff s ON s.id = c.actor_id
    WHERE c.lead_id = ${id}::uuid
    ORDER BY c.created_at ASC
  `;

  const bookings = await sql<Booking[]>`
    SELECT * FROM bookings WHERE lead_id = ${id}::uuid ORDER BY created_at DESC
  `;

  const pushEventPrices = await sql<MuaPushEventPrice[]>`
    SELECT pep.*
    FROM mua_push_event_prices pep
    INNER JOIN mua_pushes mp ON mp.id = pep.push_id
    WHERE mp.lead_id = ${id}::uuid
  `;

  const lastLeadContact = await withTransaction((tx) => getLastLeadContact(tx, id));

  return NextResponse.json({
    data: {
      lead: normalizeLeadFull(lead),
      events,
      comms: comms.map((c) => normalizeCommEntry(c)),
      bookings,
      pushEventPrices,
      lastLeadContact,
    },
    error: null,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    action?: "not_interested" | "archive_not_interested" | "hostile";
    note?: string;
    commissionRmId?: string;
    group?: { groupSize?: number; groupNotes?: string };
  };

  const { session } = auth;

  if (body.group && !body.action) {
    if (USE_MOCK) {
      mockStore.updateGroup(id, body.group);
      return NextResponse.json({ data: { ok: true }, error: null });
    }
    const lead = await getLeadForAccess(id);
    if (!lead || !canAccessLead(session, lead)) {
      return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
    }
    await sql`
      UPDATE bride_leads SET
        group_size = COALESCE(${body.group.groupSize ?? null}, group_size),
        group_notes = COALESCE(${body.group.groupNotes ?? null}, group_notes),
        updated_at = NOW()
      WHERE id = ${id}::uuid
    `;
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  if (!body.action) {
    return NextResponse.json({ data: null, error: "action or group required" }, { status: 400 });
  }

  const accessRow = await getLeadForAccess(id);
  if (!accessRow) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }
  if (!canAccessLead(session, accessRow)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  if (body.action === "hostile" && (!body.note || body.note.trim().length < 10)) {
    return NextResponse.json(
      {
        data: null,
        error: `A note of at least 10 characters is required (${LEAD_EXIT_LABELS.notAnswering})`,
      },
      { status: 400 }
    );
  }

  const normalizedStatus = fromDbStatus(accessRow.status);

  if (body.action === "not_interested") {
    if (session.role !== "regionalRm" && session.role !== "commissionRm") {
      return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
    }
    if (session.role === "regionalRm") {
      if (normalizedStatus === "commissionRm" || normalizedStatus === "archived") {
        return NextResponse.json(
          { data: null, error: "Lead cannot be shifted again" },
          { status: 400 }
        );
      }
    } else if (normalizedStatus !== "commissionRm") {
      return NextResponse.json(
        { data: null, error: "Only leads in the Commission queue can be closed as not interested" },
        { status: 400 }
      );
    }
  }

  if (body.action === "archive_not_interested") {
    if (session.role !== "regionalRm" && session.role !== "commissionRm") {
      return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
    }
    if (normalizedStatus === "archived") {
      return NextResponse.json(
        { data: null, error: "Lead is already archived" },
        { status: 400 }
      );
    }
    if (session.role === "regionalRm") {
      if (normalizedStatus === "commissionRm") {
        return NextResponse.json(
          { data: null, error: "Lead is with Commission RM — use Commission queue to archive" },
          { status: 400 }
        );
      }
      if (normalizedStatus === "booked") {
        return NextResponse.json(
          { data: null, error: "Cancel the booking before archiving this lead" },
          { status: 400 }
        );
      }
    } else if (normalizedStatus !== "commissionRm") {
      return NextResponse.json(
        { data: null, error: "Only leads in the Commission queue can be closed as not interested" },
        { status: 400 }
      );
    }
  }

  if (body.action === "hostile") {
    if (session.role !== "regionalRm" && session.role !== "commissionRm") {
      return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
    }
    if (normalizedStatus === "archived") {
      return NextResponse.json(
        { data: null, error: "Lead is already archived" },
        { status: 400 }
      );
    }
  }

  if (body.action === "not_interested" && session.role === "regionalRm") {
    if (!body.commissionRmId?.trim()) {
      return NextResponse.json(
        { data: null, error: "Select a Commission RM to shift this lead to" },
        { status: 400 }
      );
    }
  }

  if (USE_MOCK) {
    mockStore.exitLead(
      id,
      body.action,
      session.userId,
      session.name,
      body.note,
      session.role === "commissionRm" ? "commissionRm" : "regionalRm",
      body.commissionRmId
    );
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  await withTransaction(async (tx) => {
    if (body.action === "not_interested" || body.action === "archive_not_interested") {
      const archiveDirect =
        body.action === "archive_not_interested" || session.role === "commissionRm";
      if (archiveDirect) {
        await cancelPendingTasksForLeads(tx, [id]);
        const handoverDefault =
          session.role === "commissionRm"
            ? COMMISSION_NI_ARCHIVE_HANDOVER
            : RM_NI_ARCHIVE_HANDOVER;
        const commSuffix =
          session.role === "commissionRm" ? "(Commission)" : "(RM)";
        const [archived] = await tx<{ displayId: string; brideName: string; handoverReason: string | null }[]>`
          SELECT display_id AS "displayId", bride_name AS "brideName", handover_reason AS "handoverReason"
          FROM bride_leads WHERE id = ${id}::uuid
        `;
        const priorReason = archived?.handoverReason?.trim() ?? "";
        await tx`
          UPDATE bride_leads SET
            status = 'archived',
            handover_reason = ${handoverDefault},
            exit_marked_by_role = ${toDbExitMarkedByRole(session.role)},
            uploader_confirmation = NULL,
            uploader_confirmed_at = NULL,
            uploader_confirmed_by = NULL,
            updated_at = NOW()
          WHERE id = ${id}::uuid
        `;
        await appendComm(tx, {
          leadId: id,
          entryType: COMM.note,
          description: `${LEAD_EXIT_LABELS.notInterested} — archived by ${session.name} ${commSuffix}`,
          actorId: session.userId,
        });
        if (priorReason && priorReason !== handoverDefault) {
          await appendComm(tx, {
            leadId: id,
            entryType: COMM.note,
            description: `Prior handover note: ${priorReason}`,
            actorId: session.userId,
          });
        }
        if (archived) {
          await scheduleUploaderReviewTask(tx, {
            leadId: id,
            displayId: archived.displayId,
            brideName: archived.brideName,
            reason: "archived_confirm",
            assignedBy: session.userId,
          });
        }
      } else {
        const commissionRm = await requireActiveCommissionRm(
          tx,
          body.commissionRmId!.trim()
        );
        const [prior] = await tx<{ assignedRmId: string | null }[]>`
          SELECT assigned_rm_id AS "assignedRmId"
          FROM bride_leads WHERE id = ${id}::uuid
        `;
        const [shifted] = await tx<{ displayId: string; shiftedAt: string }[]>`
          UPDATE bride_leads SET
            status = 'commission_rm',
            assigned_rm_id = ${commissionRm.id}::uuid,
            assignment_date = NULL,
            handover_reason = 'Not Interested in Plan MUAs',
            exit_marked_by_role = ${toDbExitMarkedByRole(session.role)},
            shifted_at = NOW(),
            updated_at = NOW()
          WHERE id = ${id}::uuid
          RETURNING display_id AS "displayId", shifted_at AS "shiftedAt"
        `;
        await appendComm(tx, {
          leadId: id,
          entryType: COMM.shiftedCommission,
          description: `Not Interested in Plan MUAs — shifted to ${commissionRm.name} by ${session.name}`,
          actorId: session.userId,
        });
        if (shifted?.displayId) {
          await scheduleCommissionHandoverTasks(tx, {
            leadId: id,
            displayId: shifted.displayId,
            handoverReason: "Not Interested in Plan MUAs",
            commissionRmId: commissionRm.id,
            actorId: session.userId,
            previousStaffId: prior?.assignedRmId ?? session.userId,
            intakeMode: "regional_shift",
          });
        }
      }
    } else if (body.action === "hostile") {
      await cancelPendingTasksForLeads(tx, [id]);
      const [archived] = await tx<{ displayId: string; brideName: string }[]>`
        UPDATE bride_leads SET
          status = 'archived',
          hostile_note = ${body.note ?? ""},
          exit_marked_by_role = ${toDbExitMarkedByRole(session.role)},
          uploader_confirmation = NULL,
          uploader_confirmed_at = NULL,
          uploader_confirmed_by = NULL,
          updated_at = NOW()
        WHERE id = ${id}::uuid
        RETURNING display_id AS "displayId", bride_name AS "brideName"
      `;
      await appendComm(tx, {
        leadId: id,
        entryType: COMM.hostileFlagged,
        description: `${LEAD_EXIT_LABELS.notAnswering} — flagged by ${session.name}${body.note ? `: ${body.note}` : ""}`,
        actorId: session.userId,
      });
      if (archived) {
        await scheduleUploaderReviewTask(tx, {
          leadId: id,
          displayId: archived.displayId,
          brideName: archived.brideName,
          reason: "not_answering",
          assignedBy: session.userId,
        });
      }
      const admins = await tx<{ id: string }[]>`
        SELECT id FROM staff
        WHERE role IN ('admin'::user_role, 'owner'::user_role) AND active = true
      `;
      for (const admin of admins) {
        const taskId = await generateTaskDisplayId(tx);
        await createNotification(tx, {
          userId: admin.id,
          message: `${LEAD_EXIT_LABELS.notAnswering} — uploader review required`,
          link: `/rm/leads/${id}`,
        });
        await tx`
          INSERT INTO rm_tasks (display_id, staff_id, lead_id, task_type, title, due_date)
          VALUES (
            ${taskId},
            ${admin.id}::uuid,
            ${id}::uuid,
            'admin_review',
            ${`${LEAD_EXIT_LABELS.notAnswering} review — ${id}`},
            CURRENT_DATE + 1
          )
        `;
      }
    }
    await insertAuditLog(tx, {
      tableName: "bride_leads",
      recordId: id,
      action: body.action ?? "update",
      actorId: session.userId,
      changes: body,
    });
    await refreshLeadPhase(tx, id);
  });

  return NextResponse.json({ data: { ok: true }, error: null });
}
