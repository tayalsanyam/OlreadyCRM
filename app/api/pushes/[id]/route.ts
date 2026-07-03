import { NextResponse } from "next/server";
import {
  sql,
  withTransaction,
  insertAuditLog,
  appendComm,
} from "@/db/index";
import { COMM } from "@/lib/comm-types";
import { toDbExitMarkedByRole } from "@/lib/lead-exit";
import { requireSession } from "@/lib/api-auth";
import { toDbPushOutcome, toDbPushStage } from "@/lib/db-mappers";
import { canCommissionRmManagePush } from "@/lib/commission-handover-access";
import { canAccessLead, getLeadForAccess } from "@/lib/lead-access";
import { refreshLeadPhase } from "@/lib/lead-phase";
import { scheduleUploaderReviewTask } from "@/lib/uploader-review-task";
import {
  closePushAndClearTasks,
  scheduleStageFollowUp,
} from "@/lib/stage-tasks";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";

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
    stage?: string;
    note?: string;
    followUpDate?: string | null;
    prices?: Record<string, number>;
    close?: { outcome: string };
  };
  const { session } = auth;

  if (USE_MOCK) {
    if (body.stage) {
      mockStore.updatePushStage(id, body.stage, session.userId, session.name, {
        followUpDate: body.followUpDate ?? undefined,
        staffId: session.userId,
      });
    }
    if (body.prices) {
      mockStore.updatePushQuotes(id, body.prices, session.userId, session.name);
    }
    if (body.close) {
      const dbOutcome = toDbPushOutcome(body.close.outcome);
      if (!dbOutcome) {
        return NextResponse.json(
          { data: null, error: "Invalid close outcome" },
          { status: 400 }
        );
      }
      const outcome =
        dbOutcome === "not_selected"
          ? "notSelected"
          : dbOutcome === "not_interested"
            ? "notInterested"
            : "withdrew";
      mockStore.closePush(id, outcome, session.userId, session.name);
    }
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  const [pushRef] = await sql<{ leadId: string }[]>`
    SELECT lead_id AS "leadId" FROM mua_pushes WHERE id = ${id}::uuid
  `;
  if (!pushRef) {
    return NextResponse.json({ data: null, error: "Push not found" }, { status: 404 });
  }
  const accessRow = await getLeadForAccess(pushRef.leadId);
  if (!accessRow || !canAccessLead(session, accessRow)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  try {
    await withTransaction(async (tx) => {
      const [push] = await tx<{
        leadId: string;
        muaId: string;
        brideName: string;
        assignedRmId: string | null;
        muaName: string;
        status: string;
        createdAt: string;
        stage: string;
      }[]>`
        SELECT
          mp.lead_id AS "leadId",
          mp.mua_id AS "muaId",
          mp.status::text AS status,
          mp.created_at AS "createdAt",
          mp.stage::text AS stage,
          bl.bride_name AS "brideName",
          bl.assigned_rm_id AS "assignedRmId",
          m.name AS "muaName"
        FROM mua_pushes mp
        JOIN bride_leads bl ON bl.id = mp.lead_id
        JOIN muas m ON m.id = mp.mua_id
        WHERE mp.id = ${id}::uuid
      `;
      if (!push) throw new Error("Push not found");

      const mutating =
        body.stage != null ||
        body.close != null ||
        (body.prices != null && Object.keys(body.prices).length > 0);
      if (
        session.role === "commissionRm" &&
        mutating &&
        !canCommissionRmManagePush({
          pushStatus: push.status,
        })
      ) {
        throw new Error("This push cannot be updated in its current state");
      }

      if (body.stage) {
        if (!body.followUpDate?.trim()) {
          throw new Error("Next follow-up date is required when updating stage");
        }
        const dbStage = toDbPushStage(body.stage);
        await tx`
          UPDATE mua_pushes SET stage = ${dbStage}::mua_push_stage, updated_at = NOW()
          WHERE id = ${id}::uuid
        `;
        await appendComm(tx, {
          leadId: push.leadId,
          muaId: push.muaId,
          entryType: COMM.stageUpdated,
          description: body.note?.trim() || `Stage updated to ${body.stage}`,
          actorId: session.userId,
          metadata: { stage: body.stage, pushId: id },
        });

        const taskOwnerId =
          session.role === "commissionRm" ? session.userId : push.assignedRmId;

        if (push.status === "active" && taskOwnerId) {
          const scheduled = await scheduleStageFollowUp(tx, {
            pushId: id,
            leadId: push.leadId,
            muaId: push.muaId,
            muaName: push.muaName,
            brideName: push.brideName,
            staffId: taskOwnerId,
            actorId: session.userId,
            stage: body.stage,
            followUpDate: body.followUpDate,
            titleOverride: body.followUpDate
              ? `Follow up on ${push.muaName} — ${body.stage}`
              : undefined,
          });
          if (!scheduled) {
            console.warn(
              "Stage follow-up task skipped — pending MUA task still exists after cancel"
            );
          }
        }
      }

      if (body.prices && Object.keys(body.prices).length > 0) {
        const total = Object.values(body.prices).reduce((a, b) => a + b, 0);
        for (const [eventId, price] of Object.entries(body.prices)) {
          await tx`
            INSERT INTO mua_push_event_prices (push_id, event_id, quoted_price)
            VALUES (${id}::uuid, ${eventId}::uuid, ${price})
            ON CONFLICT (push_id, event_id)
            DO UPDATE SET quoted_price = EXCLUDED.quoted_price
          `;
        }
        await tx`
          UPDATE mua_pushes SET quoted_total = ${total}, updated_at = NOW()
          WHERE id = ${id}::uuid
        `;
        await appendComm(tx, {
          leadId: push.leadId,
          muaId: push.muaId,
          entryType: COMM.note,
          description: `Quote updated — Rs. ${total.toLocaleString("en-IN")}`,
          actorId: session.userId,
          metadata: { pushId: id },
        });
      }

      if (body.close) {
        const outcome = toDbPushOutcome(body.close.outcome);
        if (!outcome) {
          throw new Error(
            "Invalid close outcome — use not_selected, withdrew, or not_interested"
          );
        }
        const outcomeLabel =
          outcome === "not_selected"
            ? "Not selected"
            : outcome === "not_interested"
              ? "Not interested in MUA"
              : "Withdrew";
        const [closed] = await tx<{ id: string }[]>`
          UPDATE mua_pushes SET
            status = 'closed',
            outcome = ${outcome}::text::push_outcome,
            closed_at = NOW(),
            updated_at = NOW()
          WHERE id = ${id}::uuid
          RETURNING id
        `;
        if (!closed) throw new Error("Push not found or could not be closed");

        await closePushAndClearTasks(tx, id);

        await appendComm(tx, {
          leadId: push.leadId,
          muaId: push.muaId,
          entryType: COMM.conversationClosed,
          description: `Conversation closed: ${outcomeLabel}`,
          actorId: session.userId,
        });

        if (
          outcome === "not_interested" &&
          (session.role === "commissionRm" || session.role === "admin" || session.role === "owner")
        ) {
          const [{ active }] = await tx<{ active: number }[]>`
            SELECT COUNT(*)::int AS active FROM mua_pushes
            WHERE lead_id = ${push.leadId}::uuid AND status = 'active'
          `;
          if (active === 0) {
            const [archived] = await tx<{
              displayId: string;
              brideName: string;
            }[]>`
              UPDATE bride_leads SET
                status = 'archived',
                handover_reason = COALESCE(
                  NULLIF(TRIM(handover_reason), ''),
                  'All MUA conversations closed — not interested'
                ),
                exit_marked_by_role = ${toDbExitMarkedByRole(session.role)},
                uploader_confirmation = NULL,
                uploader_confirmed_at = NULL,
                uploader_confirmed_by = NULL,
                updated_at = NOW()
              WHERE id = ${push.leadId}::uuid AND status = 'commission_rm'
              RETURNING display_id AS "displayId", bride_name AS "brideName"
            `;
            await appendComm(tx, {
              leadId: push.leadId,
              entryType: COMM.note,
              description: "Lead archived — all commission conversations closed as not interested",
              actorId: session.userId,
            });
            if (archived) {
              await scheduleUploaderReviewTask(tx, {
                leadId: push.leadId,
                displayId: archived.displayId,
                brideName: archived.brideName,
                reason: "archived_confirm",
                assignedBy: session.userId,
              });
            }
            await refreshLeadPhase(tx, push.leadId);
          }
        }
      }

      await insertAuditLog(tx, {
        tableName: "mua_pushes",
        recordId: id,
        action: "update",
        actorId: session.userId,
        changes: body as Record<string, unknown>,
      });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    const status = message.includes("Invalid close outcome") ? 400 : 500;
    return NextResponse.json({ data: null, error: message }, { status });
  }

  return NextResponse.json({ data: { ok: true }, error: null });
}
