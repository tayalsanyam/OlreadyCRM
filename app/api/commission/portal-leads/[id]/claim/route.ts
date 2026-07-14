import { NextResponse } from "next/server";
import {
  sql,
  withTransaction,
  appendComm,
  insertAuditLog,
} from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { scheduleCommissionHandoverTasks } from "@/lib/commission-handover";
import { refreshLeadPhase } from "@/lib/lead-phase";
import { createNotification } from "@/lib/notifications";
import { normalizeLeadFull } from "@/lib/db-mappers";
import { COMM } from "@/lib/comm-types";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import type { LeadFull } from "@/lib/types";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(["commissionRm"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const { session } = auth;

  if (USE_MOCK) {
    const lead = mockStore.claimPortalLead(id, session.userId, session.name);
    if (!lead) {
      return NextResponse.json(
        { data: null, error: "Lead not available to claim" },
        { status: 404 }
      );
    }
    return NextResponse.json({ data: lead, error: null });
  }

  let updated: LeadFull | null = null;

  try {
    await withTransaction(async (tx) => {
      const [row] = await tx<{
        id: string;
        displayId: string;
        shiftedAt: string;
      }[]>`
        UPDATE bride_leads SET
          assigned_rm_id = ${session.userId}::uuid,
          assignment_date = CURRENT_DATE,
          status = 'commission_rm',
          portal_only = false,
          shifted_at = COALESCE(shifted_at, NOW()),
          updated_at = NOW()
        WHERE id = ${id}::uuid
          AND portal_only = true
          AND assigned_rm_id IS NULL
          AND status = 'verified'
        RETURNING id, display_id AS "displayId", shifted_at AS "shiftedAt"
      `;
      if (!row) throw new Error("NOT_AVAILABLE");

      await appendComm(tx, {
        leadId: id,
        entryType: COMM.assigned,
        description: `Claimed from portal leads by ${session.name}`,
        actorId: session.userId,
      });

      await scheduleCommissionHandoverTasks(tx, {
        leadId: id,
        displayId: row.displayId,
        commissionRmId: session.userId,
        actorId: session.userId,
        intakeMode: "direct_assign",
      });

      await createNotification(tx, {
        userId: session.userId,
        message: "Lead claimed — it's now in your queue",
        link: `/rm/leads/${id}`,
      });

      await insertAuditLog(tx, {
        tableName: "bride_leads",
        recordId: id,
        action: "claim_portal",
        actorId: session.userId,
      });
      await refreshLeadPhase(tx, id);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_AVAILABLE") {
      return NextResponse.json(
        { data: null, error: "Lead not available to claim" },
        { status: 404 }
      );
    }
    throw e;
  }

  const [lead] = await sql<LeadFull[]>`
    SELECT * FROM leads_full WHERE id = ${id}::uuid
  `;
  updated = lead ? normalizeLeadFull(lead) : null;

  return NextResponse.json({ data: updated, error: null });
}
