import type { TransactionSql } from "@/db/index";
import { appendComm } from "@/db/index";
import { tryAutoAssignLead } from "@/lib/auto-assign";
import { COMM } from "@/lib/comm-types";
import { scheduleCommissionHandoverTasks } from "@/lib/commission-handover";
import { requireActiveCommissionRm } from "@/lib/commission-rm-staff";
import type { Region } from "@/lib/types";

export type LeadRouting = "rm" | "portal" | "both" | "commission";

export function resolveVerifyRoutingFlags(routing: LeadRouting): {
  portalOnly: boolean;
  portalPushed: boolean;
  useCommission: boolean;
} {
  return {
    portalOnly: routing === "portal",
    portalPushed: routing === "portal" || routing === "both",
    useCommission: routing === "commission",
  };
}

export async function applyPostVerifyRouting(
  tx: TransactionSql,
  opts: {
    leadId: string;
    region: Region;
    actorId: string;
    routing: LeadRouting;
    commissionRmId?: string | null;
  }
): Promise<void> {
  const { portalOnly, useCommission } = resolveVerifyRoutingFlags(opts.routing);

  if (useCommission) {
    const commissionRmId = opts.commissionRmId?.trim();
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
        portal_pushed = false,
        shifted_at = COALESCE(shifted_at, NOW()),
        updated_at = NOW()
      WHERE id = ${opts.leadId}::uuid AND verified = true
      RETURNING display_id AS "displayId", shifted_at AS "shiftedAt"
    `;
    if (shifted?.displayId) {
      await scheduleCommissionHandoverTasks(tx, {
        leadId: opts.leadId,
        displayId: shifted.displayId,
        handoverReason: "Assigned at verification",
        commissionRmId: commissionRm.id,
        actorId: opts.actorId,
        intakeMode: "direct_assign",
      });
    }
    await appendComm(tx, {
      leadId: opts.leadId,
      entryType: COMM.shiftedCommission,
      description: `Assigned to ${commissionRm.name} (commission) at verification`,
      actorId: opts.actorId,
    });
    return;
  }

  if (!portalOnly) {
    await tryAutoAssignLead(tx, {
      leadId: opts.leadId,
      region: opts.region,
      actorId: opts.actorId,
    });
  }
}
