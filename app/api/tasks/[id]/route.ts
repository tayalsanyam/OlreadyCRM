import { NextResponse } from "next/server";
import {
  appendComm,
  insertAuditLog,
  withTransaction,
  generateTaskDisplayId,
} from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { COMM } from "@/lib/comm-types";
import { toDbPushOutcome, toDbPushStage } from "@/lib/db-mappers";
import { createNotification } from "@/lib/notifications";
import { cancelPendingMuaTasks } from "@/lib/task-duplicates";
import { closePushAndClearTasks } from "@/lib/stage-tasks";
import { cancelPendingSalesPipelineTasks } from "@/lib/sales-pipeline-assign-tasks";
import { isSalesOnboardingPipelineReady } from "@/lib/sales-onboarding-task";
import {
  activationSendBackPipelineId,
  isActivationSendBackTaskTitle,
} from "@/lib/sales-activation-send-back";
import { resolveSalesTeamLeadId } from "@/lib/sales-report-scope";
import { buildStageLogMetadata } from "@/lib/stage-log-plan";
import { applySeniorCallDone, SENIOR_CALL_DONE_STAGE } from "@/lib/sales-senior-call-done";
import { taskRequiresPushCompletion, isFinancialFollowUpTask, isPostBookingFollowUpTitle, parseCommissionBookingIdFromTitle } from "@/lib/task-utils";
import {
  completeReferralIntakeWithPhone,
  dismissReferralIntake,
  rescheduleFeedbackTask,
} from "@/lib/feedback-referral-intake";
import {
  closeFeedbackNoContact,
  logFeedbackFollowUpAttempt,
} from "@/lib/feedback-submit";
import {
  applyLeadHostileExit,
  cancelPendingLeadIntakeTasks,
  countActiveDistinctMuasPushedForIntake,
  INTAKE_MIN_PROFILES,
  logConfirmationNoAnswer,
  scheduleBrideConfirmationTask,
  scheduleShareProfilesTask,
  reconcileInitialContactTasksForLead,
} from "@/lib/lead-intake-tasks";
import { scheduleCommissionHandoverTasks } from "@/lib/commission-handover";
import { requireActiveCommissionRm } from "@/lib/commission-rm-staff";
import {
  COMMISSION_NI_ARCHIVE_HANDOVER,
  LEAD_EXIT_LABELS,
  RM_NI_ARCHIVE_HANDOVER,
  toDbExitMarkedByRole,
} from "@/lib/lead-exit";
import type { NotInterestedIntakeMode, IntakeConfirmationDraft } from "@/lib/lead-intake-config";
import { applyIntakeConfirmationData } from "@/lib/intake-confirmation-persist";
import { scheduleUploaderReviewTask } from "@/lib/uploader-review-task";
import { refreshLeadPhase } from "@/lib/lead-phase";
import { reschedulePostBookingFollowUp } from "@/lib/post-booking-tasks";
import { syncCommissionCollectionAfterPayment } from "@/lib/commission-collection-tasks";
import {
  applyBookingFinancialUpdate,
  loadBookingFinancialRow,
  type BookingFinancialUpdateInput,
} from "@/lib/booking-financial-update";
import { leadTracksCommission } from "@/lib/lead-commission";
import { leadTracksCommissionSync } from "@/lib/lead-tracks-commission";
import { normalizePhoneDigits } from "@/lib/validation";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { canPipelineTransition } from "@/lib/sales-stage-transitions";
import type { BrideConfirmationOutcome, MuaPushStage, PipelineStage, TaskCloseOutcome } from "@/lib/types";

export interface TaskCompleteBody {
  status?: string;
  note?: string;
  stage?: MuaPushStage;
  nextFollowUpDate?: string;
  completionMode?: "followingUp" | "closing";
  closeOutcome?: TaskCloseOutcome;
  prospectInsta?: string;
  prospectPhone?: string;
  prospectCity?: string;
  referralName?: string;
  referralPhone?: string;
  stageChangeTo?: PipelineStage;
  stageChangeNote?: string;
  skipFollowUpSchedule?: boolean;
  intakeOutcome?: BrideConfirmationOutcome;
  commissionRmId?: string;
  notInterestedMode?: NotInterestedIntakeMode;
  intakeConfirmation?: IntakeConfirmationDraft | null;
  financialUpdates?: (BookingFinancialUpdateInput & { bookingId: string })[];
}

function parsePipelineIdFromTaskTitle(title: string): string | null {
  const m = title.match(/\[PIPE:([^\]]+)\]/);
  return m?.[1] ?? null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as TaskCompleteBody;

  if (body.status !== "done") {
    return NextResponse.json(
      { data: null, error: "Only status=done is supported" },
      { status: 400 }
    );
  }

  const note = body.note?.trim() ?? "";
  if (note.length < 10) {
    return NextResponse.json(
      { data: null, error: "Completion notes must be at least 10 characters" },
      { status: 400 }
    );
  }

  if (USE_MOCK) {
    try {
      mockStore.completeTask(id, {
        note,
        stage: body.stage,
        nextFollowUpDate: body.nextFollowUpDate,
      });
      return NextResponse.json({ data: { ok: true }, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Update failed";
      return NextResponse.json({ data: null, error: message }, { status: 400 });
    }
  }

  try {
    await withTransaction(async (tx) => {
      const [task] = await tx<{
        id: string;
        taskType: string;
        pushId: string | null;
        staffId: string;
        leadId: string | null;
        title: string;
      }[]>`
        SELECT
          id,
          task_type AS "taskType",
          push_id AS "pushId",
          staff_id AS "staffId",
          lead_id AS "leadId",
          title
        FROM rm_tasks
        WHERE id = ${id}::uuid AND staff_id = ${auth.session.userId}::uuid
      `;
      if (!task) throw new Error("Task not found");

      if (
        task.taskType === "sales_senior_call" &&
        auth.session.role !== "salesTl" &&
        auth.session.role !== "admin"
      ) {
        throw new Error("Only Sales TL/Admin can complete Senior Call tasks");
      }
      if (
        task.taskType === "sales_senior_call" &&
        !body.nextFollowUpDate &&
        !body.skipFollowUpSchedule
      ) {
        throw new Error("RM next follow-up date is required when completing a senior call");
      }
      if (
        task.taskType === "sales_follow_up" &&
        !body.nextFollowUpDate &&
        !body.skipFollowUpSchedule &&
        !isActivationSendBackTaskTitle(task.title)
      ) {
        throw new Error("Next follow-up date is required for sales follow-up tasks");
      }
      if (task.taskType === "sales_onboarding") {
        const pipelineId = parsePipelineIdFromTaskTitle(task.title);
        if (!pipelineId) throw new Error("Pipeline not linked to onboarding task");
        const ready = await isSalesOnboardingPipelineReady(tx, pipelineId);
        if (!ready) {
          throw new Error(
            "Complete all onboarding checklists and training first — this task auto-completes when training is done",
          );
        }
      }
      if (isActivationSendBackTaskTitle(task.title)) {
        const pipelineId = activationSendBackPipelineId(task.title);
        if (!pipelineId) throw new Error("Pipeline not linked to activation send-back task");
        const [row] = await tx<{ sentBackAt: string | null; trainingComplete: boolean }[]>`
          SELECT
            al.sent_back_at AS "sentBackAt",
            COALESCE(tr.complete, false) AS "trainingComplete"
          FROM sales.pipeline p
          LEFT JOIN sales.activation_log al ON al.pipeline_id = p.id
          LEFT JOIN sales.training tr ON tr.pipeline_id = p.id
          WHERE p.id = ${pipelineId}::uuid
          LIMIT 1
        `;
        if (row?.sentBackAt && !row.trainingComplete) {
          throw new Error(
            "Fix training on the Checklists tab first — this task completes automatically when training is saved",
          );
        }
      }

      const needsPush = taskRequiresPushCompletion(
        task.taskType,
        task.pushId,
        task.title
      );
      const isFinancialFollowUp = isFinancialFollowUpTask({
        taskType: task.taskType,
        title: task.title,
      });
      const isProspect = task.taskType === "collect_mua_prospect";
      const isFeedbackFollowUp = task.taskType === "feedback_follow_up";
      const isReferralFollowUp = task.taskType === "feedback_referral_follow_up";
      const isBrideConfirmation = task.taskType === "bride_confirmation";
      const isShareProfiles = task.taskType === "share_profiles";
      const isLeadProgressFollowUp = task.taskType === "lead_progress_follow_up";

      if (isFinancialFollowUp) {
        if (!task.leadId) throw new Error("Lead missing on payment follow-up task");

        if (body.financialUpdates?.length) {
          const elevated =
            auth.session.role === "admin" || auth.session.role === "owner";
          for (const item of body.financialUpdates) {
            const { bookingId, ...patch } = item;
            const hasPatch = Object.values(patch).some((v) => v !== undefined);
            if (!hasPatch) continue;

            const existing = await loadBookingFinancialRow(tx, bookingId);
            if (!existing) throw new Error("Booking not found");

            const leadTracks = await leadTracksCommission(existing.leadId);
            const allowCommission =
              leadTracks ||
              (elevated &&
                (existing.commissionAmount != null ||
                  patch.commissionAmount !== undefined ||
                  patch.commissionPaid !== undefined));

            await applyBookingFinancialUpdate(tx, {
              existing,
              body: patch,
              actorId: auth.session.userId,
              allowCommission,
              source: "task_completion",
              scheduleCommissionFollowUpTask: false,
            });
          }
        }

        await appendComm(tx, {
          leadId: task.leadId,
          entryType: COMM.note,
          description: `Payment follow-up (${task.title}): ${note}`,
          actorId: auth.session.userId,
        });

        if (body.nextFollowUpDate?.trim()) {
          if (isPostBookingFollowUpTitle(task.title)) {
            const [leadRow] = await tx<{
              brideName: string;
              muaId: string | null;
            }[]>`
              SELECT bl.bride_name AS "brideName", mp.mua_id AS "muaId"
              FROM bride_leads bl
              LEFT JOIN mua_pushes mp ON mp.id = ${task.pushId}::uuid
              WHERE bl.id = ${task.leadId}::uuid
            `;
            await reschedulePostBookingFollowUp(tx, {
              leadId: task.leadId,
              staffId: task.staffId,
              pushId: task.pushId,
              muaId: leadRow?.muaId ?? null,
              brideName: leadRow?.brideName ?? "Lead",
              actorId: auth.session.userId,
              dueDate: body.nextFollowUpDate.trim(),
            });
          } else {
            const bookingId = parseCommissionBookingIdFromTitle(task.title);
            if (!bookingId) {
              throw new Error("Booking reference missing on commission task");
            }
            const [booking] = await tx<{
              leadId: string;
              pushId: string | null;
              bookingDate: string;
              commissionAmount: number | null;
              commissionPaid: number | null;
              commissionNextFollowUpAt: string | null;
              brideName: string;
              muaName: string;
              ceremonyType: string;
              shiftedAt: string | null;
              leadStatus: string;
              assignedRmId: string | null;
              pushedBy: string | null;
            }[]>`
              SELECT
                b.lead_id AS "leadId",
                b.push_id AS "pushId",
                b.booking_date::text AS "bookingDate",
                b.commission_amount AS "commissionAmount",
                b.commission_paid AS "commissionPaid",
                b.commission_next_follow_up_at::text AS "commissionNextFollowUpAt",
                bl.bride_name AS "brideName",
                m.name AS "muaName",
                le.ceremony_type AS "ceremonyType",
                bl.shifted_at AS "shiftedAt",
                bl.status::text AS "leadStatus",
                bl.assigned_rm_id AS "assignedRmId",
                mp.pushed_by AS "pushedBy"
              FROM bookings b
              JOIN bride_leads bl ON bl.id = b.lead_id
              JOIN lead_events le ON le.id = b.event_id
              JOIN muas m ON m.id = b.mua_id
              LEFT JOIN mua_pushes mp ON mp.id = b.push_id
              WHERE b.id = ${bookingId}::uuid
            `;
            if (!booking) throw new Error("Booking not found for commission task");
            await syncCommissionCollectionAfterPayment(tx, {
              bookingId,
              leadId: booking.leadId,
              pushId: booking.pushId,
              bookingDate: booking.bookingDate,
              commissionAmount: booking.commissionAmount,
              commissionPaid: booking.commissionPaid,
              commissionNextFollowUpAt: body.nextFollowUpDate.trim(),
              muaName: booking.muaName,
              brideName: booking.brideName,
              ceremonyLabel: booking.ceremonyType,
              isCommissionLead: leadTracksCommissionSync({
                shiftedAt: booking.shiftedAt,
                status: booking.leadStatus,
              }),
              assignedRmId: booking.assignedRmId,
              pushedBy: booking.pushedBy,
              actorId: auth.session.userId,
              scheduleFollowUpTask: true,
            });
          }
        }
      }

      if (isBrideConfirmation) {
        if (!body.intakeOutcome) {
          throw new Error("Select a confirmation outcome");
        }
        if (!task.leadId) throw new Error("Lead missing on confirmation task");

        const [leadRow] = await tx<{
          brideName: string;
          displayId: string;
          status: string;
        }[]>`
          SELECT bride_name AS "brideName", display_id AS "displayId", status
          FROM bride_leads WHERE id = ${task.leadId}::uuid
        `;
        if (!leadRow) throw new Error("Lead not found");

        if (body.intakeOutcome === "confirmed") {
          await applyIntakeConfirmationData(tx, {
            leadId: task.leadId,
            actorId: auth.session.userId,
            events: body.intakeConfirmation?.events,
            makeupLook: body.intakeConfirmation?.makeupLook ?? null,
          });
          await tx`
            UPDATE bride_leads SET
              confirmation_status = 'confirmed',
              requirements_confirmed_at = NOW(),
              updated_at = NOW()
            WHERE id = ${task.leadId}::uuid
          `;
          await scheduleShareProfilesTask(tx, {
            leadId: task.leadId,
            staffId: task.staffId,
            brideName: leadRow.brideName,
            displayId: leadRow.displayId,
            actorId: auth.session.userId,
          });
          await reconcileInitialContactTasksForLead(tx, {
            leadId: task.leadId,
            staffId: task.staffId,
            actorId: auth.session.userId,
          });
        } else if (body.intakeOutcome === "no_answer") {
          if (!body.nextFollowUpDate?.trim()) {
            throw new Error("Call back date is required for no-answer");
          }
          const { autoHostile } = await logConfirmationNoAnswer(tx, {
            leadId: task.leadId,
            staffId: task.staffId,
            note,
            actorId: auth.session.userId,
          });
          if (autoHostile) {
            await applyLeadHostileExit(tx, {
              leadId: task.leadId,
              note,
              actorId: auth.session.userId,
              actorName: auth.session.name,
              actorRole: auth.session.role,
            });
          } else {
            await scheduleBrideConfirmationTask(tx, {
              leadId: task.leadId,
              staffId: task.staffId,
              brideName: leadRow.brideName,
              displayId: leadRow.displayId,
              actorId: auth.session.userId,
              dueDate: body.nextFollowUpDate!.trim(),
              excludeTaskId: id,
            });
          }
        } else if (body.intakeOutcome === "not_interested") {
          await cancelPendingLeadIntakeTasks(tx, {
            leadId: task.leadId,
            excludeTaskId: id,
          });
          const niMode: NotInterestedIntakeMode =
            body.notInterestedMode ??
            (auth.session.role === "commissionRm" ? "archive" : "commission");

          if (niMode === "archive" || auth.session.role === "commissionRm") {
            const handoverDefault =
              auth.session.role === "commissionRm"
                ? COMMISSION_NI_ARCHIVE_HANDOVER
                : RM_NI_ARCHIVE_HANDOVER;
            const [archived] = await tx<{ displayId: string; brideName: string }[]>`
              UPDATE bride_leads SET
                status = 'archived',
                handover_reason = COALESCE(
                  NULLIF(TRIM(handover_reason), ''),
                  ${handoverDefault}
                ),
                exit_marked_by_role = ${toDbExitMarkedByRole(auth.session.role)},
                uploader_confirmation = NULL,
                uploader_confirmed_at = NULL,
                uploader_confirmed_by = NULL,
                updated_at = NOW()
              WHERE id = ${task.leadId}::uuid
              RETURNING display_id AS "displayId", bride_name AS "brideName"
            `;
            await appendComm(tx, {
              leadId: task.leadId,
              entryType: COMM.note,
              description: `${LEAD_EXIT_LABELS.notInterested} — archived via confirmation task`,
              actorId: auth.session.userId,
            });
            if (archived) {
              await scheduleUploaderReviewTask(tx, {
                leadId: task.leadId,
                displayId: archived.displayId,
                brideName: archived.brideName,
                reason: "archived_confirm",
                assignedBy: auth.session.userId,
              });
            }
          } else if (auth.session.role === "regionalRm") {
            if (!body.commissionRmId?.trim()) {
              throw new Error("Select a Commission RM to shift this lead to");
            }
            const commissionRm = await requireActiveCommissionRm(
              tx,
              body.commissionRmId.trim()
            );
            const [shifted] = await tx<{ displayId: string; shiftedAt: string }[]>`
              UPDATE bride_leads SET
                status = 'commission_rm',
                assigned_rm_id = ${commissionRm.id}::uuid,
                assignment_date = NULL,
                handover_reason = 'Not Interested in Plan MUAs',
                exit_marked_by_role = ${toDbExitMarkedByRole(auth.session.role)},
                shifted_at = NOW(),
                updated_at = NOW()
              WHERE id = ${task.leadId}::uuid
              RETURNING display_id AS "displayId", shifted_at AS "shiftedAt"
            `;
            await appendComm(tx, {
              leadId: task.leadId,
              entryType: COMM.shiftedCommission,
              description: `${LEAD_EXIT_LABELS.notInterested} — shifted to ${commissionRm.name} via confirmation task`,
              actorId: auth.session.userId,
            });
            if (shifted?.displayId) {
              await scheduleCommissionHandoverTasks(tx, {
                leadId: task.leadId,
                displayId: shifted.displayId,
                handoverReason: "Not Interested in Plan MUAs",
                commissionRmId: commissionRm.id,
                actorId: auth.session.userId,
                previousStaffId: task.staffId,
                intakeMode: "regional_shift",
              });
            }
          } else {
            throw new Error("Forbidden");
          }
        }
      }

      if (isShareProfiles) {
        if (!task.leadId) throw new Error("Lead missing on share-profiles task");
        const count = await countActiveDistinctMuasPushedForIntake(tx, task.leadId);
        if (count < INTAKE_MIN_PROFILES) {
          throw new Error(
            `Share at least ${INTAKE_MIN_PROFILES} active profiles first (${count}/${INTAKE_MIN_PROFILES})`
          );
        }
      }

      if (isLeadProgressFollowUp && task.leadId) {
        await tx`
          UPDATE bride_leads SET
            last_progress_follow_up_at = NOW(),
            updated_at = NOW()
          WHERE id = ${task.leadId}::uuid
        `;
      }

      if (isReferralFollowUp && body.referralPhone?.trim() && body.referralName?.trim()) {
        if (!task.leadId) throw new Error("Lead missing on referral task");
        await completeReferralIntakeWithPhone(tx, id, {
          staffId: auth.session.userId,
          referralName: body.referralName.trim(),
          referralPhone: body.referralPhone.trim(),
          leadId: task.leadId,
        });
      } else if (isFeedbackFollowUp || isReferralFollowUp) {
        if (body.completionMode === "closing") {
          if (isReferralFollowUp) {
            await dismissReferralIntake(tx, id);
          } else if (isFeedbackFollowUp) {
            if (!task.leadId) throw new Error("Lead missing on feedback task");
            await closeFeedbackNoContact(
              task.leadId,
              auth.session.userId,
              body.note?.trim()
            );
          }
        } else if (body.completionMode === "followingUp") {
          if (!body.nextFollowUpDate) {
            throw new Error("Next follow-up date is required");
          }
          if (!task.leadId) throw new Error("Lead missing on feedback task");
          if (isFeedbackFollowUp) {
            await logFeedbackFollowUpAttempt(
              task.leadId,
              auth.session.userId,
              body.nextFollowUpDate,
              body.note?.trim(),
              "callback"
            );
          }
          const newTaskId = await rescheduleFeedbackTask(tx, {
            staffId: task.staffId,
            leadId: task.leadId,
            taskType: isReferralFollowUp
              ? "feedback_referral_follow_up"
              : "feedback_follow_up",
            title: task.title,
            dueDate: body.nextFollowUpDate,
          });
          if (isReferralFollowUp) {
            await tx`
              UPDATE feedback_referral_intake SET
                task_id = ${newTaskId}::uuid,
                updated_at = NOW()
              WHERE task_id = ${id}::uuid AND status = 'pending'
            `;
          }
          await createNotification(tx, {
            userId: task.staffId,
            message: `Follow-up scheduled ${body.nextFollowUpDate} — ${task.title}`,
            link: `/feedback/tasks`,
          });
        } else if (isReferralFollowUp) {
          throw new Error(
            "Choose following up (reschedule), close (no referral), or enter referral name + phone"
          );
        }
      }

      if (isProspect) {
        const city = body.prospectCity?.trim() ?? "";
        const insta = body.prospectInsta?.trim() ?? "";
        const phone = body.prospectPhone?.trim()
          ? normalizePhoneDigits(body.prospectPhone)
          : "";
        if (!city || (!insta && !phone)) {
          throw new Error("City and Instagram or phone are required");
        }
        await tx`
          UPDATE mua_prospects SET
            insta_id = ${insta || null},
            phone = ${phone || null},
            city = ${city},
            status = 'collected',
            updated_at = NOW()
          WHERE task_id = ${id}::uuid
        `;
      }

      if (needsPush) {
        if (body.completionMode === "closing") {
          if (!body.closeOutcome) throw new Error("Close outcome is required");
        } else {
          if (!body.stage) throw new Error("Stage is required");
          if (!body.nextFollowUpDate) {
            throw new Error("Next follow-up date is required");
          }
        }
      }

      await tx`
        UPDATE rm_tasks SET status = 'done', updated_at = NOW()
        WHERE id = ${id}::uuid
      `;

      if (needsPush && task.pushId) {
        const [push] = await tx<{
          status: string;
          muaId: string;
          muaName: string;
          brideName: string;
        }[]>`
          SELECT mp.status, mp.mua_id AS "muaId", m.name AS "muaName", bl.bride_name AS "brideName"
          FROM mua_pushes mp
          JOIN muas m ON m.id = mp.mua_id
          JOIN bride_leads bl ON bl.id = mp.lead_id
          WHERE mp.id = ${task.pushId}::uuid
        `;
        if (!push) throw new Error("Push not found");

        if (body.completionMode === "closing") {
          if (body.closeOutcome === "booked") {
            await tx`
              UPDATE mua_pushes SET
                status = 'booked',
                stage = 'bride_selected',
                updated_at = NOW()
              WHERE id = ${task.pushId}::uuid
            `;
            await appendComm(tx, {
              leadId: task.leadId!,
              muaId: push.muaId,
              entryType: COMM.stageUpdated,
              description: `${note} (marked booked via task)`,
              actorId: auth.session.userId,
              metadata: { pushId: task.pushId, taskId: id },
            });
          } else {
            const dbOutcome = toDbPushOutcome(body.closeOutcome!);
            if (!dbOutcome) throw new Error("Invalid close outcome");
            await tx`
              UPDATE mua_pushes SET
                status = 'closed',
                outcome = ${dbOutcome}::text::push_outcome,
                closed_at = NOW(),
                updated_at = NOW()
              WHERE id = ${task.pushId}::uuid
            `;
            await closePushAndClearTasks(tx, task.pushId);
            await appendComm(tx, {
              leadId: task.leadId!,
              muaId: push.muaId,
              entryType: COMM.conversationClosed,
              description: note,
              actorId: auth.session.userId,
            });
          }
        } else {
          const dbStage = toDbPushStage(body.stage!);
          await tx`
            UPDATE mua_pushes SET stage = ${dbStage}::mua_push_stage, updated_at = NOW()
            WHERE id = ${task.pushId}::uuid
          `;
          await appendComm(tx, {
            leadId: task.leadId!,
            muaId: push.muaId,
            entryType: COMM.stageUpdated,
            description: note,
            actorId: auth.session.userId,
            metadata: { stage: body.stage, pushId: task.pushId, taskId: id },
          });

          if (push.status === "active") {
            await cancelPendingMuaTasks(tx, {
              pushId: task.pushId,
              excludeTaskId: id,
            });
            const title = `Follow up — ${push.muaName} / ${push.brideName}`;
            const nextId = await generateTaskDisplayId(tx);
            await tx`
              INSERT INTO rm_tasks (
                display_id, staff_id, lead_id, push_id, task_type, title, due_date
              ) VALUES (
                ${nextId},
                ${task.staffId}::uuid,
                ${task.leadId}::uuid,
                ${task.pushId}::uuid,
                'follow_up',
                ${title},
                ${body.nextFollowUpDate!}::date
              )
            `;
            await createNotification(tx, {
              userId: task.staffId,
              message: `Follow-up scheduled ${body.nextFollowUpDate} — ${push.muaName} / ${push.brideName}`,
              link: `/rm/tasks`,
            });
          }
        }
      } else if (task.taskType.startsWith("sales_")) {
        const pipelineId = parsePipelineIdFromTaskTitle(task.title);
        if (pipelineId) {
          const [pipeline] = await tx<{
            stage: PipelineStage;
            muaName: string;
            assignedTo: string | null;
            muaTeamId: string | null;
          }[]>`
            SELECT
              p.stage::text AS stage,
              m.name AS "muaName",
              p.assigned_to AS "assignedTo",
              m.team_id AS "muaTeamId"
            FROM sales.pipeline p
            JOIN muas m ON m.id = p.mua_id
            WHERE p.id = ${pipelineId}::uuid
            LIMIT 1
          `;
          if (!pipeline) throw new Error("Pipeline not found");

          if (task.taskType === "sales_senior_call" && !body.skipFollowUpSchedule) {
            if (body.stageChangeTo && body.stageChangeTo !== SENIOR_CALL_DONE_STAGE) {
              throw new Error("Senior call completion moves the deal to Senior Call Done only");
            }
            if (!body.nextFollowUpDate) {
              throw new Error("RM next follow-up date is required when completing a senior call");
            }
            if (!pipeline.assignedTo) {
              throw new Error("Pipeline has no assigned RM — assign an RM before completing senior call");
            }
            await applySeniorCallDone(tx, {
              pipelineId,
              fromStage: pipeline.stage,
              actorId: auth.session.userId,
              muaName: pipeline.muaName,
              assignedRmId: pipeline.assignedTo,
              seniorNote: note,
              rmNextFollowUpDate: body.nextFollowUpDate!,
              source: "taskCompletion",
              taskId: id,
            });
          } else if (body.stageChangeTo) {
            const stageNote = body.stageChangeNote?.trim() ?? "";
            if (stageNote.length < 10) throw new Error("Stage update note must be at least 10 characters");
            if (!canPipelineTransition(pipeline.stage, body.stageChangeTo)) {
              throw new Error("Invalid stage transition");
            }
            await tx`
              INSERT INTO sales.stage_log (pipeline_id, from_stage, to_stage, changed_by, note, next_touch_point)
              VALUES (
                ${pipelineId}::uuid,
                ${pipeline.stage},
                ${body.stageChangeTo},
                ${auth.session.userId}::uuid,
                ${stageNote},
                ${body.nextFollowUpDate || null}
              )
            `;
            const reopen = pipeline.stage === "Rejected" && body.stageChangeTo !== "Deal Closed";
            await tx`
              UPDATE sales.pipeline
              SET
                stage = ${body.stageChangeTo},
                status = CASE WHEN ${reopen} THEN 'active' ELSE status END,
                updated_at = NOW()
              WHERE id = ${pipelineId}::uuid
            `;
            await tx`
              INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
              VALUES (
                ${pipelineId}::uuid,
                'stageChanged',
                ${`Stage moved: ${pipeline.stage} → ${body.stageChangeTo}`},
                ${auth.session.userId}::uuid,
                ${tx.json({
                  fromStage: pipeline.stage,
                  toStage: body.stageChangeTo,
                  note: stageNote,
                  nextTouchPoint: body.nextFollowUpDate ?? null,
                  source: "taskCompletion",
                  taskId: id,
                })}
              )
            `;
            await cancelPendingSalesPipelineTasks(tx, pipelineId);
          }

          await tx`
            INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id, metadata)
            VALUES (
              ${pipelineId}::uuid,
              'noteAdded',
              ${`Task completed (${task.title}): ${note}`},
              ${auth.session.userId}::uuid,
              ${tx.json({ taskId: id, taskType: task.taskType })}
            )
          `;
          if (
            !body.skipFollowUpSchedule &&
            task.taskType === "sales_follow_up" &&
            body.nextFollowUpDate
          ) {
            const nextTaskType = body.stageChangeTo === "Senior Call" ? "sales_senior_call" : "sales_follow_up";
            const nextTaskLabel = nextTaskType === "sales_senior_call" ? "Senior Call" : "Follow Up";
            let nextAssigneeId = pipeline?.assignedTo ?? null;
            if (nextTaskType === "sales_senior_call") {
              nextAssigneeId = await resolveSalesTeamLeadId(tx, {
                assignedTo: pipeline?.assignedTo ?? null,
                muaTeamId: pipeline?.muaTeamId ?? null,
              });
              if (!nextAssigneeId) {
                throw new Error("No active team lead configured for this pipeline");
              }
            } else if (!nextAssigneeId) {
              nextAssigneeId = null;
            }
            if (nextAssigneeId) {
              const taskDisplayId = await generateTaskDisplayId(tx);
              await tx`
                INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
                VALUES (
                  ${taskDisplayId},
                  ${nextAssigneeId}::uuid,
                  NULL,
                  NULL,
                  ${nextTaskType}::task_type,
                  ${`${nextTaskLabel} — ${pipeline!.muaName} [PIPE:${pipelineId}]`},
                  ${body.nextFollowUpDate}::date,
                  'pending'
                )
              `;
              await createNotification(tx, {
                userId: nextAssigneeId,
                message: `${nextTaskLabel} scheduled ${body.nextFollowUpDate} — ${pipeline!.muaName}`,
                link: `/sales/tasks`,
              });
            }
          }
        }
      } else if (task.leadId) {
        await appendComm(tx, {
          leadId: task.leadId,
          entryType: COMM.note,
          description: `Task completed (${task.title}): ${note}`,
          actorId: auth.session.userId,
          metadata: { taskId: id },
        });
      }

      await insertAuditLog(tx, {
        tableName: "rm_tasks",
        recordId: id,
        action: "complete",
        actorId: auth.session.userId,
        changes: {
          note,
          stage: body.stage ?? null,
          nextFollowUpDate: body.nextFollowUpDate ?? null,
        },
      });

      if (task.leadId) {
        await refreshLeadPhase(tx, task.leadId);
      }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }

  return NextResponse.json({ data: { ok: true }, error: null });
}
