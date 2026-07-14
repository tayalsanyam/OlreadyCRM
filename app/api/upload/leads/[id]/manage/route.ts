import { NextResponse } from "next/server";
import { appendComm, insertAuditLog, sql, withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { tryAutoAssignLead } from "@/lib/auto-assign";
import { COMM } from "@/lib/comm-types";
import { scheduleCommissionHandoverTasks } from "@/lib/commission-handover";
import { requireActiveCommissionRm } from "@/lib/commission-rm-staff";
import { toDbExitMarkedByRole } from "@/lib/lead-exit";
import { refreshLeadPhase } from "@/lib/lead-phase";
import type { Region } from "@/lib/types";

type ManageAction = "deactivate" | "set_routing" | "assign_rm" | "assign_commission_rm";
type RoutingTarget = "portal" | "rm_queue" | "commission";

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
    action?: ManageAction;
    target?: RoutingTarget;
    rmId?: string;
    commissionRmId?: string;
    note?: string | null;
  };

  if (body.action === "deactivate") {
    const note = body.note?.trim() || "Deactivated by lead uploader";
    await withTransaction(async (tx) => {
      await tx`
        UPDATE bride_leads SET
          status = 'archived',
          handover_reason = ${note},
          hostile_note = NULL,
          exit_marked_by_role = ${toDbExitMarkedByRole("leadUploader")},
          updated_at = NOW()
        WHERE id = ${id}::uuid
          AND verified = true
      `;
      await appendComm(tx, {
        leadId: id,
        entryType: COMM.note,
        description: `Lead deactivated: ${note}`,
        actorId: auth.session.userId,
      });
      await insertAuditLog(tx, {
        tableName: "bride_leads",
        recordId: id,
        action: "uploader_deactivate",
        actorId: auth.session.userId,
        changes: { note },
      });
      await refreshLeadPhase(tx, id);
    });
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  if (body.action === "set_routing") {
    const target = body.target;
    if (!target || !["portal", "rm_queue", "commission"].includes(target)) {
      return NextResponse.json({ data: null, error: "Invalid routing target" }, { status: 400 });
    }

    if (target === "commission" && !body.commissionRmId?.trim()) {
      return NextResponse.json(
        { data: null, error: "Select a Commission RM" },
        { status: 400 }
      );
    }

    try {
      await withTransaction(async (tx) => {
        const [lead] = await tx<{ region: Region }[]>`
          SELECT region::text AS region FROM bride_leads
          WHERE id = ${id}::uuid AND verified = true
        `;
        if (!lead) {
          throw new Error("Verified lead not found");
        }

        if (target === "portal") {
        await tx`
          UPDATE bride_leads SET
            assigned_rm_id = NULL,
            assignment_date = NULL,
            status = 'verified',
            portal_only = true,
            updated_at = NOW()
          WHERE id = ${id}::uuid AND verified = true
        `;
      } else if (target === "rm_queue") {
        await tx`
          UPDATE bride_leads SET
            assigned_rm_id = NULL,
            assignment_date = NULL,
            status = 'verified',
            portal_only = false,
            updated_at = NOW()
          WHERE id = ${id}::uuid AND verified = true
        `;
        await tryAutoAssignLead(tx, {
          leadId: id,
          region: lead.region,
          actorId: auth.session.userId,
        });
      } else {
        const commissionRmId = body.commissionRmId?.trim();
        if (!commissionRmId) {
          throw new Error("Select a Commission RM");
        }
        const commissionRm = await requireActiveCommissionRm(tx, commissionRmId);

        const [shifted] = await tx<{ displayId: string; shiftedAt: string }[]>`
          UPDATE bride_leads SET
            assigned_rm_id = ${commissionRm.id}::uuid,
            assignment_date = NULL,
            status = 'commission_rm',
            portal_only = false,
            shifted_at = COALESCE(shifted_at, NOW()),
            updated_at = NOW()
          WHERE id = ${id}::uuid AND verified = true
          RETURNING display_id AS "displayId", shifted_at AS "shiftedAt"
        `;

        if (shifted?.displayId) {
          await scheduleCommissionHandoverTasks(tx, {
            leadId: id,
            displayId: shifted.displayId,
            handoverReason: "Assigned by uploader",
            commissionRmId: commissionRm.id,
            actorId: auth.session.userId,
            intakeMode: "direct_assign",
          });
        }
      }

      const desc =
        target === "portal"
          ? "Routing changed to portal by uploader"
          : target === "commission"
            ? "Routing changed to commission queue by uploader"
            : "Routing changed to regional RM assign queue by uploader";

      await appendComm(tx, {
        leadId: id,
        entryType: target === "commission" ? COMM.shiftedCommission : COMM.assigned,
        description: desc,
        actorId: auth.session.userId,
      });

        await insertAuditLog(tx, {
          tableName: "bride_leads",
          recordId: id,
          action: "uploader_routing",
          actorId: auth.session.userId,
          changes: { target, commissionRmId: body.commissionRmId ?? null },
        });
        await refreshLeadPhase(tx, id);
      });

      return NextResponse.json({ data: { ok: true }, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Routing update failed";
      const status = message.includes("not found") ? 404 : 400;
      return NextResponse.json({ data: null, error: message }, { status });
    }
  }

  if (body.action === "assign_commission_rm") {
    const commissionRmId = body.commissionRmId?.trim();
    if (!commissionRmId) {
      return NextResponse.json(
        { data: null, error: "commissionRmId is required" },
        { status: 400 }
      );
    }

    try {
      await withTransaction(async (tx) => {
        const commissionRm = await requireActiveCommissionRm(tx, commissionRmId);
        const [lead] = await tx<{ displayId: string; status: string }[]>`
          SELECT display_id AS "displayId", status::text AS status
          FROM bride_leads
          WHERE id = ${id}::uuid AND verified = true
        `;
        if (!lead) {
          throw new Error("Verified lead not found");
        }
        if (lead.status !== "commission_rm") {
          throw new Error("Lead is not in the commission queue");
        }

        await tx`
          UPDATE bride_leads SET
            assigned_rm_id = ${commissionRm.id}::uuid,
            updated_at = NOW()
          WHERE id = ${id}::uuid
        `;

        await appendComm(tx, {
          leadId: id,
          entryType: COMM.shiftedCommission,
          description: `Reassigned to Commission RM ${commissionRm.name} by uploader`,
          actorId: auth.session.userId,
        });

        await insertAuditLog(tx, {
          tableName: "bride_leads",
          recordId: id,
          action: "uploader_assign_commission_rm",
          actorId: auth.session.userId,
          changes: { commissionRmId: commissionRm.id, commissionRmName: commissionRm.name },
        });
        await refreshLeadPhase(tx, id);
      });

      return NextResponse.json({ data: { ok: true }, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Assign failed";
      const status = message.includes("not found") ? 404 : 400;
      return NextResponse.json({ data: null, error: message }, { status });
    }
  }

  if (body.action === "assign_rm") {
    const rmId = body.rmId?.trim();
    if (!rmId) {
      return NextResponse.json({ data: null, error: "rmId is required" }, { status: 400 });
    }

    const [lead] = await sql<{ region: Region }[]>`
      SELECT region::text AS region FROM bride_leads
      WHERE id = ${id}::uuid AND verified = true
    `;
    if (!lead) {
      return NextResponse.json({ data: null, error: "Verified lead not found" }, { status: 404 });
    }

    const [rm] = await sql<{ id: string; name: string }[]>`
      SELECT id, name FROM staff
      WHERE id = ${rmId}::uuid
        AND role = 'regional_rm'
        AND active = true
        AND (
          region = ${lead.region}::region
          OR ${lead.region}::region = ANY(regions)
        )
    `;
    if (!rm) {
      return NextResponse.json(
        { data: null, error: "RM not found or does not cover this lead's region" },
        { status: 400 }
      );
    }

    await withTransaction(async (tx) => {
      await tx`
        UPDATE bride_leads SET
          assigned_rm_id = ${rm.id}::uuid,
          assignment_date = CURRENT_DATE,
          status = 'assigned',
          portal_only = false,
          updated_at = NOW()
        WHERE id = ${id}::uuid AND verified = true
      `;

      await appendComm(tx, {
        leadId: id,
        entryType: COMM.assigned,
        description: `Assigned to ${rm.name} by uploader`,
        actorId: auth.session.userId,
      });

      await insertAuditLog(tx, {
        tableName: "bride_leads",
        recordId: id,
        action: "uploader_assign_rm",
        actorId: auth.session.userId,
        changes: { rmId: rm.id, rmName: rm.name },
      });
      await refreshLeadPhase(tx, id);
    });

    return NextResponse.json({ data: { ok: true, rmName: rm.name }, error: null });
  }

  return NextResponse.json({ data: null, error: "Invalid action" }, { status: 400 });
}
