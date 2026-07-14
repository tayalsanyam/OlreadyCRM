import type { TransactionSql } from "@/db/index";
import {
  cancelPendingPrimaryCareTasks,
  createFollowUpFromTaskComplete,
  createStatusChangeCareTask,
  createWorkflowCareTask,
  followUpTaskTypeForTicketStatus,
  hasOpenPrimaryCareTask,
  stageFollowUpTitle,
} from "@/lib/ticket-care-workflow";
import { setTicketStatus } from "@/lib/ticket-email-workflow";
import { notifyCareIncharge, notifyTicketStakeholders } from "@/lib/ticket-admin-watch";
import { getTicketById } from "@/lib/ticket-create";
import { logCareComm } from "@/lib/ticket-ledger";
import { isGrievanceOperator } from "@/lib/ticket-access";
import { allowedTicketStatusesOnComplete } from "@/lib/care-task-status-options";
import type { TicketStatus } from "@/lib/types";

export type CompleteCareTaskInput = {
  taskId: string;
  actorId: string;
  actorRole: string;
  summary: string;
  outcome?: string | null;
  nextFollowUpAt?: string | null;
  ticketStatus?: TicketStatus | null;
  sendBack?: boolean;
  sendBackNote?: string | null;
  taskPayload?: Record<string, unknown>;
};

type TaskRow = {
  id: string;
  ticketId: string;
  taskType: string;
  assignedTo: string | null;
  title: string;
  status: string;
  taskPayload: Record<string, unknown>;
};

function taskPayloadRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function requiresTaskContinuity(
  task: TaskRow,
  ticketStatus: TicketStatus,
  actorRole: string
): boolean {
  if (ticketStatus === "closed") return false;
  if (!isGrievanceOperator(actorRole)) return false;
  if (task.taskType === "admin_review") return false;
  if (task.taskPayload.adminLoopIn === true) return false;
  if (task.taskPayload.emailApproval === true) return false;
  return true;
}

function hasTaskContinuity(
  input: CompleteCareTaskInput,
  ticketStatus: TicketStatus
): boolean {
  if (input.ticketStatus === "closed") return true;
  if (input.nextFollowUpAt) return true;
  if (input.ticketStatus && input.ticketStatus !== ticketStatus) return true;
  return false;
}

export async function completeCareTask(
  tx: TransactionSql,
  input: CompleteCareTaskInput
): Promise<{ ok: true } | { error: string; status: number }> {
  const [task] = await tx<TaskRow[]>`
    SELECT
      id,
      ticket_id AS "ticketId",
      task_type::text AS "taskType",
      assigned_to AS "assignedTo",
      title,
      status::text AS status,
      COALESCE(task_payload, '{}'::jsonb) AS "taskPayload"
    FROM support.ticket_tasks
    WHERE id = ${input.taskId}::uuid
  `;

  if (!task) return { error: "Task not found", status: 404 };
  if (task.status === "done") return { error: "Task already completed", status: 409 };
  if (task.status === "cancelled") {
    return { error: "This task was cancelled (superseded by a newer step)", status: 409 };
  }

  const canComplete =
    task.assignedTo === input.actorId || isGrievanceOperator(input.actorRole);
  if (!canComplete) return { error: "Forbidden", status: 403 };

  const ticket = await getTicketById(tx, task.ticketId);
  if (!ticket) return { error: "Ticket not found", status: 404 };

  if (input.sendBack) {
    return completeCareTaskSendBack(tx, { task, ticket, input });
  }

  const isEmailApprovalTask = task.taskPayload.emailApproval === true;
  const isEmailWorkflowTask =
    (task.taskType === "send_email" || task.taskType === "draft_response") &&
    !isEmailApprovalTask;
  const primaryStillOpen =
    isEmailWorkflowTask &&
    isGrievanceOperator(input.actorRole) &&
    ticket.status !== "closed" &&
    (await hasOpenPrimaryCareTask(tx, task.ticketId, task.id));

  if (
    requiresTaskContinuity(task, ticket.status, input.actorRole) ||
    primaryStillOpen
  ) {
    if (!hasTaskContinuity(input, ticket.status)) {
      return {
        error: primaryStillOpen
          ? "This ticket still has an open stage task — advance the ticket stage or set a follow-up before completing the email task."
          : "Set a next follow-up date or advance the ticket stage (or close the ticket) so work continues on this case.",
        status: 400,
      };
    }
  }

  if (input.ticketStatus) {
    const allowed = allowedTicketStatusesOnComplete(
      input.actorRole,
      task.taskType,
      ticket.status,
      ticket.raisedByType
    );
    if (!allowed.includes(input.ticketStatus)) {
      return { error: "Ticket status change not allowed for this task", status: 400 };
    }
  }

  const payload = {
    ...(input.taskPayload ?? {}),
    outcome: input.outcome ?? null,
    summary: input.summary,
    completedAt: new Date().toISOString(),
  };

  await tx`
    UPDATE support.ticket_tasks
    SET
      status = 'done',
      task_payload = task_payload || ${tx.json(payload)},
      completed_at = NOW(),
      completed_by = ${input.actorId}::uuid,
      updated_at = NOW()
    WHERE id = ${input.taskId}::uuid
  `;

  const summary = input.summary.trim() || input.outcome?.trim() || task.title;
  await tx`
    INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal)
    VALUES (
      ${task.ticketId}::uuid,
      ${input.actorId}::uuid,
      ${`Care task completed (${task.taskType}): ${summary}`},
      true
    )
  `;

  const entryType =
    task.taskType === "call_back"
      ? "careCallbackLogged"
      : task.taskType === "send_email"
        ? "careEmailSent"
        : "careTaskCompleted";

  if (ticket.muaId) {
    await logCareComm(tx, {
      muaId: ticket.muaId,
      leadId: ticket.leadId,
      entryType,
      description: `Care task (${task.taskType}): ${summary}`,
      actorId: input.actorId,
      metadata: { taskId: task.id, ticketId: ticket.id, taskType: task.taskType },
    });
  }

  let updatedTicket = ticket;
  const statusChanged =
    Boolean(input.ticketStatus) && input.ticketStatus !== ticket.status;

  if (statusChanged && input.ticketStatus) {
    const afterStatus = await setTicketStatus(
      tx,
      ticket,
      input.ticketStatus,
      input.actorId,
      `Status advanced on task completion: ${summary}`
    );
    if (afterStatus) {
      updatedTicket = afterStatus;
      if (input.ticketStatus === "closed") {
        await cancelPendingPrimaryCareTasks(tx, afterStatus.id);
      } else {
        await createStatusChangeCareTask(tx, afterStatus, input.ticketStatus, {
          createdBy: input.actorId,
          note: summary,
          nextFollowUpAt: input.nextFollowUpAt ?? null,
        });
      }
    }
  } else if (input.nextFollowUpAt && ticket.status !== "closed") {
    const followType = followUpTaskTypeForTicketStatus(updatedTicket.status);
    await createFollowUpFromTaskComplete(tx, updatedTicket, {
      taskType: followType,
      title: stageFollowUpTitle(updatedTicket.status, updatedTicket.ticketNumber),
      assignedTo: task.assignedTo ?? updatedTicket.assignedTo,
      dueAt: input.nextFollowUpAt,
      createdBy: input.actorId,
    });
  }

  const isAdminReview = task.taskType === "admin_review";
  await notifyTicketStakeholders(
    tx,
    updatedTicket,
    `${task.title} completed on ${updatedTicket.ticketNumber}`,
    {
      excludeStaffId: input.actorId,
      notifyCareIncharge: isAdminReview || input.actorRole === "careAgent",
    }
  );

  return { ok: true };
}

async function completeCareTaskSendBack(
  tx: TransactionSql,
  opts: {
    task: TaskRow;
    ticket: Awaited<ReturnType<typeof getTicketById>> & object;
    input: CompleteCareTaskInput;
  }
): Promise<{ ok: true } | { error: string; status: number }> {
  const { task, ticket, input } = opts;
  const note = input.sendBackNote?.trim() || input.summary.trim();
  if (!note) return { error: "Send-back note is required", status: 400 };

  const payload = {
    ...(input.taskPayload ?? {}),
    sendBack: true,
    summary: input.summary,
    sendBackNote: note,
    completedAt: new Date().toISOString(),
  };

  await tx`
    UPDATE support.ticket_tasks
    SET
      status = 'done',
      task_payload = task_payload || ${tx.json(payload)},
      completed_at = NOW(),
      completed_by = ${input.actorId}::uuid,
      updated_at = NOW()
    WHERE id = ${input.taskId}::uuid
  `;

  await tx`
    INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal)
    VALUES (
      ${task.ticketId}::uuid,
      ${input.actorId}::uuid,
      ${`Task sent back to care (${task.taskType}): ${note}`},
      true
    )
  `;

  if (ticket.muaId) {
    await logCareComm(tx, {
      muaId: ticket.muaId,
      leadId: ticket.leadId,
      entryType: "careTaskCompleted",
      description: `Sent back to care: ${note}`,
      actorId: input.actorId,
      metadata: { taskId: task.id, ticketId: ticket.id, sendBack: true },
    });
  }

  if (ticket.assignedTo) {
    await createWorkflowCareTask(tx, {
      ticket,
      taskType: "gatherData",
      title: `Review returned input — ${ticket.ticketNumber}`,
      description: note,
      assignedTo: ticket.assignedTo,
      createdBy: input.actorId,
      trigger: "task_complete",
      meta: { returnedFromTaskId: task.id, sendBack: true },
    });

    await notifyCareIncharge(tx, ticket, `Input returned on ${ticket.ticketNumber}: ${task.title}`, {
      excludeStaffId: input.actorId,
    });
  }

  return { ok: true };
}
