import { NextResponse } from "next/server";
import {
  withTransaction,
  appendComm,
  insertAuditLog,
  setAuditActor,
} from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { COMM } from "@/lib/comm-types";
import { createNotification } from "@/lib/notifications";
import { onLeadOwnerHandover } from "@/lib/lead-owner-handover";
import { refreshLeadPhase } from "@/lib/lead-phase";
import { cancelPendingStaffTasksForLead } from "@/lib/task-duplicates";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";

export async function POST(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as { leadIds?: string[]; rmId?: string };
  const leadIds = body.leadIds ?? [];
  const rmId = body.rmId;

  if (!leadIds.length || !rmId) {
    return NextResponse.json(
      { data: null, error: "leadIds and rmId required" },
      { status: 400 },
    );
  }

  if (USE_MOCK) {
    const updated = mockStore.bulkReassign(leadIds, rmId, auth.session.userId);
    return NextResponse.json({ data: { updated }, error: null });
  }

  const { session } = auth;
  let updated = 0;

  await withTransaction(async (tx) => {
    await setAuditActor(tx, session.userId);
    const [rm] = await tx<{ name: string }[]>`
      SELECT name FROM staff WHERE id = ${rmId}::uuid
    `;

    for (const leadId of leadIds) {
      const [prior] = await tx<{ assignedRmId: string | null; brideName: string; displayId: string }[]>`
        SELECT assigned_rm_id AS "assignedRmId", bride_name AS "brideName", display_id AS "displayId"
        FROM bride_leads
        WHERE id = ${leadId}::uuid
      `;
      if (!prior) continue;

      if (prior.assignedRmId && prior.assignedRmId !== rmId) {
        await cancelPendingStaffTasksForLead(tx, {
          leadId,
          staffId: prior.assignedRmId,
        });
      }

      const result = await tx`
        UPDATE bride_leads SET
          assigned_rm_id = ${rmId}::uuid,
          assignment_date = CURRENT_DATE,
          status = 'assigned',
          portal_only = false,
          updated_at = NOW()
        WHERE id = ${leadId}::uuid
        RETURNING id
      `;

      if (result.length) {
        updated++;
        await appendComm(tx, {
          leadId,
          entryType: COMM.assigned,
          description: `Bulk reassigned to ${rm?.name ?? "RM"}`,
          actorId: session.userId,
        });
        await createNotification(tx, {
          userId: rmId,
          message: "New lead assigned to you",
          link: `/rm/leads/${leadId}`,
        });
        await onLeadOwnerHandover(tx, {
          leadId,
          newStaffId: rmId,
          previousStaffId: prior.assignedRmId,
          brideName: prior.brideName,
          displayId: prior.displayId,
          actorId: session.userId,
        });
        await insertAuditLog(tx, {
          tableName: "bride_leads",
          recordId: leadId,
          action: "reassign",
          actorId: session.userId,
          changes: { from: prior.assignedRmId, to: rmId },
        });
        await refreshLeadPhase(tx, leadId);
      }
    }
  });

  return NextResponse.json({ data: { updated }, error: null });
}
