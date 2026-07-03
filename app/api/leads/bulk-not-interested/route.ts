import { NextResponse } from "next/server";
import { withTransaction, appendComm } from "@/db/index";
import { scheduleCommissionHandoverTasks } from "@/lib/commission-handover";
import { refreshLeadPhase } from "@/lib/lead-phase";
import { pickCommissionRmForAssignment } from "@/lib/commission-rm-staff";
import { requireRoles } from "@/lib/api-auth";
import { COMM } from "@/lib/comm-types";
import { toDbExitMarkedByRole } from "@/lib/lead-exit";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";

export async function POST(request: Request) {
  const auth = await requireRoles([
    "regionalRm",
    "commissionRm",
    "admin",
    "owner",
  ]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as { leadIds?: string[] };
  const leadIds = body.leadIds ?? [];

  if (!leadIds.length) {
    return NextResponse.json(
      { data: null, error: "leadIds required" },
      { status: 400 }
    );
  }

  if (USE_MOCK) {
    const updated = mockStore.bulkNotInterested(
      leadIds,
      auth.session.userId,
      auth.session.name
    );
    return NextResponse.json({ data: { updated }, error: null });
  }

  const { session } = auth;
  let updated = 0;

  await withTransaction(async (tx) => {
    for (const leadId of leadIds) {
      const commissionRm = await pickCommissionRmForAssignment(tx);
      if (!commissionRm) continue;

      const [prior] = await tx<{ assignedRmId: string | null }[]>`
        SELECT assigned_rm_id AS "assignedRmId"
        FROM bride_leads WHERE id = ${leadId}::uuid
      `;

      const result = await tx<{ id: string; displayId: string; shiftedAt: string }[]>`
        UPDATE bride_leads SET
          status = 'commission_rm',
          assigned_rm_id = ${commissionRm.id}::uuid,
          assignment_date = NULL,
          shifted_at = NOW(),
          handover_reason = 'Not interested — bulk action',
          exit_marked_by_role = ${toDbExitMarkedByRole(session.role)},
          updated_at = NOW()
        WHERE id = ${leadId}::uuid
        RETURNING id, display_id AS "displayId", shifted_at AS "shiftedAt"
      `;
      if (result.length) {
        updated++;
        const row = result[0]!;
        await appendComm(tx, {
          leadId,
          entryType: COMM.shiftedCommission,
          description: `Not interested — bulk action by ${session.name} → ${commissionRm.name}`,
          actorId: session.userId,
        });
        await scheduleCommissionHandoverTasks(tx, {
          leadId,
          displayId: row.displayId,
          handoverReason: "Not interested — bulk action",
          commissionRmId: commissionRm.id,
          actorId: session.userId,
          previousStaffId: prior?.assignedRmId ?? session.userId,
          intakeMode: "regional_shift",
        });
        await refreshLeadPhase(tx, leadId);
      }
    }
  });

  return NextResponse.json({ data: { updated }, error: null });
}
