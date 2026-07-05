import type { TransactionSql } from "@/db/index";
import { generateTaskDisplayId } from "@/db/index";
import { loadPipelineQuotedAmount, sumPipelinePayments } from "@/lib/sales-deal-payment";
import { executePipelineDealClose } from "@/lib/sales-pipeline-deal-close";
import type { PipelineStage } from "@/lib/types";
import type { PlanSharedRow, SalesPlanDetailsInput } from "@/lib/sales-plan-details";
import {
  DISCOUNT_REQUEST_KIND,
  discountTaskTitle,
  type AdminDiscountTaskDetails,
} from "@/lib/sales-deal-discount-shared";

export {
  DISCOUNT_REQUEST_KIND,
  discountTaskTitle,
  parseDiscountTaskTitle,
  needsDiscountApproval,
  type AdminDiscountTaskDetails,
} from "@/lib/sales-deal-discount-shared";

export type PendingDiscountRequest = {
  stageLogId: string;
  pipelineId: string;
  listPrice: number;
  discountAmount: number;
  netQuoted: number;
  reason: string;
  requestedBy: string;
  requestedByName: string | null;
  muaName: string;
  createdAt: string;
};

export type DiscountStagePayload = {
  note: string;
  nextTouchPoint?: string | null;
  planDetails?: SalesPlanDetailsInput;
  quotedAmount?: number;
  discountAmount?: number;
  discountReason?: string;
  paymentDetails?: {
    amount?: number;
    paymentDate?: string;
    paymentMode?: "UPI" | "Cash" | "Bank Transfer" | "Card" | "Other";
    notes?: string;
  };
  plansShared?: PlanSharedRow[];
};

export async function findPendingDiscountRequest(
  tx: TransactionSql,
  pipelineId: string,
): Promise<PendingDiscountRequest | null> {
  const [row] = await tx<
    {
      id: string;
      pipelineId: string;
      metadata: Record<string, unknown> | null;
      createdAt: string;
      requestedByName: string | null;
      muaName: string;
    }[]
  >`
    SELECT
      sl.id,
      sl.pipeline_id AS "pipelineId",
      sl.metadata,
      sl.created_at::text AS "createdAt",
      s.name AS "requestedByName",
      m.name AS "muaName"
    FROM sales.stage_log sl
    JOIN sales.pipeline p ON p.id = sl.pipeline_id
    JOIN muas m ON m.id = p.mua_id
    LEFT JOIN staff s ON s.id = sl.changed_by
    WHERE sl.pipeline_id = ${pipelineId}::uuid
      AND sl.metadata->>'kind' = ${DISCOUNT_REQUEST_KIND}
      AND sl.metadata->>'status' = 'pending'
    ORDER BY sl.created_at DESC
    LIMIT 1
  `;
  if (!row?.metadata) return null;
  const meta = row.metadata;
  return {
    stageLogId: row.id,
    pipelineId: row.pipelineId,
    listPrice: Number(meta.listPrice ?? 0),
    discountAmount: Number(meta.discountAmount ?? 0),
    netQuoted: Number(meta.netQuoted ?? 0),
    reason: String(meta.reason ?? ""),
    requestedBy: String(meta.requestedBy ?? ""),
    requestedByName: row.requestedByName,
    muaName: row.muaName,
    createdAt: row.createdAt,
  };
}

export async function createDiscountApprovalRequest(
  tx: TransactionSql,
  opts: {
    pipelineId: string;
    fromStage: PipelineStage;
    actorId: string;
    actorRole: string;
    muaName: string;
    note: string;
    listPrice: number;
    discountAmount: number;
    discountReason: string;
    stagePayload: DiscountStagePayload;
  },
): Promise<{ stageLogId: string }> {
  const existing = await findPendingDiscountRequest(tx, opts.pipelineId);
  if (existing) {
    throw Object.assign(new Error("A discount approval is already pending for this deal"), { status: 409 });
  }

  const totalPaid = await sumPipelinePayments(tx, opts.pipelineId);
  const netQuoted = opts.listPrice - opts.discountAmount;
  if (opts.discountAmount <= 0) {
    throw Object.assign(new Error("Discount amount must be greater than zero"), { status: 400 });
  }
  if (netQuoted < 0) {
    throw Object.assign(new Error("Discount cannot exceed list price"), { status: 400 });
  }
  if (netQuoted + 0.009 < totalPaid) {
    throw Object.assign(
      new Error("Net deal price cannot be below amount already received"),
      { status: 400 },
    );
  }

  const metadata = {
    kind: DISCOUNT_REQUEST_KIND,
    status: "pending",
    listPrice: opts.listPrice,
    discountAmount: opts.discountAmount,
    netQuoted,
    reason: opts.discountReason.trim(),
    requestedBy: opts.actorId,
    requestedRole: opts.actorRole,
    stagePayload: opts.stagePayload,
  };

  const [logRow] = await tx<{ id: string }[]>`
    INSERT INTO sales.stage_log (pipeline_id, from_stage, to_stage, changed_by, note, metadata)
    VALUES (
      ${opts.pipelineId}::uuid,
      ${opts.fromStage},
      ${opts.fromStage},
      ${opts.actorId}::uuid,
      ${`Discount approval requested — ₹${opts.discountAmount.toLocaleString("en-IN")} off list price`},
      ${tx.json(metadata)}
    )
    RETURNING id
  `;

  const stageLogId = logRow.id;
  const taskTitle = discountTaskTitle(opts.muaName, opts.pipelineId, stageLogId);

  const admins = await tx<{ id: string }[]>`
    SELECT id FROM staff
    WHERE role IN ('admin'::user_role, 'owner'::user_role) AND active = true
  `;
  for (const admin of admins) {
    const taskDisplayId = await generateTaskDisplayId(tx);
    await tx`
      INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
      VALUES (
        ${taskDisplayId},
        ${admin.id}::uuid,
        NULL,
        NULL,
        'admin_review',
        ${taskTitle},
        CURRENT_DATE,
        'pending'
      )
    `;
  }

  await tx`
    INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
    VALUES (
      ${opts.pipelineId}::uuid,
      'noteAdded',
      ${`Discount ₹${opts.discountAmount.toLocaleString("en-IN")} submitted for admin approval`},
      ${opts.actorId}::uuid,
      ${tx.json({ stageLogId, listPrice: opts.listPrice, discountAmount: opts.discountAmount, netQuoted })}
    )
  `;

  return { stageLogId };
}

/** Recreate admin CRM tasks when a discount is still pending but tasks were wrongly marked done. */
export async function ensureDiscountAdminTasksForPipeline(
  tx: TransactionSql,
  pipelineId: string,
): Promise<{ recreated: boolean; stageLogId: string | null }> {
  const pending = await findPendingDiscountRequest(tx, pipelineId);
  if (!pending) return { recreated: false, stageLogId: null };

  const taskTitlePattern = `%[DISC:${pending.stageLogId}]%`;
  const [openTask] = await tx<{ id: string }[]>`
    SELECT id FROM rm_tasks
    WHERE status = 'pending'
      AND task_type = 'admin_review'
      AND title LIKE ${taskTitlePattern}
    LIMIT 1
  `;
  if (openTask) return { recreated: false, stageLogId: pending.stageLogId };

  const taskTitle = discountTaskTitle(pending.muaName, pipelineId, pending.stageLogId);
  const admins = await tx<{ id: string }[]>`
    SELECT id FROM staff
    WHERE role IN ('admin'::user_role, 'owner'::user_role) AND active = true
  `;
  for (const admin of admins) {
    const taskDisplayId = await generateTaskDisplayId(tx);
    await tx`
      INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
      VALUES (
        ${taskDisplayId},
        ${admin.id}::uuid,
        NULL,
        NULL,
        'admin_review',
        ${taskTitle},
        CURRENT_DATE,
        'pending'
      )
    `;
  }

  return { recreated: true, stageLogId: pending.stageLogId };
}

async function loadDiscountLog(
  tx: TransactionSql,
  stageLogId: string,
): Promise<{
  id: string;
  pipelineId: string;
  metadata: Record<string, unknown>;
  fromStage: PipelineStage;
} | null> {
  const [row] = await tx<
    {
      id: string;
      pipelineId: string;
      metadata: Record<string, unknown> | null;
      fromStage: PipelineStage;
    }[]
  >`
    SELECT
      id,
      pipeline_id AS "pipelineId",
      metadata,
      from_stage::text AS "fromStage"
    FROM sales.stage_log
    WHERE id = ${stageLogId}::uuid
    LIMIT 1
  `;
  if (!row?.metadata || row.metadata.kind !== DISCOUNT_REQUEST_KIND) return null;
  return { ...row, metadata: row.metadata };
}

export async function approveDiscountRequest(
  tx: TransactionSql,
  stageLogId: string,
  adminId: string,
  adminNote: string,
): Promise<{
  netQuoted: number;
  pipelineId: string;
  toStage: PipelineStage;
  onboardingTaskCreated: boolean;
}> {
  const log = await loadDiscountLog(tx, stageLogId);
  if (!log) throw Object.assign(new Error("Discount request not found"), { status: 404 });
  if (log.metadata.status !== "pending") {
    throw Object.assign(new Error("Discount request is no longer pending"), { status: 400 });
  }

  const netQuoted = Number(log.metadata.netQuoted ?? 0);
  const listPrice = Number(log.metadata.listPrice ?? 0);
  const discountAmount = Number(log.metadata.discountAmount ?? 0);
  const stagePayload = log.metadata.stagePayload as DiscountStagePayload | undefined;
  if (!stagePayload?.paymentDetails?.amount || !stagePayload.paymentDetails.paymentDate || !stagePayload.paymentDetails.paymentMode) {
    throw Object.assign(new Error("Stored deal close payload is incomplete"), { status: 400 });
  }

  const totalPaid = await sumPipelinePayments(tx, log.pipelineId);
  if (netQuoted + 0.009 < totalPaid) {
    throw Object.assign(new Error("Net deal price is below amount already received"), { status: 400 });
  }

  const [pipeline] = await tx<
    { assignedTo: string | null; muaName: string; muaId: string; muaType: string }[]
  >`
    SELECT
      p.assigned_to AS "assignedTo",
      m.name AS "muaName",
      m.id AS "muaId",
      p.mua_type AS "muaType"
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    WHERE p.id = ${log.pipelineId}::uuid
    LIMIT 1
  `;
  if (!pipeline) throw Object.assign(new Error("Pipeline not found"), { status: 404 });

  await tx`
    UPDATE sales.onboarding
    SET quoted_amount = ${netQuoted}, updated_at = NOW()
    WHERE pipeline_id = ${log.pipelineId}::uuid
  `;

  const closeResult = await executePipelineDealClose(tx, {
    pipelineId: log.pipelineId,
    actorId: adminId,
    fromStage: log.fromStage,
    note: stagePayload.note?.trim() || adminNote.trim(),
    nextTouchPoint: stagePayload.nextTouchPoint,
    planDetails: stagePayload.planDetails,
    plansShared: stagePayload.plansShared,
    paymentDetails: {
      amount: stagePayload.paymentDetails.amount!,
      paymentDate: stagePayload.paymentDetails.paymentDate!,
      paymentMode: stagePayload.paymentDetails.paymentMode!,
      notes: stagePayload.paymentDetails.notes,
    },
    quotedAmount: netQuoted,
    pipeline,
  });

  await tx`
    UPDATE sales.stage_log
    SET metadata = metadata || ${tx.json({
      status: "approved",
      approvedBy: adminId,
      approvedAt: new Date().toISOString(),
      adminNote: adminNote.trim(),
    })}
    WHERE id = ${stageLogId}::uuid
  `;

  await tx`
    INSERT INTO sales.stage_log (pipeline_id, from_stage, to_stage, changed_by, note, metadata)
    VALUES (
      ${log.pipelineId}::uuid,
      ${log.fromStage},
      ${log.fromStage},
      ${adminId}::uuid,
      ${adminNote.trim()},
      ${tx.json({
        kind: "deal_discount_approved",
        listPrice,
        discountAmount,
        netQuoted,
        approvedBy: adminId,
        closedToStage: closeResult.effectiveStage,
      })}
    )
  `;

  await tx`
    INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
    VALUES (
      ${log.pipelineId}::uuid,
      'stageChanged',
      ${`Discount approved — deal moved to ${closeResult.effectiveStage}`},
      ${adminId}::uuid,
      ${tx.json({
        stageLogId,
        listPrice,
        discountAmount,
        netQuoted,
        toStage: closeResult.effectiveStage,
      })}
    )
  `;

  const taskTitlePattern = `%[DISC:${stageLogId}]%`;
  await tx`
    UPDATE rm_tasks
    SET status = 'done', updated_at = NOW()
    WHERE status = 'pending'
      AND task_type = 'admin_review'
      AND title LIKE ${taskTitlePattern}
  `;

  return {
    netQuoted,
    pipelineId: log.pipelineId,
    toStage: closeResult.effectiveStage,
    onboardingTaskCreated: closeResult.onboardingTaskCreated,
  };
}

export async function rejectDiscountRequest(
  tx: TransactionSql,
  stageLogId: string,
  adminId: string,
  adminNote: string,
): Promise<{ pipelineId: string }> {
  const log = await loadDiscountLog(tx, stageLogId);
  if (!log) throw Object.assign(new Error("Discount request not found"), { status: 404 });
  if (log.metadata.status !== "pending") {
    throw Object.assign(new Error("Discount request is no longer pending"), { status: 400 });
  }

  await tx`
    UPDATE sales.stage_log
    SET metadata = metadata || ${tx.json({
      status: "rejected",
      rejectedBy: adminId,
      rejectedAt: new Date().toISOString(),
      adminNote: adminNote.trim(),
    })}
    WHERE id = ${stageLogId}::uuid
  `;

  await tx`
    INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
    VALUES (
      ${log.pipelineId}::uuid,
      'noteAdded',
      ${`Discount request rejected — deal not closed`},
      ${adminId}::uuid,
      ${tx.json({ stageLogId, adminNote: adminNote.trim() })}
    )
  `;

  const taskTitlePattern = `%[DISC:${stageLogId}]%`;
  await tx`
    UPDATE rm_tasks
    SET status = 'done', updated_at = NOW()
    WHERE status = 'pending'
      AND task_type = 'admin_review'
      AND title LIKE ${taskTitlePattern}
  `;

  return { pipelineId: log.pipelineId };
}

export async function loadDiscountRequestDetails(
  tx: TransactionSql,
  stageLogId: string,
): Promise<AdminDiscountTaskDetails | null> {
  const [row] = await tx<
    {
      id: string;
      pipelineId: string;
      metadata: Record<string, unknown> | null;
      createdAt: string;
      note: string | null;
      requestedByName: string | null;
      muaName: string;
      pipelineStage: string | null;
      priorPaid: string | null;
    }[]
  >`
    SELECT
      sl.id,
      sl.pipeline_id AS "pipelineId",
      sl.metadata,
      sl.created_at::text AS "createdAt",
      sl.note,
      s.name AS "requestedByName",
      m.name AS "muaName",
      p.stage::text AS "pipelineStage",
      (
        SELECT COALESCE(SUM(amount), 0)::text
        FROM sales.payment_records pr
        WHERE pr.pipeline_id = sl.pipeline_id
      ) AS "priorPaid"
    FROM sales.stage_log sl
    JOIN sales.pipeline p ON p.id = sl.pipeline_id
    JOIN muas m ON m.id = p.mua_id
    LEFT JOIN staff s ON s.id = sl.changed_by
    WHERE sl.id = ${stageLogId}::uuid
      AND sl.metadata->>'kind' = ${DISCOUNT_REQUEST_KIND}
    LIMIT 1
  `;
  if (!row?.metadata) return null;
  return mapDiscountLogRowToDetails(row);
}

export async function loadDiscountRequestsByStageLogIds(
  tx: TransactionSql,
  stageLogIds: string[],
): Promise<Map<string, AdminDiscountTaskDetails>> {
  if (stageLogIds.length === 0) return new Map();

  const rows = await tx<
    {
      id: string;
      pipelineId: string;
      metadata: Record<string, unknown> | null;
      createdAt: string;
      note: string | null;
      requestedByName: string | null;
      muaName: string;
      pipelineStage: string | null;
      priorPaid: string | null;
    }[]
  >`
    SELECT
      sl.id,
      sl.pipeline_id AS "pipelineId",
      sl.metadata,
      sl.created_at::text AS "createdAt",
      sl.note,
      s.name AS "requestedByName",
      m.name AS "muaName",
      p.stage::text AS "pipelineStage",
      (
        SELECT COALESCE(SUM(amount), 0)::text
        FROM sales.payment_records pr
        WHERE pr.pipeline_id = sl.pipeline_id
      ) AS "priorPaid"
    FROM sales.stage_log sl
    JOIN sales.pipeline p ON p.id = sl.pipeline_id
    JOIN muas m ON m.id = p.mua_id
    LEFT JOIN staff s ON s.id = sl.changed_by
    WHERE sl.id = ANY(${stageLogIds}::uuid[])
      AND sl.metadata->>'kind' = ${DISCOUNT_REQUEST_KIND}
  `;

  const out = new Map<string, AdminDiscountTaskDetails>();
  for (const row of rows) {
    const details = mapDiscountLogRowToDetails(row);
    if (details) out.set(row.id, details);
  }
  return out;
}

function mapDiscountLogRowToDetails(row: {
  id: string;
  pipelineId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  note: string | null;
  requestedByName: string | null;
  muaName: string;
  pipelineStage: string | null;
  priorPaid: string | null;
}): AdminDiscountTaskDetails | null {
  if (!row.metadata || row.metadata.kind !== DISCOUNT_REQUEST_KIND) return null;
  const meta = row.metadata;
  const stagePayload = (meta.stagePayload ?? {}) as DiscountStagePayload;
  const payment = stagePayload.paymentDetails;
  return {
    stageLogId: row.id,
    pipelineId: row.pipelineId,
    muaName: row.muaName,
    pipelineStage: row.pipelineStage,
    listPrice: Number(meta.listPrice ?? 0),
    discountAmount: Number(meta.discountAmount ?? 0),
    netQuoted: Number(meta.netQuoted ?? 0),
    reason: String(meta.reason ?? ""),
    requestedByName: row.requestedByName,
    requestedRole: meta.requestedRole ? String(meta.requestedRole) : null,
    requestedAt: row.createdAt,
    salesNote: stagePayload.note?.trim() || row.note,
    paymentAmount: payment?.amount != null ? Number(payment.amount) : null,
    paymentDate: payment?.paymentDate ?? null,
    paymentMode: payment?.paymentMode ?? null,
    priorPaid: Number(row.priorPaid ?? 0),
  };
}

export function applyDiscountToQuotedAmount(listPrice: number, discountAmount: number): number {
  return Math.max(0, listPrice - discountAmount);
}

export async function resolveListPriceForDiscount(
  tx: TransactionSql,
  pipelineId: string,
  bodyQuoted?: number,
): Promise<number> {
  const stored = await loadPipelineQuotedAmount(tx, pipelineId);
  const listPrice = bodyQuoted && bodyQuoted > 0 ? bodyQuoted : stored;
  if (listPrice <= 0) {
    throw Object.assign(new Error("Deal price is required — set quoted amount at Confirm"), { status: 400 });
  }
  return listPrice;
}
