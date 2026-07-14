import { NextResponse } from "next/server";
import {
  sql,
  withTransaction,
  insertAuditLog,
  appendComm,
  setAuditActor,
} from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { COMM } from "@/lib/comm-types";
import { onLeadOwnerHandover } from "@/lib/lead-owner-handover";
import { scheduleCommissionHandoverTasks } from "@/lib/commission-handover";
import { refreshLeadPhase } from "@/lib/lead-phase";
import { requireActiveCommissionRm } from "@/lib/commission-rm-staff";
import { cancelPendingStaffTasksForLead } from "@/lib/task-duplicates";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as {
    leadId?: string;
    target?: "rm" | "commission" | "portal";
    rmId?: string;
    commissionRmId?: string;
  };

  const leadId = body.leadId;
  const target = body.target;
  if (!leadId || !target) {
    return NextResponse.json(
      { data: null, error: "leadId and target are required" },
      { status: 400 }
    );
  }

  if (target === "rm" && !body.rmId) {
    return NextResponse.json(
      { data: null, error: "rmId required for RM assignment" },
      { status: 400 }
    );
  }

  if (target === "commission") {
    const commissionRmId = body.commissionRmId?.trim() || body.rmId?.trim();
    if (!commissionRmId) {
      return NextResponse.json(
        { data: null, error: "commissionRmId required for commission assignment" },
        { status: 400 }
      );
    }
  }

  try {
    await withTransaction(async (tx) => {
      await setAuditActor(tx, auth.session.userId);

      const [prior] = await tx<{ assignedRmId: string | null }[]>`
        SELECT assigned_rm_id AS "assignedRmId"
        FROM bride_leads
        WHERE id = ${leadId}::uuid
      `;

      if (target === "rm") {
        if (prior?.assignedRmId && prior.assignedRmId !== body.rmId) {
          await cancelPendingStaffTasksForLead(tx, {
            leadId,
            staffId: prior.assignedRmId,
          });
        }
        await tx`
          UPDATE bride_leads SET
            assigned_rm_id = ${body.rmId}::uuid,
            status = 'assigned',
            assignment_date = CURRENT_DATE,
            portal_only = false,
            updated_at = NOW()
          WHERE id = ${leadId}::uuid
        `;
        const [lead] = await tx<{ brideName: string; displayId: string }[]>`
          SELECT bride_name AS "brideName", display_id AS "displayId"
          FROM bride_leads WHERE id = ${leadId}::uuid
        `;
        if (lead) {
          await onLeadOwnerHandover(tx, {
            leadId,
            newStaffId: body.rmId!,
            previousStaffId: prior?.assignedRmId,
            brideName: lead.brideName,
            displayId: lead.displayId,
            actorId: auth.session.userId,
          });
        }
      } else if (target === "commission") {
        const commissionRmId = (body.commissionRmId ?? body.rmId)!.trim();
        const commissionRm = await requireActiveCommissionRm(tx, commissionRmId);
        const [priorCommission] = await tx<{
          status: string;
          assignedRmId: string | null;
        }[]>`
          SELECT status::text AS status, assigned_rm_id AS "assignedRmId"
          FROM bride_leads WHERE id = ${leadId}::uuid
        `;
        const [lead] = await tx<{
          displayId: string;
          brideName: string;
          shiftedAt: string;
        }[]>`
          UPDATE bride_leads SET
            assigned_rm_id = ${commissionRm.id}::uuid,
            status = 'commission_rm',
            assignment_date = NULL,
            shifted_at = COALESCE(shifted_at, NOW()),
            portal_only = false,
            updated_at = NOW()
          WHERE id = ${leadId}::uuid
          RETURNING display_id AS "displayId", bride_name AS "brideName", shifted_at AS "shiftedAt"
        `;
        if (lead?.displayId) {
          await scheduleCommissionHandoverTasks(tx, {
            leadId,
            displayId: lead.displayId,
            commissionRmId: commissionRm.id,
            actorId: auth.session.userId,
            previousStaffId:
              priorCommission?.assignedRmId &&
              priorCommission.assignedRmId !== commissionRm.id
                ? priorCommission.assignedRmId
                : null,
            intakeMode:
              priorCommission?.status === "assigned" &&
              priorCommission.assignedRmId
                ? "regional_shift"
                : "direct_assign",
          });
        }
      } else {
        if (prior?.assignedRmId) {
          await cancelPendingStaffTasksForLead(tx, {
            leadId,
            staffId: prior.assignedRmId,
          });
        }
        await tx`
          UPDATE bride_leads SET
            assigned_rm_id = NULL,
            status = 'verified',
            portal_only = true,
            assignment_date = NULL,
            updated_at = NOW()
          WHERE id = ${leadId}::uuid
        `;
      }

      const desc =
        target === "rm"
          ? `Reassigned to regional RM`
          : target === "commission"
            ? `Reassigned to commission queue`
            : `Marked portal-only`;

      await appendComm(tx, {
        leadId,
        entryType: target === "commission" ? "shifted_commission" : "assigned",
        description: desc,
        actorId: auth.session.userId,
      });

      await insertAuditLog(tx, {
        tableName: "bride_leads",
        recordId: leadId,
        action: "reassign",
        actorId: auth.session.userId,
        changes: { target, rmId: body.rmId ?? null, commissionRmId: body.commissionRmId ?? null },
      });
      await refreshLeadPhase(tx, leadId);
    });

    return NextResponse.json({ data: { ok: true }, error: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Reassign failed";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
