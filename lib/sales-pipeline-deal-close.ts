import type { TransactionSql } from "@/db/index";
import { generateTaskDisplayId } from "@/db/index";
import { toDbTaskType } from "@/lib/db-mappers";
import { createNotification } from "@/lib/notifications";
import {
  resolvePaymentCloseStage,
  sumPipelinePayments,
} from "@/lib/sales-deal-payment";
import { upsertOnboardingPlanDetails } from "@/lib/sales-onboarding-upsert";
import { ONBOARDING_STAGE } from "@/lib/sales-pipeline-stages";
import { cancelPendingSalesPipelineTasks } from "@/lib/sales-pipeline-assign-tasks";
import { setRenewalAttemptOutcome } from "@/lib/sales-renewal-track";
import { buildStageLogMetadata } from "@/lib/stage-log-plan";
import type { PipelineStage } from "@/lib/types";
import type { PlanSharedRow, SalesPlanDetailsInput } from "@/lib/sales-plan-details";

export type DealClosePaymentDetails = {
  amount: number;
  paymentDate: string;
  paymentMode: "UPI" | "Cash" | "Bank Transfer" | "Card" | "Other";
  notes?: string;
};

export type ExecutePipelineDealCloseOpts = {
  pipelineId: string;
  actorId: string;
  fromStage: PipelineStage;
  note: string;
  nextTouchPoint?: string | null;
  planDetails?: SalesPlanDetailsInput;
  plansShared?: PlanSharedRow[];
  paymentDetails: DealClosePaymentDetails;
  quotedAmount: number;
  pipeline: {
    assignedTo: string | null;
    muaName: string;
    muaId: string;
    muaType: string;
  };
};

export type ExecutePipelineDealCloseResult = {
  effectiveStage: PipelineStage;
  onboardingTaskCreated: boolean;
  totalPaid: number;
  quotedAmount: number;
  createdTasks: Array<{ type: string; assigneeId: string | null; dueDate: string | null }>;
};

/** Record payment, resolve Part Payment vs Onboarding, update pipeline, and create follow-up tasks. */
export async function executePipelineDealClose(
  tx: TransactionSql,
  opts: ExecutePipelineDealCloseOpts,
): Promise<ExecutePipelineDealCloseResult> {
  const { pipelineId, actorId, fromStage, note, pipeline } = opts;
  const pipelineRef = `[PIPE:${pipelineId}]`;

  if (opts.planDetails) {
    await upsertOnboardingPlanDetails(tx, pipelineId, opts.planDetails, {});
  }

  await tx`
    INSERT INTO sales.payment_records (pipeline_id, amount, payment_date, payment_mode, notes)
    VALUES (
      ${pipelineId}::uuid,
      ${opts.paymentDetails.amount},
      ${opts.paymentDetails.paymentDate},
      ${opts.paymentDetails.paymentMode},
      ${opts.paymentDetails.notes?.trim() || null}
    )
  `;

  const quotedAmount = opts.quotedAmount;
  if (quotedAmount <= 0) {
    throw Object.assign(new Error("Deal price is required — set quoted amount at Confirm"), { status: 400 });
  }

  const totalPaid = await sumPipelinePayments(tx, pipelineId);
  const effectiveStage = resolvePaymentCloseStage(totalPaid, quotedAmount);
  if (effectiveStage === "Part Payment" && !opts.nextTouchPoint) {
    throw Object.assign(new Error("Next touch point is required while balance remains on the deal"), {
      status: 400,
    });
  }

  const stageLogMetadata = buildStageLogMetadata(effectiveStage, {
    plansShared: opts.plansShared,
    planDetails: opts.planDetails,
    quotedAmount,
    paymentDetails: opts.paymentDetails,
  });

  await tx`
    INSERT INTO sales.stage_log (pipeline_id, from_stage, to_stage, changed_by, note, next_touch_point, metadata)
    VALUES (
      ${pipelineId}::uuid,
      ${fromStage},
      ${effectiveStage},
      ${actorId}::uuid,
      ${note},
      ${opts.nextTouchPoint || null},
      ${stageLogMetadata ? tx.json(stageLogMetadata) : null}
    )
  `;

  const taskAssignee = pipeline.assignedTo ?? actorId;
  const createdTasks: ExecutePipelineDealCloseResult["createdTasks"] = [];

  await tx`
    UPDATE sales.pipeline
    SET
      stage = ${effectiveStage},
      status = 'active',
      sales_closed_by = CASE
        WHEN ${effectiveStage} = ${ONBOARDING_STAGE} THEN ${actorId}::uuid
        ELSE sales_closed_by
      END,
      updated_at = NOW()
    WHERE id = ${pipelineId}::uuid
  `;

  if (effectiveStage === ONBOARDING_STAGE) {
    await tx`
      UPDATE muas
      SET sales_closed_by = ${actorId}::uuid, updated_at = NOW()
      WHERE id = ${pipeline.muaId}::uuid
    `;
  }

  await cancelPendingSalesPipelineTasks(tx, pipelineId);

  let onboardingTaskCreated = false;
  if (effectiveStage === ONBOARDING_STAGE && taskAssignee) {
    const taskDisplayId = await generateTaskDisplayId(tx);
    await tx`
      INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
      VALUES (
        ${taskDisplayId},
        ${taskAssignee}::uuid,
        NULL,
        NULL,
        ${toDbTaskType("salesOnboarding")}::task_type,
        ${`Onboarding checklist — ${pipeline.muaName} ${pipelineRef}`},
        CURRENT_DATE,
        'pending'
      )
    `;
    createdTasks.push({ type: "salesOnboarding", assigneeId: taskAssignee, dueDate: null });
    onboardingTaskCreated = true;
    await createNotification(tx, {
      userId: taskAssignee,
      message: `Onboarding checklist — ${pipeline.muaName}`,
      link: "/sales/tasks",
    });
  } else if (effectiveStage === "Part Payment" && taskAssignee && opts.nextTouchPoint) {
    const balance = Math.max(0, quotedAmount - totalPaid);
    const taskDisplayId = await generateTaskDisplayId(tx);
    await tx`
      INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
      VALUES (
        ${taskDisplayId},
        ${taskAssignee}::uuid,
        NULL,
        NULL,
        ${toDbTaskType("salesFollowUp")}::task_type,
        ${`Part payment — collect ₹${balance.toLocaleString("en-IN")} balance — ${pipeline.muaName} ${pipelineRef}`},
        ${opts.nextTouchPoint},
        'pending'
      )
    `;
    createdTasks.push({
      type: "salesFollowUp",
      assigneeId: taskAssignee,
      dueDate: opts.nextTouchPoint ?? null,
    });
  }

  if (effectiveStage === ONBOARDING_STAGE && pipeline.muaType === "renewal") {
    await setRenewalAttemptOutcome(tx, pipelineId, "renewed");
  }

  return {
    effectiveStage,
    onboardingTaskCreated,
    totalPaid,
    quotedAmount,
    createdTasks,
  };
}
