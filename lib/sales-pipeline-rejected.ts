import { generateTaskDisplayId, type TransactionSql } from "@/db/index";
import { setRenewalAttemptOutcome } from "@/lib/sales-renewal-track";
import { toDbTaskType } from "@/lib/db-mappers";
import { getSalesTeamId, listTeamSalesMembers } from "@/lib/sales-report-scope";

export type JunkCustomerSegment = "prospect" | "ex_customer";

export type RejectedPipelineRow = {
  id: string;
  muaId: string;
  muaName: string;
  muaCity: string;
  muaSource: string | null;
  muaType: string;
  assignedTo: string | null;
  assignedToName: string | null;
  rejectionReason: string | null;
  rejectionNote: string | null;
  rejectedAt: string | null;
  rejectedByName: string | null;
  rejectionCount: number;
  daysInRejected: number;
};

export async function resolveJunkCustomerSegment(
  tx: TransactionSql,
  muaId: string
): Promise<JunkCustomerSegment> {
  const [row] = await tx<{ hadPlan: boolean }[]>`
    SELECT EXISTS(
      SELECT 1 FROM mua_plan_history WHERE mua_id = ${muaId}::uuid
    ) AS "hadPlan"
  `;
  return row?.hadPlan ? "ex_customer" : "prospect";
}

async function appendRejectionLog(
  tx: TransactionSql,
  opts: {
    pipelineId: string;
    rejectionReason: string | null;
    rejectionNote: string | null;
    rejectedBy: string | null;
    rejectedAt: Date | string;
  }
) {
  await tx`
    INSERT INTO sales.pipeline_rejection_log (
      pipeline_id, rejection_reason, rejection_note, rejected_by, rejected_at
    )
    VALUES (
      ${opts.pipelineId}::uuid,
      ${opts.rejectionReason},
      ${opts.rejectionNote},
      ${opts.rejectedBy}::uuid,
      ${opts.rejectedAt}::timestamptz
    )
  `;
}

export async function listRejectedPipelines(
  tx: TransactionSql,
  opts: { teamId?: string | null; assignedToIds?: string[] | null }
): Promise<RejectedPipelineRow[]> {
  const teamFilter =
    opts.teamId != null
      ? tx`EXISTS (
          SELECT 1 FROM staff s
          WHERE s.id = p.assigned_to AND s.team_id = ${opts.teamId}::uuid
        ) OR p.assigned_to IS NULL`
      : tx`TRUE`;

  const assigneeFilter =
    opts.assignedToIds && opts.assignedToIds.length
      ? tx`(p.assigned_to = ANY(${opts.assignedToIds}::uuid[]) OR p.assigned_to IS NULL)`
      : tx`TRUE`;

  return tx<RejectedPipelineRow[]>`
    SELECT
      p.id,
      p.mua_id AS "muaId",
      m.name AS "muaName",
      m.city AS "muaCity",
      m.source AS "muaSource",
      p.mua_type AS "muaType",
      p.assigned_to AS "assignedTo",
      assignee.name AS "assignedToName",
      p.rejection_reason AS "rejectionReason",
      p.rejection_note AS "rejectionNote",
      p.rejected_at AS "rejectedAt",
      rejector.name AS "rejectedByName",
      COALESCE(p.rejection_count, 0)::int AS "rejectionCount",
      COALESCE(DATE_PART('day', NOW() - p.rejected_at), 0)::int AS "daysInRejected"
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    LEFT JOIN staff assignee ON assignee.id = p.assigned_to
    LEFT JOIN staff rejector ON rejector.id = p.rejected_by
    WHERE p.status = 'active'
      AND p.stage = 'Rejected'
      AND ${teamFilter}
      AND ${assigneeFilter}
    ORDER BY p.rejected_at DESC NULLS LAST, p.updated_at DESC
  `;
}

export async function resolveTeamScopeForStaff(
  tx: TransactionSql,
  userId: string,
  role: string
): Promise<{ teamId: string | null; memberIds: string[] }> {
  if (role === "salesTl") {
    const teamId = await getSalesTeamId(tx, userId);
    if (!teamId) return { teamId: null, memberIds: [userId] };
    const members = await listTeamSalesMembers(tx, teamId);
    const memberIds = Array.from(new Set([userId, ...members.map((m) => m.id)]));
    return { teamId, memberIds };
  }
  return { teamId: null, memberIds: [] };
}

async function cancelPendingSalesTasks(tx: TransactionSql, pipelineId: string) {
  const pipelineRef = `%[PIPE:${pipelineId}]%`;
  await tx`
    UPDATE rm_tasks
    SET status = 'cancelled', updated_at = NOW()
    WHERE status = 'pending'
      AND title LIKE ${pipelineRef}
      AND task_type IN (
        'sales_follow_up', 'sales_senior_call', 'sales_onboarding',
        'sales_activation', 'sales_assign_rm'
      )
  `;
}

/** Record rejection, increment count; auto-junk on 2nd reject by customer history. */
export async function processPipelineRejection(
  tx: TransactionSql,
  opts: {
    pipelineId: string;
    muaId: string;
    muaType: string;
    actorId: string;
    rejectionReason: string;
    rejectionNote: string | null;
  }
): Promise<{ autoJunked: boolean; rejectionCount: number }> {
  const [pipe] = await tx<{ rejectionCount: number }[]>`
    SELECT COALESCE(rejection_count, 0)::int AS "rejectionCount"
    FROM sales.pipeline
    WHERE id = ${opts.pipelineId}::uuid
    LIMIT 1
  `;
  const newCount = (pipe?.rejectionCount ?? 0) + 1;
  const now = new Date();

  await tx`
    UPDATE sales.pipeline
    SET
      stage = 'Rejected',
      rejection_reason = ${opts.rejectionReason},
      rejection_note = ${opts.rejectionNote},
      rejected_at = ${now},
      rejected_by = ${opts.actorId}::uuid,
      rejection_count = ${newCount},
      updated_at = NOW()
    WHERE id = ${opts.pipelineId}::uuid
  `;

  await appendRejectionLog(tx, {
    pipelineId: opts.pipelineId,
    rejectionReason: opts.rejectionReason,
    rejectionNote: opts.rejectionNote,
    rejectedBy: opts.actorId,
    rejectedAt: now,
  });

  if (opts.muaType === "renewal") {
    await setRenewalAttemptOutcome(tx, opts.pipelineId, "rejected");
  }

  if (newCount >= 2) {
    const segment = await resolveJunkCustomerSegment(tx, opts.muaId);
    await junkRejectedPipeline(tx, {
      pipelineId: opts.pipelineId,
      actorId: opts.actorId,
      junkReason:
        segment === "ex_customer"
          ? "Rejected twice — archived (former customer)"
          : "Rejected twice — archived (prospect)",
      customerSegment: segment,
    });
    return { autoJunked: true, rejectionCount: newCount };
  }

  return { autoJunked: false, rejectionCount: newCount };
}

export async function reassignRejectedPipeline(
  tx: TransactionSql,
  opts: {
    pipelineId: string;
    salesRmId: string;
    actorId: string;
    assigneeName: string;
    note?: string;
  }
) {
  const [pipe] = await tx<{
    id: string;
    muaName: string;
    stage: string;
    status: string;
    rejectionReason: string | null;
    rejectionNote: string | null;
    rejectedBy: string | null;
    rejectedAt: string | null;
    rejectionCount: number;
  }[]>`
    SELECT
      p.id,
      m.name AS "muaName",
      p.stage,
      p.status,
      p.rejection_reason AS "rejectionReason",
      p.rejection_note AS "rejectionNote",
      p.rejected_by AS "rejectedBy",
      p.rejected_at AS "rejectedAt",
      COALESCE(p.rejection_count, 0)::int AS "rejectionCount"
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    WHERE p.id = ${opts.pipelineId}::uuid
    LIMIT 1
  `;
  if (!pipe) throw Object.assign(new Error("Pipeline not found"), { status: 404 });
  if (pipe.status !== "active" || pipe.stage !== "Rejected") {
    throw Object.assign(new Error("Pipeline is not in Rejected stage"), { status: 400 });
  }
  if (pipe.rejectionCount >= 2) {
    throw Object.assign(new Error("Pipeline already rejected twice — junked automatically"), {
      status: 400,
    });
  }

  const pipelineRef = `[PIPE:${opts.pipelineId}]`;
  const note = opts.note?.trim() || `Reassigned from Rejected to ${opts.assigneeName}`;

  if (pipe.rejectedAt) {
    await appendRejectionLog(tx, {
      pipelineId: opts.pipelineId,
      rejectionReason: pipe.rejectionReason,
      rejectionNote: pipe.rejectionNote,
      rejectedBy: pipe.rejectedBy,
      rejectedAt: pipe.rejectedAt,
    });
  }

  await cancelPendingSalesTasks(tx, opts.pipelineId);

  await tx`
    UPDATE sales.pipeline
    SET
      assigned_to = ${opts.salesRmId}::uuid,
      stage = 'Untouched',
      rejection_reason = NULL,
      rejection_note = NULL,
      rejected_at = NULL,
      rejected_by = NULL,
      updated_at = NOW()
    WHERE id = ${opts.pipelineId}::uuid
  `;

  await tx`
    INSERT INTO sales.stage_log (pipeline_id, from_stage, to_stage, changed_by, note)
    VALUES (
      ${opts.pipelineId}::uuid,
      'Rejected',
      'Untouched',
      ${opts.actorId}::uuid,
      ${note}
    )
  `;

  await tx`
    INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
    VALUES (
      ${opts.pipelineId}::uuid,
      'stageChanged',
      ${`Rejected MUA reassigned to ${opts.assigneeName} — reset to Untouched (rejection #${pipe.rejectionCount} logged)`},
      ${opts.actorId}::uuid,
      ${tx.json({
        action: "reassignFromRejected",
        salesRmId: opts.salesRmId,
        rejectionCount: pipe.rejectionCount,
      })}
    )
  `;

  const taskDisplayId = await generateTaskDisplayId(tx);
  await tx`
    INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
    VALUES (
      ${taskDisplayId},
      ${opts.salesRmId}::uuid,
      NULL,
      NULL,
      ${toDbTaskType("salesFollowUp")}::task_type,
      ${`Re-open after rejection — ${pipe.muaName} ${pipelineRef}`},
      CURRENT_DATE,
      'pending'
    )
  `;
}

export async function junkRejectedPipeline(
  tx: TransactionSql,
  opts: {
    pipelineId: string;
    actorId: string;
    junkReason?: string;
    customerSegment?: JunkCustomerSegment;
  }
) {
  const [row] = await tx<{
    id: string;
    muaId: string;
    muaType: string;
    muaName: string;
    muaCity: string | null;
    muaSource: string | null;
    muaPhone: string | null;
    assignedToId: string | null;
    assignedToName: string | null;
    rejectionReason: string | null;
    rejectionNote: string | null;
    stage: string;
    status: string;
  }[]>`
    SELECT
      p.id,
      p.mua_id AS "muaId",
      p.mua_type AS "muaType",
      m.name AS "muaName",
      m.city AS "muaCity",
      m.source AS "muaSource",
      m.phone AS "muaPhone",
      p.assigned_to AS "assignedToId",
      assignee.name AS "assignedToName",
      p.rejection_reason AS "rejectionReason",
      p.rejection_note AS "rejectionNote",
      p.stage,
      p.status
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    LEFT JOIN staff assignee ON assignee.id = p.assigned_to
    WHERE p.id = ${opts.pipelineId}::uuid
    LIMIT 1
  `;
  if (!row) throw Object.assign(new Error("Pipeline not found"), { status: 404 });
  if (row.status !== "active" || row.stage !== "Rejected") {
    throw Object.assign(new Error("Only active Rejected pipelines can be junked"), { status: 400 });
  }

  const junkReason = opts.junkReason?.trim() || "Marked junk from rejected queue";
  const customerSegment =
    opts.customerSegment ?? (await resolveJunkCustomerSegment(tx, row.muaId));

  await cancelPendingSalesTasks(tx, opts.pipelineId);

  await tx`
    UPDATE sales.pipeline
    SET status = 'junked', updated_at = NOW()
    WHERE id = ${opts.pipelineId}::uuid
  `;

  await tx`
    INSERT INTO sales.pipeline_junk (
      pipeline_id, mua_id, mua_type, mua_name, mua_city, mua_source, mua_phone,
      assigned_to_id, assigned_to_name, rejection_reason, rejection_note,
      junk_reason, junked_by, customer_segment, snapshot
    )
    VALUES (
      ${row.id}::uuid,
      ${row.muaId}::uuid,
      ${row.muaType},
      ${row.muaName},
      ${row.muaCity},
      ${row.muaSource},
      ${row.muaPhone},
      ${row.assignedToId}::uuid,
      ${row.assignedToName},
      ${row.rejectionReason},
      ${row.rejectionNote},
      ${junkReason},
      ${opts.actorId}::uuid,
      ${customerSegment},
      ${tx.json({
        stage: row.stage,
        junkedFrom: "rejected_queue",
        customerSegment,
      })}
    )
  `;

  await tx`
    INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
    VALUES (
      ${opts.pipelineId}::uuid,
      'noteAdded',
      ${`Pipeline junked: ${junkReason}`},
      ${opts.actorId}::uuid,
      ${tx.json({
        junkReason,
        rejectionReason: row.rejectionReason,
        customerSegment,
      })}
    )
  `;

  if (row.muaType === "renewal") {
    await setRenewalAttemptOutcome(tx, opts.pipelineId, "junked");
  }
}
