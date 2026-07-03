import type { TransactionSql } from "@/db/index";
import { appendComm } from "@/db/index";
import { COMM } from "@/lib/comm-types";
import { createNotification } from "@/lib/notifications";
import { maybeStartLeadIntakeOnAssignment } from "@/lib/lead-intake-tasks";
import { refreshLeadPhase } from "@/lib/lead-phase";
import type { Region } from "@/lib/types";

/** Assign lead to regional RM with fewest active assigned leads in region. */
export async function tryAutoAssignLead(
  tx: TransactionSql,
  params: { leadId: string; region: Region; actorId: string }
): Promise<{ assigned: boolean; rmId?: string; rmName?: string }> {
  const [sla] = await tx<{ autoAssignEnabled: boolean }[]>`
    SELECT auto_assign_enabled FROM sla_config WHERE id = 1
  `;
  if (!sla?.autoAssignEnabled) {
    return { assigned: false };
  }

  const [rm] = await tx<{ id: string; name: string }[]>`
    SELECT s.id, s.name, COUNT(bl.id)::int AS load
    FROM staff s
    LEFT JOIN bride_leads bl ON bl.assigned_rm_id = s.id
      AND bl.status = 'assigned'
    WHERE s.role = 'regional_rm'
      AND s.active = true
      AND (
        s.region = ${params.region}::region
        OR ${params.region}::region = ANY(s.regions)
      )
    GROUP BY s.id, s.name
    ORDER BY load ASC
    LIMIT 1
  `;

  if (!rm) {
    return { assigned: false };
  }

  await tx`
    UPDATE bride_leads SET
      assigned_rm_id = ${rm.id}::uuid,
      assignment_date = CURRENT_DATE,
      status = 'assigned',
      updated_at = NOW()
    WHERE id = ${params.leadId}::uuid
  `;

  await appendComm(tx, {
    leadId: params.leadId,
    entryType: COMM.assigned,
    description: `Auto-assigned to ${rm.name}`,
    actorId: params.actorId,
  });

  try {
    await createNotification(tx, {
      userId: rm.id,
      message: "New lead assigned to you",
      link: `/rm/leads/${params.leadId}`,
    });
  } catch {
    /* assignment stands even if notification insert fails */
  }

  const [lead] = await tx<{ brideName: string; displayId: string }[]>`
    SELECT bride_name AS "brideName", display_id AS "displayId"
    FROM bride_leads WHERE id = ${params.leadId}::uuid
  `;
  if (lead) {
    await maybeStartLeadIntakeOnAssignment(tx, {
      leadId: params.leadId,
      staffId: rm.id,
      brideName: lead.brideName,
      displayId: lead.displayId,
      actorId: params.actorId,
      resetConfirmation: true,
    });
  }

  await refreshLeadPhase(tx, params.leadId);

  return { assigned: true, rmId: rm.id, rmName: rm.name };
}
