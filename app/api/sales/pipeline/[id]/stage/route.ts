import { NextResponse } from "next/server";
import { generateTaskDisplayId, setAuditActor, withTransaction } from "@/db/index";
import { requireSalesAccess } from "@/lib/api-auth";
import { PIPELINE_STAGE_ORDER, type PipelineStage } from "@/lib/types";
import { toDbTaskType } from "@/lib/db-mappers";
import { appendSalesEventToRmComms } from "@/lib/sales-ledger";
import { COMM } from "@/lib/comm-types";
import { canPipelineTransition, isManualStageChangeTarget } from "@/lib/sales-stage-transitions";
import {
  normalizePlansShared,
  type PlanSharedRow,
  type SalesPlanDetailsInput,
  validateStagePlanPayload,
} from "@/lib/sales-plan-details";
import { upsertOnboardingPlanDetails, upsertOnboardingPlansShared } from "@/lib/sales-onboarding-upsert";
import { setRenewalAttemptOutcome } from "@/lib/sales-renewal-track";
import { processPipelineRejection } from "@/lib/sales-pipeline-rejected";
import { resolveSalesTeamLeadId } from "@/lib/sales-report-scope";
import { cancelPendingSalesPipelineTasks } from "@/lib/sales-pipeline-assign-tasks";
import { buildStageLogMetadata } from "@/lib/stage-log-plan";
import {
  loadPipelineQuotedAmount,
  resolvePaymentCloseStage,
  resolveQuotedDealAmount,
  sumPipelinePayments,
} from "@/lib/sales-deal-payment";
import { createNotification } from "@/lib/notifications";
import { ONBOARDING_STAGE } from "@/lib/sales-pipeline-stages";

type StagePayload = {
  toStage?: PipelineStage;
  note?: string;
  nextTouchPoint?: string | null;
  rescheduleOnly?: boolean;
  rejectionReason?: string;
  plansShared?: PlanSharedRow[];
  planDetails?: SalesPlanDetailsInput;
  quotedAmount?: number;
  paymentDetails?: {
    amount?: number;
    paymentDate?: string;
    paymentMode?: "UPI" | "Cash" | "Bank Transfer" | "Card" | "Other";
    notes?: string;
  };
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as StagePayload;
  const toStage = body.toStage;
  if (!toStage || !PIPELINE_STAGE_ORDER.includes(toStage)) {
    return NextResponse.json({ data: null, error: "Invalid stage" }, { status: 400 });
  }

  const trimmedNote = body.note?.trim() ?? "";
  if (trimmedNote.length < 10) {
    return NextResponse.json({ data: null, error: "Note must be at least 10 characters" }, { status: 400 });
  }

  if (toStage === "Rejected" && !body.rejectionReason?.trim()) {
    return NextResponse.json({ data: null, error: "Rejection reason required" }, { status: 400 });
  }
  if (!body.rescheduleOnly && !isManualStageChangeTarget(toStage)) {
    return NextResponse.json(
      {
        data: null,
        error: "Senior Call Done is set automatically when the TL completes the senior call task",
      },
      { status: 400 },
    );
  }
  if (toStage !== "Rejected" && toStage !== "Deal Closed" && !body.nextTouchPoint) {
    return NextResponse.json({ data: null, error: "nextTouchPoint is required" }, { status: 400 });
  }

  const plansShared = normalizePlansShared(body.plansShared);
  if (!body.rescheduleOnly) {
    const planValidation = validateStagePlanPayload(toStage, {
      plansShared,
      planDetails: body.planDetails,
      quotedAmount: body.quotedAmount,
      paymentDetails: body.paymentDetails,
    });
    if (planValidation) {
      return NextResponse.json({ data: null, error: planValidation }, { status: 400 });
    }
  }

  try {
    let stageResult: {
      toStage: PipelineStage;
      onboardingTaskCreated: boolean;
      totalPaid?: number;
      quotedAmount?: number;
    } | null = null;

    await withTransaction(async (tx) => {
      await setAuditActor(tx, auth.session.userId);
      const [pipeline] = await tx<{ stage: PipelineStage; assignedTo: string | null; muaName: string; muaId: string; teamId: string | null; muaType: string }[]>`
        SELECT p.stage::text AS stage, p.assigned_to AS "assignedTo", m.name AS "muaName", m.id AS "muaId", m.team_id AS "teamId", p.mua_type AS "muaType"
        FROM sales.pipeline p
        JOIN muas m ON m.id = p.mua_id
        WHERE p.id = ${id}::uuid
        LIMIT 1
      `;
      if (!pipeline) throw new Error("Pipeline not found");
      const fromStage = pipeline.stage;
      const pipelineRef = `[PIPE:${id}]`;

      if (fromStage === "Rejected") {
        throw Object.assign(
          new Error("Rejected pipelines must be re-assigned or junked from the Rejected queue"),
          { status: 400 },
        );
      }
      if (auth.session.role === "salesRm" && pipeline.assignedTo !== auth.session.userId) {
        throw new Error("Forbidden");
      }

      const rescheduleOnly = Boolean(body.rescheduleOnly);
      if (rescheduleOnly) {
        if (toStage !== fromStage) {
          throw Object.assign(new Error("Reschedule must keep the current stage"), { status: 400 });
        }
        if (fromStage === "Deal Closed" || fromStage === "Onboarding" || fromStage === "Rejected") {
          throw Object.assign(new Error("Cannot reschedule touch point at this stage"), { status: 400 });
        }
        if (!body.nextTouchPoint) {
          throw Object.assign(new Error("nextTouchPoint is required"), { status: 400 });
        }

        await cancelPendingSalesPipelineTasks(tx, id);

        await tx`
          INSERT INTO sales.stage_log (pipeline_id, from_stage, to_stage, changed_by, note, next_touch_point)
          VALUES (
            ${id}::uuid,
            ${fromStage},
            ${fromStage},
            ${auth.session.userId}::uuid,
            ${trimmedNote},
            ${body.nextTouchPoint}
          )
        `;

        await tx`
          UPDATE sales.pipeline SET updated_at = NOW() WHERE id = ${id}::uuid
        `;

        await tx`
          INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
          VALUES (
            ${id}::uuid,
            'noteAdded',
            ${`Follow-up rescheduled to ${body.nextTouchPoint}`},
            ${auth.session.userId}::uuid,
            ${tx.json({
              fromStage,
              nextTouchPoint: body.nextTouchPoint,
              note: trimmedNote,
              rescheduleOnly: true,
            })}
          )
        `;

        if (pipeline.assignedTo) {
          const taskDisplayId = await generateTaskDisplayId(tx);
          await tx`
            INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
            VALUES (
              ${taskDisplayId},
              ${pipeline.assignedTo}::uuid,
              NULL,
              NULL,
              ${toDbTaskType("salesFollowUp")}::task_type,
              ${`${fromStage} follow-up — ${pipeline.muaName} ${pipelineRef}`},
              ${body.nextTouchPoint},
              'pending'
            )
          `;
        }

        return;
      }

      if (!canPipelineTransition(fromStage, toStage)) {
        throw Object.assign(
          new Error(
            fromStage === "Deal Closed"
              ? "Deal Closed is final — stage cannot be changed"
              : fromStage === "Onboarding"
                ? "Onboarding — reject the MUA or complete checklists to close the deal"
                : "Invalid stage transition",
          ),
          { status: 400 },
        );
      }

      if (toStage === "Details Shared") {
        await upsertOnboardingPlansShared(tx, id, plansShared);
      }
      if (toStage === "Confirm" && body.planDetails) {
        await upsertOnboardingPlanDetails(tx, id, body.planDetails, { quotedAmount: body.quotedAmount });
      }
      if (toStage === "Deal Closed" && body.planDetails) {
        await upsertOnboardingPlanDetails(tx, id, body.planDetails, {
          ...(body.quotedAmount && body.quotedAmount > 0 ? { quotedAmount: body.quotedAmount } : {}),
        });
      }

      const cancelPendingSalesTasks = () => cancelPendingSalesPipelineTasks(tx, id);

      let effectiveStage: PipelineStage = toStage;
      let paymentSummary: { totalPaid: number; quotedAmount: number } | null = null;

      if (toStage === "Deal Closed") {
        await tx`
          INSERT INTO sales.payment_records (pipeline_id, amount, payment_date, payment_mode, notes)
          VALUES (
            ${id}::uuid,
            ${body.paymentDetails!.amount!},
            ${body.paymentDetails!.paymentDate!},
            ${body.paymentDetails!.paymentMode!},
            ${body.paymentDetails!.notes?.trim() || null}
          )
        `;
        const storedQuoted = await loadPipelineQuotedAmount(tx, id);
        const quotedAmount = resolveQuotedDealAmount(body.quotedAmount, storedQuoted);
        if (quotedAmount <= 0) {
          throw Object.assign(new Error("Deal price is required — set quoted amount at Confirm"), { status: 400 });
        }
        const totalPaid = await sumPipelinePayments(tx, id);
        effectiveStage = resolvePaymentCloseStage(totalPaid, quotedAmount);
        paymentSummary = { totalPaid, quotedAmount };
        if (effectiveStage === "Part Payment" && !body.nextTouchPoint) {
          throw Object.assign(
            new Error("Next touch point is required while balance remains on the deal"),
            { status: 400 },
          );
        }
      }

      const stageLogMetadata = buildStageLogMetadata(effectiveStage, {
        plansShared,
        planDetails: body.planDetails,
        quotedAmount: paymentSummary?.quotedAmount ?? body.quotedAmount,
        paymentDetails: body.paymentDetails,
      });

      await tx`
        INSERT INTO sales.stage_log (pipeline_id, from_stage, to_stage, changed_by, note, next_touch_point, metadata)
        VALUES (
          ${id}::uuid,
          ${fromStage},
          ${effectiveStage},
          ${auth.session.userId}::uuid,
          ${trimmedNote},
          ${body.nextTouchPoint || null},
          ${stageLogMetadata ? tx.json(stageLogMetadata) : null}
        )
      `;

      const createdTasks: Array<{ type: string; assigneeId: string | null; dueDate: string | null }> = [];

      if (toStage === "Deal Closed") {
        const taskAssignee = pipeline.assignedTo ?? auth.session.userId;

        await tx`
          UPDATE sales.pipeline
          SET
            stage = ${effectiveStage},
            status = 'active',
            sales_closed_by = CASE
              WHEN ${effectiveStage} = ${ONBOARDING_STAGE} THEN ${auth.session.userId}::uuid
              ELSE sales_closed_by
            END,
            updated_at = NOW()
          WHERE id = ${id}::uuid
        `;

        if (effectiveStage === ONBOARDING_STAGE) {
          await tx`
            UPDATE muas
            SET sales_closed_by = ${auth.session.userId}::uuid, updated_at = NOW()
            WHERE id = ${pipeline.muaId}::uuid
          `;
        }

        await cancelPendingSalesTasks();

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
        } else if (effectiveStage === "Part Payment" && taskAssignee && body.nextTouchPoint) {
          const balance = Math.max(0, (paymentSummary?.quotedAmount ?? 0) - (paymentSummary?.totalPaid ?? 0));
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
              ${body.nextTouchPoint},
              'pending'
            )
          `;
          createdTasks.push({
            type: "salesFollowUp",
            assigneeId: taskAssignee,
            dueDate: body.nextTouchPoint ?? null,
          });
        }

        if (effectiveStage === ONBOARDING_STAGE && pipeline.muaType === "renewal") {
          await setRenewalAttemptOutcome(tx, id, "renewed");
        }

        stageResult = {
          toStage: effectiveStage,
          onboardingTaskCreated,
          totalPaid: paymentSummary?.totalPaid,
          quotedAmount: paymentSummary?.quotedAmount,
        };
      } else {
        const reopen = fromStage === "Rejected";
        if (toStage === "Rejected") {
          await processPipelineRejection(tx, {
            pipelineId: id,
            muaId: pipeline.muaId,
            muaType: pipeline.muaType,
            actorId: auth.session.userId,
            rejectionReason: body.rejectionReason!.trim(),
            rejectionNote: trimmedNote,
          });
        } else if (reopen) {
          await tx`
            UPDATE sales.pipeline
            SET
              stage = ${toStage},
              status = 'active',
              rejection_reason = NULL,
              rejection_note = NULL,
              rejected_at = NULL,
              rejected_by = NULL,
              updated_at = NOW()
            WHERE id = ${id}::uuid
          `;
        } else {
          await tx`
            UPDATE sales.pipeline
            SET stage = ${toStage}, updated_at = NOW()
            WHERE id = ${id}::uuid
          `;
        }

        if (toStage !== "Rejected") {
          await cancelPendingSalesTasks();

          let assigneeId = pipeline.assignedTo;
          let taskTypeKey: "salesSeniorCall" | "salesFollowUp" = "salesFollowUp";
          let taskTitle = `${toStage} follow-up — ${pipeline.muaName} ${pipelineRef}`;

          if (toStage === "Senior Call") {
            const teamLeadId = await resolveSalesTeamLeadId(tx, {
              assignedTo: pipeline.assignedTo,
              muaTeamId: pipeline.teamId,
            });
            if (!teamLeadId) throw new Error("No active team lead configured for this pipeline");
            assigneeId = teamLeadId;
            taskTypeKey = "salesSeniorCall";
          } else if (toStage === "Senior Call Done") {
            taskTitle = `Senior call debrief — ${pipeline.muaName} ${pipelineRef}`;
          }

          if (assigneeId) {
            const taskDisplayId = await generateTaskDisplayId(tx);
            await tx`
              INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
              VALUES (
                ${taskDisplayId},
                ${assigneeId}::uuid,
                NULL,
                NULL,
                ${toDbTaskType(taskTypeKey)}::task_type,
                ${taskTitle},
                ${body.nextTouchPoint || null},
                'pending'
              )
            `;
            createdTasks.push({
              type: taskTypeKey,
              assigneeId,
              dueDate: body.nextTouchPoint || null,
            });
            if (taskTypeKey === "salesSeniorCall") {
              await createNotification(tx, {
                userId: assigneeId,
                message: `Senior call scheduled ${body.nextTouchPoint ?? "today"} — ${pipeline.muaName}`,
                link: "/sales/tasks",
              });
            }
          }
        }
      }

      await tx`
        INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
        VALUES (
          ${id}::uuid,
          'stageChanged',
          ${`Stage moved: ${fromStage} → ${effectiveStage}`},
          ${auth.session.userId}::uuid,
          ${tx.json({
            fromStage,
            toStage: effectiveStage,
            nextTouchPoint: body.nextTouchPoint ?? null,
            note: trimmedNote,
            rejectionReason: body.rejectionReason ?? null,
            plansShared: toStage === "Details Shared" ? plansShared : undefined,
            planDetails: body.planDetails ?? undefined,
            quotedAmount: body.quotedAmount ?? undefined,
            paymentDetails: body.paymentDetails ?? null,
            tasksCreated: createdTasks,
          })}
        )
      `;
      await appendSalesEventToRmComms(tx, {
        muaId: pipeline.muaId,
        actorId: auth.session.userId,
        entryType: COMM.stageUpdated,
        description: `[Sales] Stage moved: ${fromStage} → ${effectiveStage}`,
        metadata: {
          pipelineId: id,
          fromStage,
          toStage: effectiveStage,
          nextTouchPoint: body.nextTouchPoint ?? null,
          note: trimmedNote,
          rejectionReason: body.rejectionReason ?? null,
          tasksCreated: createdTasks,
        },
      });
    });

    return NextResponse.json({
      data: { ok: true, ...(stageResult ?? { toStage, onboardingTaskCreated: false }) },
      error: null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stage update failed";
    const status =
      typeof e === "object" && e && "status" in e
        ? Number((e as { status: number }).status)
        : message === "Forbidden"
          ? 403
          : 500;
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
