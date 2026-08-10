import type { TransactionSql } from "@/db/index";
import { generateTaskDisplayId } from "@/db/index";
import { toDbTaskType } from "@/lib/db-mappers";
import { createNotification } from "@/lib/notifications";
import { isClosedDealStage } from "@/lib/sales-pipeline-stages";

export type RenewalOutcome =
  | "pending"
  | "renewed"
  | "lapsed_without_renewal"
  | "rejected"
  | "junked"
  | "superseded_by_admin_extension";

async function latestPlanHistoryId(tx: TransactionSql, muaId: string): Promise<string | null> {
  const [row] = await tx<{ id: string }[]>`
    SELECT id FROM mua_plan_history
    WHERE mua_id = ${muaId}::uuid
    ORDER BY assigned_at DESC
    LIMIT 1
  `;
  return row?.id ?? null;
}

export async function resolvePlanPeriodKey(
  tx: TransactionSql,
  muaId: string,
  planExpiry: string | null,
): Promise<{ planPeriodKey: string; planHistoryId: string | null }> {
  const planHistoryId = await latestPlanHistoryId(tx, muaId);
  if (planHistoryId) {
    return { planPeriodKey: planHistoryId, planHistoryId };
  }
  if (!planExpiry) {
    return { planPeriodKey: `active:${muaId}:unknown`, planHistoryId: null };
  }
  return { planPeriodKey: `active:${muaId}:${planExpiry}`, planHistoryId: null };
}

async function cancelRenewalTasks(tx: TransactionSql, pipelineId: string) {
  const pipelineRef = `%[PIPE:${pipelineId}]%`;
  await tx`
    UPDATE rm_tasks
    SET status = 'cancelled', updated_at = NOW()
    WHERE status = 'pending'
      AND title LIKE ${pipelineRef}
      AND task_type IN ('sales_follow_up', 'sales_senior_call', 'sales_assign_rm')
  `;
}

async function assignUnassignedRenewalPipeline(
  tx: TransactionSql,
  opts: { pipelineId: string; muaName: string },
) {
  const pipelineRef = `[PIPE:${opts.pipelineId}]`;
  const admins = await tx<{ id: string }[]>`
    SELECT id FROM staff WHERE role = 'admin' AND active = true
  `;
  const tls = await tx<{ id: string }[]>`
    SELECT id FROM staff WHERE role = 'sales_tl' AND active = true
  `;
  for (const user of [...admins, ...tls]) {
    const taskDisplayId = await generateTaskDisplayId(tx);
    await tx`
      INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
      VALUES (
        ${taskDisplayId},
        ${user.id}::uuid,
        NULL,
        NULL,
        ${toDbTaskType("salesAssignRm")}::task_type,
        ${`Assign salesperson for renewal — ${opts.muaName} ${pipelineRef}`},
        CURRENT_DATE,
        'pending'
      )
    `;
    await createNotification(tx, {
      userId: user.id,
      message: `${opts.muaName} renewal outreach (unassigned). Assign a salesperson.`,
      link: "/admin/muas/unassigned",
    });
  }
}

/** T-30 renewal outreach — one shot per plan period; 29-day catch-up if cron missed yesterday. */
export async function processRenewalT30(tx: TransactionSql): Promise<number> {
  const due = await tx<{
    muaId: string;
    muaName: string;
    planExpiry: string;
    salesClosedBy: string | null;
    salespersonActive: boolean;
    daysUntilExpiry: number;
  }[]>`
    SELECT
      m.id AS "muaId",
      m.name AS "muaName",
      m.plan_expiry::text AS "planExpiry",
      m.sales_closed_by AS "salesClosedBy",
      COALESCE(s.active, false) AS "salespersonActive",
      (m.plan_expiry::date - CURRENT_DATE)::int AS "daysUntilExpiry"
    FROM muas m
    LEFT JOIN staff s ON s.id = m.sales_closed_by
    WHERE m.status = 'active'
      AND m.plan_tier IS NOT NULL
      AND m.plan_expiry IS NOT NULL
      AND (m.plan_expiry::date - CURRENT_DATE) IN (29, 30)
      AND NOT EXISTS (
        SELECT 1 FROM sales.pipeline p
        WHERE p.mua_id = m.id
          AND p.status = 'active'
          AND p.mua_type = 'renewal'
      )
  `;

  let created = 0;
  for (const row of due) {
    const { planPeriodKey, planHistoryId } = await resolvePlanPeriodKey(tx, row.muaId, row.planExpiry);

    // Claim the plan period first so concurrent pipeline GETs don't race on convert + insert.
    const [claimed] = await tx<{ id: string }[]>`
      INSERT INTO sales.renewal_attempt (
        mua_id, plan_history_id, plan_period_key, triggered_for_expiry, pipeline_id, outcome
      )
      VALUES (
        ${row.muaId}::uuid,
        ${planHistoryId}::uuid,
        ${planPeriodKey},
        ${row.planExpiry}::date,
        NULL,
        'pending'
      )
      ON CONFLICT (mua_id, plan_period_key) DO NOTHING
      RETURNING id
    `;
    if (!claimed) continue;

    const assignTo = row.salesClosedBy && row.salespersonActive ? row.salesClosedBy : null;

    const [existingPipe] = await tx<{
      id: string;
      stage: string;
      muaType: string;
      assignedTo: string | null;
    }[]>`
      SELECT
        id,
        stage::text AS stage,
        mua_type::text AS "muaType",
        assigned_to AS "assignedTo"
      FROM sales.pipeline
      WHERE mua_id = ${row.muaId}::uuid
        AND status = 'active'
        AND stage <> 'Rejected'
      ORDER BY updated_at DESC
      LIMIT 1
    `;

    let pipelineId: string;

    if (existingPipe && isClosedDealStage(existingPipe.stage)) {
      await tx`
        UPDATE sales.pipeline
        SET
          mua_type = 'renewal',
          stage = 'Untouched',
          assigned_to = COALESCE(assigned_to, ${assignTo}::uuid),
          updated_at = NOW()
        WHERE id = ${existingPipe.id}::uuid
      `;
      pipelineId = existingPipe.id;
      const actorId = await resolveStageLogActor(tx, {
        assignedTo: existingPipe.assignedTo ?? assignTo,
        salesClosedBy: row.salesClosedBy,
        salesClosedByActive: row.salespersonActive,
      });
      await tx`
        INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
        VALUES (
          ${pipelineId}::uuid,
          'stageChanged',
          ${`T-30 — converted Deal Closed pipeline to renewal (${row.daysUntilExpiry}d until expiry)`},
          ${actorId}::uuid,
          ${tx.json({ renewalT30: true, convertedFromClosedDeal: true, planExpiry: row.planExpiry, planPeriodKey })}
        )
      `;
    } else if (existingPipe) {
      // Active non-closed pipeline — drop the claim; another flow owns this MUA.
      await tx`
        DELETE FROM sales.renewal_attempt WHERE id = ${claimed.id}::uuid
      `;
      continue;
    } else {
      const [pipeline] = await tx<{ id: string }[]>`
        INSERT INTO sales.pipeline (mua_id, mua_type, stage, status, assigned_to)
        VALUES (${row.muaId}::uuid, 'renewal', 'Untouched', 'active', ${assignTo}::uuid)
        RETURNING id
      `;
      if (!pipeline) {
        await tx`
          DELETE FROM sales.renewal_attempt WHERE id = ${claimed.id}::uuid
        `;
        continue;
      }
      pipelineId = pipeline.id;
      const actorId = await resolveStageLogActor(tx, {
        assignedTo: assignTo,
        salesClosedBy: row.salesClosedBy,
        salesClosedByActive: row.salespersonActive,
      });
      await tx`
        INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
        VALUES (
          ${pipelineId}::uuid,
          'stageChanged',
          ${`T-30 renewal pipeline created (${row.daysUntilExpiry}d until plan expiry)`},
          ${actorId}::uuid,
          ${tx.json({ renewalT30: true, planExpiry: row.planExpiry, planPeriodKey })}
        )
      `;
    }

    await tx`
      UPDATE sales.renewal_attempt
      SET pipeline_id = ${pipelineId}::uuid
      WHERE id = ${claimed.id}::uuid
    `;

    const pipelineRef = `[PIPE:${pipelineId}]`;
    if (assignTo) {
      const taskDisplayId = await generateTaskDisplayId(tx);
      await tx`
        INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
        VALUES (
          ${taskDisplayId},
          ${assignTo}::uuid,
          NULL,
          NULL,
          ${toDbTaskType("salesFollowUp")}::task_type,
          ${`Renewal outreach — ${row.muaName} ${pipelineRef}`},
          CURRENT_DATE,
          'pending'
        )
      `;
    } else {
      await assignUnassignedRenewalPipeline(tx, { pipelineId, muaName: row.muaName });
    }

    created++;
  }

  return created;
}

async function resolveStageLogActor(
  tx: TransactionSql,
  opts: {
    assignedTo: string | null;
    salesClosedBy?: string | null;
    salesClosedByActive?: boolean;
  },
): Promise<string> {
  if (opts.assignedTo) return opts.assignedTo;
  if (opts.salesClosedBy && opts.salesClosedByActive) return opts.salesClosedBy;
  const [admin] = await tx<{ id: string }[]>`
    SELECT id FROM staff
    WHERE role IN ('admin', 'owner') AND active = true
    ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END
    LIMIT 1
  `;
  if (!admin) throw new Error("No active admin for automated stage log");
  return admin.id;
}

export async function convertRenewalPipelineToReEngage(
  tx: TransactionSql,
  opts: {
    pipelineId: string;
    muaId: string;
    muaName: string;
    assignedTo: string | null;
    salesClosedBy?: string | null;
    salesClosedByActive?: boolean;
  },
) {
  await tx`
    UPDATE sales.pipeline
    SET mua_type = 're_engage', updated_at = NOW()
    WHERE id = ${opts.pipelineId}::uuid AND status = 'active' AND mua_type = 'renewal'
  `;

  await tx`
    UPDATE sales.renewal_attempt
    SET outcome = 'lapsed_without_renewal', outcome_at = NOW()
    WHERE pipeline_id = ${opts.pipelineId}::uuid AND outcome = 'pending'
  `;

  await cancelRenewalTasks(tx, opts.pipelineId);

  const changedBy = await resolveStageLogActor(tx, opts);
  const pipelineRef = `[PIPE:${opts.pipelineId}]`;
  if (opts.assignedTo) {
    const taskDisplayId = await generateTaskDisplayId(tx);
    await tx`
      INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
      VALUES (
        ${taskDisplayId},
        ${opts.assignedTo}::uuid,
        NULL,
        NULL,
        ${toDbTaskType("salesFollowUp")}::task_type,
        ${`Re-activation follow-up — ${opts.muaName} ${pipelineRef}`},
        CURRENT_DATE,
        'pending'
      )
    `;
  }

  await tx`
    INSERT INTO sales.stage_log (pipeline_id, from_stage, to_stage, changed_by, note)
    VALUES (
      ${opts.pipelineId}::uuid,
      (SELECT stage::text FROM sales.pipeline WHERE id = ${opts.pipelineId}::uuid),
      (SELECT stage::text FROM sales.pipeline WHERE id = ${opts.pipelineId}::uuid),
      ${changedBy}::uuid,
      'Plan expired — renewal pipeline converted to re-engage'
    )
  `;
}

export async function convertExpiredRenewalPipelines(tx: TransactionSql): Promise<number> {
  const open = await tx<{
    pipelineId: string;
    muaId: string;
    muaName: string;
    assignedTo: string | null;
    salesClosedBy: string | null;
    salesClosedByActive: boolean;
  }[]>`
    SELECT
      p.id AS "pipelineId",
      p.mua_id AS "muaId",
      m.name AS "muaName",
      p.assigned_to AS "assignedTo",
      m.sales_closed_by AS "salesClosedBy",
      COALESCE(sc.active, false) AS "salesClosedByActive"
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    LEFT JOIN staff sc ON sc.id = m.sales_closed_by
    WHERE p.status = 'active'
      AND p.mua_type = 'renewal'
      AND m.plan_expiry IS NOT NULL
      AND m.plan_expiry < CURRENT_DATE
  `;

  for (const row of open) {
    await convertRenewalPipelineToReEngage(tx, row);
  }
  return open.length;
}

export async function setRenewalAttemptOutcome(
  tx: TransactionSql,
  pipelineId: string,
  outcome: RenewalOutcome,
) {
  await tx`
    UPDATE sales.renewal_attempt
    SET outcome = ${outcome}, outcome_at = NOW()
    WHERE pipeline_id = ${pipelineId}::uuid AND outcome = 'pending'
  `;
}

/** Admin plan extension — supersede open renewal without re-firing T-30 for this plan period. */
export async function supersedeRenewalForAdminExtension(
  tx: TransactionSql,
  muaId: string,
  actorId?: string,
) {
  const pending = await tx<{ pipelineId: string; id: string }[]>`
    SELECT ra.pipeline_id AS "pipelineId", ra.id
    FROM sales.renewal_attempt ra
    JOIN sales.pipeline p ON p.id = ra.pipeline_id
    WHERE ra.mua_id = ${muaId}::uuid
      AND ra.outcome = 'pending'
      AND p.status = 'active'
      AND p.mua_type = 'renewal'
  `;

  for (const row of pending) {
    if (!row.pipelineId) {
      await tx`
        UPDATE sales.renewal_attempt
        SET outcome = 'superseded_by_admin_extension', outcome_at = NOW()
        WHERE id = ${row.id}::uuid
      `;
      continue;
    }

    await cancelRenewalTasks(tx, row.pipelineId);
    await tx`
      UPDATE sales.pipeline
      SET status = 'closed', updated_at = NOW()
      WHERE id = ${row.pipelineId}::uuid AND mua_type = 'renewal' AND status = 'active'
    `;
    await tx`
      UPDATE sales.renewal_attempt
      SET outcome = 'superseded_by_admin_extension', outcome_at = NOW()
      WHERE id = ${row.id}::uuid
    `;
    await tx`
      INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
      VALUES (
        ${row.pipelineId}::uuid,
        'noteAdded',
        'Renewal outreach superseded — admin extended current plan',
        ${actorId ?? null}::uuid,
        ${tx.json({ supersededByAdminExtension: true })}
      )
    `;
  }
}
