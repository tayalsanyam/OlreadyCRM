import type { TransactionSql } from "@/db/index";

export type DeleteStaffBlockers = {
  stageLogs: number;
  callLogs: number;
  rmCallLogs: number;
  commsLog: number;
  assignmentLogs: number;
  muaPushes: number;
  bookings: number;
  brideLeadsAssigned: number;
  salesTargets: number;
  isTeamLead: boolean;
};

export async function countStaffDeleteBlockers(
  tx: TransactionSql,
  staffId: string,
): Promise<DeleteStaffBlockers> {
  const [row] = await tx<DeleteStaffBlockers[]>`
    SELECT
      (SELECT COUNT(*)::int FROM sales.stage_log WHERE changed_by = ${staffId}::uuid) AS "stageLogs",
      (SELECT COUNT(*)::int FROM sales.call_logs WHERE salesperson_id = ${staffId}::uuid) AS "callLogs",
      (SELECT COUNT(*)::int FROM call_logs WHERE staff_id = ${staffId}::uuid) AS "rmCallLogs",
      (SELECT COUNT(*)::int FROM sales.comms_log WHERE actor_id = ${staffId}::uuid) AS "commsLog",
      (SELECT COUNT(*)::int FROM sales.assignment_log WHERE changed_by = ${staffId}::uuid) AS "assignmentLogs",
      (SELECT COUNT(*)::int FROM mua_pushes WHERE pushed_by = ${staffId}::uuid) AS "muaPushes",
      (SELECT COUNT(*)::int FROM bookings WHERE created_by = ${staffId}::uuid) AS "bookings",
      (SELECT COUNT(*)::int FROM bride_leads WHERE assigned_rm_id = ${staffId}::uuid OR verified_by = ${staffId}::uuid) AS "brideLeadsAssigned",
      (SELECT COUNT(*)::int FROM sales.targets WHERE user_id = ${staffId}::uuid) AS "salesTargets",
      (
        EXISTS (SELECT 1 FROM sales.teams WHERE tl_id = ${staffId}::uuid)
        OR EXISTS (SELECT 1 FROM sales.pipeline_junk WHERE junked_by = ${staffId}::uuid)
      ) AS "isTeamLead"
  `;
  return (
    row ?? {
      stageLogs: 0,
      callLogs: 0,
      rmCallLogs: 0,
      commsLog: 0,
      assignmentLogs: 0,
      muaPushes: 0,
      bookings: 0,
      brideLeadsAssigned: 0,
      salesTargets: 0,
      isTeamLead: false,
    }
  );
}

export function formatDeleteStaffBlockers(b: DeleteStaffBlockers): string {
  const parts: string[] = [];
  if (b.stageLogs) parts.push(`${b.stageLogs} sales stage log(s)`);
  if (b.callLogs) parts.push(`${b.callLogs} sales call(s)`);
  if (b.rmCallLogs) parts.push(`${b.rmCallLogs} Callyzer call(s)`);
  if (b.commsLog) parts.push(`${b.commsLog} sales comms entry(ies)`);
  if (b.assignmentLogs) parts.push(`${b.assignmentLogs} assignment log(s)`);
  if (b.muaPushes) parts.push(`${b.muaPushes} MUA push(es)`);
  if (b.bookings) parts.push(`${b.bookings} booking(s)`);
  if (b.brideLeadsAssigned) parts.push(`${b.brideLeadsAssigned} lead assignment(s)`);
  if (b.salesTargets) parts.push(`${b.salesTargets} sales target row(s)`);
  if (b.isTeamLead) parts.push("sales team lead or junk archive record");
  if (!parts.length) return "";
  return `Cannot delete permanently: linked to ${parts.join(", ")}. Deactivate the user instead.`;
}

export async function permanentlyDeleteStaff(tx: TransactionSql, staffId: string): Promise<void> {
  const blockers = await countStaffDeleteBlockers(tx, staffId);
  const message = formatDeleteStaffBlockers(blockers);
  if (message) {
    throw Object.assign(new Error(message), { status: 400 });
  }

  await tx`DELETE FROM notifications WHERE staff_id = ${staffId}::uuid`;
  await tx`DELETE FROM rm_tasks WHERE staff_id = ${staffId}::uuid`;
  await tx`DELETE FROM rm_targets WHERE staff_id = ${staffId}::uuid`;

  await tx`
    UPDATE sales.pipeline
    SET assigned_to = NULL, sales_closed_by = NULL, updated_at = NOW()
    WHERE assigned_to = ${staffId}::uuid OR sales_closed_by = ${staffId}::uuid
  `;
  await tx`
    UPDATE sales.pipeline
    SET rejected_by = NULL
    WHERE rejected_by = ${staffId}::uuid
  `;
  await tx`UPDATE muas SET assigned_rm_id = NULL WHERE assigned_rm_id = ${staffId}::uuid`;
  await tx`UPDATE muas SET sales_closed_by = NULL WHERE sales_closed_by = ${staffId}::uuid`;

  await tx`UPDATE mua_plan_history SET assigned_by = NULL WHERE assigned_by = ${staffId}::uuid`;
  await tx`UPDATE custom_report_templates SET created_by = NULL, updated_by = NULL WHERE created_by = ${staffId}::uuid OR updated_by = ${staffId}::uuid`;

  await tx`UPDATE staff SET team_id = NULL WHERE team_id IN (SELECT id FROM sales.teams WHERE tl_id = ${staffId}::uuid)`;

  const deleted = await tx<{ id: string }[]>`
    DELETE FROM staff WHERE id = ${staffId}::uuid RETURNING id
  `;
  if (!deleted.length) {
    throw Object.assign(new Error("User not found"), { status: 404 });
  }
}
