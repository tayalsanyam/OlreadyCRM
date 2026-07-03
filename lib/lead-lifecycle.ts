import type { TransactionSql } from "@/db/index";
import { appendComm, generateTaskDisplayId } from "@/db/index";
import { cancelPendingTasksForLeads } from "@/lib/task-duplicates";
import { scheduleCommissionHandoverTasks } from "@/lib/commission-handover";
import { pickCommissionRmForAssignment } from "@/lib/commission-rm-staff";
import { COMM } from "@/lib/comm-types";
import { createNotification } from "@/lib/notifications";
import { refreshLeadPhase } from "@/lib/lead-phase";

export type LeadLifecycleReconcileResult = {
  expired: number;
  shifted: number;
  shiftWarnings: number;
};

/** No ceremony on or after today — same predicate as expireDueLeads (expects alias `bl`). */
export const SQL_LEAD_NO_FUTURE_CEREMONIES = `
  bl.status NOT IN (
    'booked',
    'archived',
    'missed',
    'expired',
    'pending_verification'
  )
  AND NOT EXISTS (
    SELECT 1 FROM lead_events le
    WHERE le.lead_id = bl.id
      AND le.status != 'not_needed'
      AND le.event_date >= CURRENT_DATE
  )
`;

/** Marked expired or past all ceremony dates (expects alias `bl`). */
export const SQL_LEAD_IS_EXPIRED = `
  (
    bl.status = 'expired'
    OR bl.lead_phase = 'expired'
    OR (${SQL_LEAD_NO_FUTURE_CEREMONIES.trim()})
  )
`;

async function getSlaWindow(tx: TransactionSql) {
  const [sla] = await tx<{ assignmentWindowDays: number; shiftWarningDay: number }[]>`
    SELECT assignment_window_days, shift_warning_day FROM sla_config WHERE id = 1
  `;
  return {
    windowDays: sla?.assignmentWindowDays ?? 45,
    warningDay: sla?.shiftWarningDay ?? 40,
  };
}

/** Mark leads expired when every ceremony date is in the past. */
export async function expireDueLeads(tx: TransactionSql): Promise<number> {
  const expiredIds = await tx<{ id: string }[]>`
    WITH updated AS (
      UPDATE bride_leads bl
      SET status = 'expired', expired_at = NOW(), lead_phase = 'expired', updated_at = NOW()
      WHERE bl.status NOT IN (
          'booked',
          'archived',
          'missed',
          'expired',
          'pending_verification'
        )
        AND NOT EXISTS (
          SELECT 1 FROM lead_events le
          WHERE le.lead_id = bl.id
            AND le.status != 'not_needed'
            AND le.event_date >= CURRENT_DATE
        )
      RETURNING id
    )
    SELECT id FROM updated
  `;

  if (expiredIds.length > 0) {
    await cancelPendingTasksForLeads(
      tx,
      expiredIds.map((row: { id: string }) => row.id),
    );
  }

  return expiredIds.length;
}

/** Auto-shift assigned leads past the assignment window to Commission RM. */
export async function shiftDueLeadsToCommission(tx: TransactionSql): Promise<number> {
  const { windowDays } = await getSlaWindow(tx);

  const due = await tx<{ id: string; displayId: string; assignedRmId: string | null }[]>`
    SELECT id, display_id AS "displayId", assigned_rm_id AS "assignedRmId"
    FROM bride_leads
    WHERE status = 'assigned'
      AND assignment_date < (CURRENT_DATE - ${windowDays}::int)
  `;

  let shifted = 0;
  for (const lead of due) {
    const commissionRm = await pickCommissionRmForAssignment(tx);
    if (!commissionRm) continue;

    const [updated] = await tx<{ id: string; shiftedAt: string }[]>`
      UPDATE bride_leads SET
        status = 'commission_rm',
        assigned_rm_id = ${commissionRm.id}::uuid,
        assignment_date = NULL,
        shifted_at = NOW(),
        handover_reason = '45-day shift',
        updated_at = NOW()
      WHERE id = ${lead.id}::uuid AND status = 'assigned'
      RETURNING id, shifted_at AS "shiftedAt"
    `;
    if (!updated) continue;
    shifted++;

    await appendComm(tx, {
      leadId: lead.id,
      entryType: COMM.shiftedCommission,
      description: `Auto-shifted to Commission RM ${commissionRm.name} (45-day window)`,
      actorId: null,
    });
    await scheduleCommissionHandoverTasks(tx, {
      leadId: lead.id,
      displayId: lead.displayId,
      handoverReason: "45-day shift",
      commissionRmId: commissionRm.id,
      previousStaffId: lead.assignedRmId,
      intakeMode: "regional_shift",
    });
    if (lead.assignedRmId) {
      await createNotification(tx, {
        userId: lead.assignedRmId,
        message: `Lead ${lead.displayId} auto-shifted to Commission RM`,
        link: `/commission/queue`,
      });
    }
    await refreshLeadPhase(tx, lead.id);
    const admins = await tx<{ id: string }[]>`
      SELECT id FROM staff WHERE role = 'admin' AND active = true
    `;
    for (const admin of admins) {
      const taskId = await generateTaskDisplayId(tx);
      await createNotification(tx, {
        userId: admin.id,
        message: `Lead ${lead.displayId} auto-shifted`,
        link: `/admin/dashboard`,
      });
      await tx`
        INSERT INTO rm_tasks (display_id, staff_id, lead_id, task_type, title, due_date)
        VALUES (
          ${taskId},
          ${admin.id}::uuid,
          ${lead.id}::uuid,
          'admin_review',
          ${`Lead ${lead.displayId} auto-shifted`},
          CURRENT_DATE
        )
      `;
    }
  }

  return shifted;
}

/** Notify RMs when a lead hits the pre-shift warning day. */
export async function notifyShiftWarnings(tx: TransactionSql): Promise<number> {
  const { warningDay } = await getSlaWindow(tx);

  const warningLeads = await tx<
    { id: string; displayId: string; assignedRmId: string | null }[]
  >`
    SELECT id, display_id AS "displayId", assigned_rm_id AS "assignedRmId"
    FROM bride_leads
    WHERE status = 'assigned'
      AND assignment_date = (CURRENT_DATE - ${warningDay}::int)
  `;

  for (const lead of warningLeads) {
    if (!lead.assignedRmId) continue;
    await createNotification(tx, {
      userId: lead.assignedRmId,
      message: `Lead ${lead.displayId} will auto-shift to Commission RM in 5 days`,
      link: `/rm/leads/${lead.id}`,
    });
  }

  return warningLeads.length;
}

/** Run all time-based lead lifecycle transitions (idempotent). */
export async function reconcileDueLeads(
  tx: TransactionSql,
): Promise<LeadLifecycleReconcileResult> {
  const expired = await expireDueLeads(tx);
  const shifted = await shiftDueLeadsToCommission(tx);
  const shiftWarnings = await notifyShiftWarnings(tx);
  return { expired, shifted, shiftWarnings };
}

/** Reconcile lifecycle for one lead (e.g. on profile open). */
export async function reconcileLeadLifecycle(
  tx: TransactionSql,
  leadId: string,
): Promise<void> {
  const { windowDays, warningDay } = await getSlaWindow(tx);

  await tx`
    UPDATE bride_leads bl
    SET status = 'expired', expired_at = NOW(), lead_phase = 'expired', updated_at = NOW()
    WHERE bl.id = ${leadId}::uuid
      AND bl.status NOT IN (
        'booked',
        'archived',
        'missed',
        'expired',
        'pending_verification'
      )
      AND NOT EXISTS (
        SELECT 1 FROM lead_events le
        WHERE le.lead_id = bl.id
          AND le.status != 'not_needed'
          AND le.event_date >= CURRENT_DATE
      )
    RETURNING id
  `;

  const [expiredRow] = await tx<{ id: string }[]>`
    SELECT id FROM bride_leads
    WHERE id = ${leadId}::uuid AND status = 'expired'::lead_status
  `;
  if (expiredRow) {
    await cancelPendingTasksForLeads(tx, [expiredRow.id]);
  }

  const [due] = await tx<
    { id: string; displayId: string; assignedRmId: string | null }[]
  >`
    SELECT id, display_id AS "displayId", assigned_rm_id AS "assignedRmId"
    FROM bride_leads
    WHERE id = ${leadId}::uuid
      AND status = 'assigned'
      AND assignment_date < (CURRENT_DATE - ${windowDays}::int)
  `;

  if (due) {
    const commissionRm = await pickCommissionRmForAssignment(tx);
    if (commissionRm) {
      const [updated] = await tx<{ id: string; shiftedAt: string }[]>`
        UPDATE bride_leads SET
          status = 'commission_rm',
          assigned_rm_id = ${commissionRm.id}::uuid,
          assignment_date = NULL,
          shifted_at = NOW(),
          handover_reason = '45-day shift',
          updated_at = NOW()
        WHERE id = ${leadId}::uuid AND status = 'assigned'
        RETURNING id, shifted_at AS "shiftedAt"
      `;
      if (updated) {
        await appendComm(tx, {
          leadId: due.id,
          entryType: COMM.shiftedCommission,
          description: `Auto-shifted to Commission RM ${commissionRm.name} (45-day window)`,
          actorId: null,
        });
        await scheduleCommissionHandoverTasks(tx, {
          leadId: due.id,
          displayId: due.displayId,
          handoverReason: "45-day shift",
          commissionRmId: commissionRm.id,
          previousStaffId: due.assignedRmId,
          intakeMode: "regional_shift",
        });
        if (due.assignedRmId) {
          await createNotification(tx, {
            userId: due.assignedRmId,
            message: `Lead ${due.displayId} auto-shifted to Commission RM`,
            link: `/commission/queue`,
          });
        }
        await refreshLeadPhase(tx, leadId);
      }
    }
  }

  const [warningLead] = await tx<
    { id: string; displayId: string; assignedRmId: string | null }[]
  >`
    SELECT id, display_id AS "displayId", assigned_rm_id AS "assignedRmId"
    FROM bride_leads
    WHERE id = ${leadId}::uuid
      AND status = 'assigned'
      AND assignment_date = (CURRENT_DATE - ${warningDay}::int)
  `;
  if (warningLead?.assignedRmId) {
    await createNotification(tx, {
      userId: warningLead.assignedRmId,
      message: `Lead ${warningLead.displayId} will auto-shift to Commission RM in 5 days`,
      link: `/rm/leads/${warningLead.id}`,
    });
  }

  await refreshLeadPhase(tx, leadId);
}
