import type { TransactionSql } from "@/db/index";
import { appendComm, type Sql } from "@/db/index";
import { COMM } from "@/lib/comm-types";
import { LEAD_EXIT_LABELS } from "@/lib/lead-exit";
import { refreshLeadPhase } from "@/lib/lead-phase";
import { tryAutoAssignLead } from "@/lib/auto-assign";
import type { Region } from "@/lib/types";

export type ReactivatableLeadRow = {
  status: string;
  handoverReason: string | null;
  hostileNote: string | null;
  verified: boolean;
};

export function isLeadReactivatable(lead: ReactivatableLeadRow): boolean {
  const hostile = !!(lead.hostileNote?.trim());
  if (hostile) return false;
  if (!lead.verified) return false;
  const status = lead.status.replace(/_/g, "");
  return status === "archived" || status === "commissionrm";
}

export async function reactivateNiLead(
  db: Sql | TransactionSql,
  params: {
    leadId: string;
    actorId: string;
    actorName: string;
    note?: string | null;
    autoAssign?: boolean;
  }
): Promise<{ ok: true; region: Region } | { ok: false; error: string }> {
  const [lead] = await db<
    {
      status: string;
      handoverReason: string | null;
      hostileNote: string | null;
      verified: boolean;
      region: Region;
    }[]
  >`
    SELECT
      status::text AS status,
      handover_reason AS "handoverReason",
      hostile_note AS "hostileNote",
      verified,
      region::text AS region
    FROM bride_leads
    WHERE id = ${params.leadId}::uuid
  `;

  if (!lead) {
    return { ok: false, error: "Lead not found" };
  }
  if (!isLeadReactivatable(lead)) {
    return { ok: false, error: "This lead cannot be reactivated from closed" };
  }

  const noteSuffix = params.note?.trim() ? `: ${params.note.trim()}` : "";

  await db`
    UPDATE bride_leads SET
      status = 'verified',
      verified = true,
      verified_at = COALESCE(verified_at, NOW()),
      handover_reason = NULL,
      hostile_note = NULL,
      shifted_at = NULL,
      assigned_rm_id = NULL,
      assignment_date = NULL,
      portal_only = false,
      exit_marked_by_role = NULL,
      uploader_confirmation = 'reopen',
      uploader_confirmed_at = NOW(),
      uploader_confirmed_by = ${params.actorId}::uuid,
      updated_at = NOW()
    WHERE id = ${params.leadId}::uuid
  `;

  await appendComm(db, {
    leadId: params.leadId,
    entryType: COMM.note,
    description: `${LEAD_EXIT_LABELS.reactivate} by ${params.actorName}${noteSuffix}`,
    actorId: params.actorId,
  });

  if (params.autoAssign !== false) {
    await tryAutoAssignLead(db as TransactionSql, {
      leadId: params.leadId,
      region: lead.region,
      actorId: params.actorId,
    });
  } else {
    await refreshLeadPhase(db as TransactionSql, params.leadId);
  }

  return { ok: true, region: lead.region };
}
