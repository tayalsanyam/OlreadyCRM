import { NextResponse } from "next/server";
import {
  sql,
  withTransaction,
  insertAuditLog,
  appendComm,
} from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { canAccessLead, getLeadForAccess } from "@/lib/lead-access";
import { checkPushCaps } from "@/lib/cap-engine";
import { COMM } from "@/lib/comm-types";
import { normalizeMuaPush } from "@/lib/db-mappers";
import {
  completeShareProfilesIfReady,
  reconcileInitialContactTasksForLead,
} from "@/lib/lead-intake-tasks";
import {
  BRIDE_CONFIRMATION_PUSH_BLOCK_MESSAGE,
  canPushMuaToLead,
  type LeadConfirmationStatus,
} from "@/lib/lead-intake-config";
import type { MuaPushWithDetails, UrgencyBand } from "@/lib/types";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { sendMuaPushNotificationEmail } from "@/lib/rm-mua-push-email";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }
  const { id } = await params;

  if (USE_MOCK) {
    return NextResponse.json({ data: mockStore.getPushes(id), error: null });
  }

  const accessRow = await getLeadForAccess(id);
  if (!accessRow) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }
  if (!canAccessLead(auth.session, accessRow)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const pushes = await sql<MuaPushWithDetails[]>`
    SELECT
      mp.*,
      m.name AS mua_name,
      m.phone AS mua_phone,
      m.whatsapp AS mua_whatsapp,
      m.city AS mua_city,
      m.plan_tier,
      EXTRACT(DAY FROM NOW() - mp.created_at)::int AS days_since_push,
      COALESCE(
        (SELECT array_agg(le.ceremony_type)
         FROM lead_events le WHERE le.id = ANY(mp.event_ids)),
        '{}'
      ) AS event_labels
    FROM mua_pushes mp
    JOIN muas m ON m.id = mp.mua_id
    WHERE mp.lead_id = ${id}::uuid
    ORDER BY mp.created_at DESC
  `;
  return NextResponse.json({
    data: pushes.map((p) => normalizeMuaPush(p)),
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
  const { id } = await params;
  const body = (await request.json()) as {
    muaId: string;
    eventIds: string[];
    prices: Record<string, number>;
    bypassReason?: string;
    urgencyBand: UrgencyBand;
  };

  if (!body.muaId || !body.eventIds?.length) {
    return NextResponse.json({ data: null, error: "muaId and eventIds required" }, { status: 400 });
  }

  const { session } = auth;
  const commissionPush = session.role === "commissionRm";

  if (USE_MOCK) {
    const leadPack = mockStore.getLead(id);
    if (!leadPack || !canPushMuaToLead(leadPack.lead)) {
      return NextResponse.json(
        { data: null, error: BRIDE_CONFIRMATION_PUSH_BLOCK_MESSAGE },
        { status: 400 },
      );
    }
    const cap = mockStore.checkCap(body.muaId, id, body.urgencyBand, commissionPush);
    if (!cap.allowed) {
      return NextResponse.json({ data: null, error: cap.reason }, { status: 400 });
    }
    if (cap.requiresBypass && !body.bypassReason) {
      return NextResponse.json(
        { data: null, error: "Bypass reason required for Critical lead at cap" },
        { status: 400 }
      );
    }
    try {
      const push = mockStore.createPush({
        leadId: id,
        muaId: body.muaId,
        eventIds: body.eventIds,
        prices: body.prices,
        bypassReason: body.bypassReason,
        actorId: session.userId,
        actorName: session.name,
      });
      return NextResponse.json({ data: { id: push.id }, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Push failed";
      return NextResponse.json({ data: null, error: message }, { status: 409 });
    }
  }

  const accessRow = await getLeadForAccess(id);
  if (!accessRow || !canAccessLead(session, accessRow)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const [leadConfirm] = await sql<
    {
      confirmationStatus: LeadConfirmationStatus;
      requirementsConfirmedAt: string | null;
    }[]
  >`
    SELECT
      confirmation_status::text AS "confirmationStatus",
      requirements_confirmed_at AS "requirementsConfirmedAt"
    FROM bride_leads
    WHERE id = ${id}::uuid
  `;
  if (!leadConfirm || !canPushMuaToLead(leadConfirm)) {
    return NextResponse.json(
      { data: null, error: BRIDE_CONFIRMATION_PUSH_BLOCK_MESSAGE },
      { status: 400 },
    );
  }

  const cap = await checkPushCaps(body.muaId, id, body.urgencyBand, {
    commissionPush,
  });
  if (!cap.allowed) {
    return NextResponse.json({ data: null, error: cap.reason }, { status: 400 });
  }

  const [muaGate] = await sql<{ adminPlanTag: string | null }[]>`
    SELECT admin_plan_tag AS "adminPlanTag" FROM muas WHERE id = ${body.muaId}::uuid
  `;
  if (muaGate?.adminPlanTag === "hold") {
    return NextResponse.json(
      { data: null, error: "This MUA is on admin hold — pushes are blocked" },
      { status: 400 },
    );
  }

  if (cap.requiresBypass && !body.bypassReason) {
    return NextResponse.json(
      { data: null, error: "Bypass reason required for Critical lead at cap" },
      { status: 400 }
    );
  }

  const [existingPush] = await sql<{ id: string; status: string }[]>`
    SELECT id, status::text AS status
    FROM mua_pushes
    WHERE lead_id = ${id}::uuid
      AND mua_id = ${body.muaId}::uuid
      AND status IN ('active', 'awaiting_close', 'booked')
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (existingPush) {
    return NextResponse.json(
      {
        data: null,
        error:
          "This MUA is already on this lead — see their push on the lead profile.",
      },
      { status: 409 }
    );
  }

  const total = Object.values(body.prices).reduce((a, b) => a + b, 0);

  const pushId = await withTransaction(async (tx) => {
    const [push] = await tx<{ id: string }[]>`
      INSERT INTO mua_pushes (
        lead_id, mua_id, event_ids, quoted_total, bypass_reason, pushed_by
      ) VALUES (
        ${id}::uuid,
        ${body.muaId}::uuid,
        ${sql.array(body.eventIds)}::uuid[],
        ${total},
        ${body.bypassReason ?? null},
        ${session.userId}::uuid
      )
      RETURNING id
    `;
    for (const eventId of body.eventIds) {
      await tx`
        INSERT INTO mua_push_event_prices (push_id, event_id, quoted_price)
        VALUES (${push.id}::uuid, ${eventId}::uuid, ${body.prices[eventId] ?? 0})
      `;
    }
    const [mua] = await tx<{ name: string }[]>`
      SELECT name FROM muas WHERE id = ${body.muaId}::uuid
    `;
    const [lead] = await tx<{
      brideName: string;
      assignedRmId: string | null;
      displayId: string;
    }[]>`
      SELECT
        bride_name AS "brideName",
        assigned_rm_id AS "assignedRmId",
        display_id AS "displayId"
      FROM bride_leads WHERE id = ${id}::uuid
    `;
    await appendComm(tx, {
      leadId: id,
      muaId: body.muaId,
      entryType: body.bypassReason ? COMM.capBypass : COMM.muaPushed,
      description: body.bypassReason
        ? `Cap bypass for ${mua?.name}: ${body.bypassReason}`
        : `Pushed ${mua?.name} — Rs. ${total.toLocaleString("en-IN")}`,
      actorId: session.userId,
      metadata: { muaId: body.muaId, eventIds: body.eventIds },
    });

    const taskOwnerId =
      session.role === "commissionRm" ? session.userId : lead?.assignedRmId;
    if (taskOwnerId && lead) {
      await completeShareProfilesIfReady(tx, {
        leadId: id,
        staffId: taskOwnerId,
        actorId: session.userId,
        brideName: lead.brideName,
        displayId: lead.displayId,
      });
      await reconcileInitialContactTasksForLead(tx, {
        leadId: id,
        staffId: taskOwnerId,
        actorId: session.userId,
      });
    }

    await insertAuditLog(tx, {
      tableName: "mua_pushes",
      recordId: push.id,
      action: "create",
      actorId: session.userId,
    });
    return push.id;
  });

  const emailNotification = await sendMuaPushNotificationEmail({
    leadId: id,
    muaId: body.muaId,
    eventIds: body.eventIds,
    actorId: session.userId,
  });

  return NextResponse.json({
    data: { id: pushId, emailNotification },
    error: null,
  });
}
