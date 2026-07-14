import { NextResponse } from "next/server";
import { withTransaction, appendComm, insertAuditLog } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { createNotification } from "@/lib/notifications";
import { COMM } from "@/lib/comm-types";
import { onLeadOwnerHandover } from "@/lib/lead-owner-handover";
import { refreshLeadPhase } from "@/lib/lead-phase";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";

export async function POST(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as { leadIds: string[]; rmId: string };
  if (!body.leadIds?.length || !body.rmId) {
    return NextResponse.json({ data: null, error: "leadIds and rmId required" }, { status: 400 });
  }

  const { session } = auth;

  if (USE_MOCK) {
    mockStore.assignLeads(body.leadIds, body.rmId, session.name);
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  await withTransaction(async (tx) => {
    const [rm] = await tx<{ name: string }[]>`
      SELECT name FROM staff WHERE id = ${body.rmId}::uuid
    `;
    for (const leadId of body.leadIds) {
      const [lead] = await tx<{ brideName: string; displayId: string }[]>`
        SELECT bride_name AS "brideName", display_id AS "displayId"
        FROM bride_leads WHERE id = ${leadId}::uuid
      `;
      const [prior] = await tx<{ assignedRmId: string | null }[]>`
        SELECT assigned_rm_id AS "assignedRmId"
        FROM bride_leads WHERE id = ${leadId}::uuid
      `;
      await tx`
        UPDATE bride_leads SET
          assigned_rm_id = ${body.rmId}::uuid,
          assignment_date = CURRENT_DATE,
          status = 'assigned',
          portal_only = false,
          updated_at = NOW()
        WHERE id = ${leadId}::uuid
      `;
      await appendComm(tx, {
        leadId,
        entryType: COMM.assigned,
        description: `Assigned to ${rm?.name ?? "RM"}`,
        actorId: session.userId,
      });
      await createNotification(tx, {
        userId: body.rmId,
        message: `New lead assigned to you`,
        link: `/rm/leads/${leadId}`,
      });
      if (lead) {
        await onLeadOwnerHandover(tx, {
          leadId,
          newStaffId: body.rmId,
          previousStaffId: prior?.assignedRmId,
          brideName: lead.brideName,
          displayId: lead.displayId,
          actorId: session.userId,
        });
      }
      await insertAuditLog(tx, {
        tableName: "bride_leads",
        recordId: leadId,
        action: "assign",
        actorId: session.userId,
      });
      await refreshLeadPhase(tx, leadId);
    }
  });

  return NextResponse.json({ data: { ok: true }, error: null });
}
