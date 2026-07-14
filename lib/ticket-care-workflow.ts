import type { TransactionSql } from "@/db/index";
import { resolveCareTaskDueAt } from "@/lib/care-task-due";
import { fromDbRole } from "@/lib/db-mappers";
import { resolveCareNotifyLink } from "@/lib/ticket-admin-watch";
import { categoriesRequireLedger } from "@/lib/ticket-category-config";
import { generateCareTaskDisplayId } from "@/lib/ticket-create";
import { allCategoriesFromTicket } from "@/lib/ticket-categories";
import { toDbCareTaskType, toDbTaskPriority } from "@/lib/ticket-db-mappers";
import type { CareTaskPriority, CareTaskType, SupportTicket, TicketStatus, TicketUrgency } from "@/lib/types";

type WorkflowTrigger = "intake" | "status_change" | "task_complete";

function urgencyToPriority(urgency: TicketUrgency): CareTaskPriority {
  if (urgency === "high") return "high";
  if (urgency === "low") return "low";
  return "normal";
}

function defaultDueAt(urgency: TicketUrgency): string {
  const d = new Date();
  if (urgency === "high") d.setHours(d.getHours() + 4);
  else if (urgency === "low") d.setDate(d.getDate() + 2);
  else d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function intakeTaskType(category: string, requiresLedger: boolean): CareTaskType {
  if (requiresLedger) return "attachLedger";
  if (category === "invoice_contract") return "attachContract";
  if (category === "rm_relationship") return "callBack";
  return "gatherData";
}

function statusTaskType(status: TicketStatus): CareTaskType | null {
  const map: Partial<Record<TicketStatus, CareTaskType>> = {
    investigating: "gatherData",
    awaitingInfo: "callBack",
    initialReplySent: "callBack",
    inDiscussion: "gatherData",
    finalOffer: "callBack",
    resolutionProposed: "callBack",
  };
  return map[status] ?? null;
}

export function followUpTaskTypeForTicketStatus(status: TicketStatus): CareTaskType {
  return statusTaskType(status) ?? "gatherData";
}

export function stageFollowUpTitle(status: TicketStatus, ticketNumber: string): string {
  return statusTaskTitle(status, ticketNumber);
}

function statusTaskTitle(status: TicketStatus, ticketNumber: string): string {
  const labels: Partial<Record<TicketStatus, string>> = {
    investigating: `Investigate — ${ticketNumber}`,
    awaitingInfo: `Follow up for info — ${ticketNumber}`,
    initialReplySent: `Check for customer reply — ${ticketNumber}`,
    inDiscussion: `Continue discussion — ${ticketNumber}`,
    finalOffer: `Confirm resolution — ${ticketNumber}`,
    resolutionProposed: `Confirm resolution — ${ticketNumber}`,
  };
  return labels[status] ?? `Follow up — ${ticketNumber}`;
}

async function notifyAssignee(
  tx: TransactionSql,
  assigneeId: string,
  title: string,
  ticketId: string,
  taskLink: string
) {
  await tx`
    INSERT INTO notifications (staff_id, message, link)
    VALUES (${assigneeId}::uuid, ${title}, ${taskLink})
  `;
}

async function resolveTaskLink(tx: TransactionSql, assigneeId: string, ticketId: string): Promise<string> {
  return resolveCareNotifyLink(tx, assigneeId, ticketId);
}

export async function cancelPendingPrimaryCareTasks(tx: TransactionSql, ticketId: string) {
  await tx`
    UPDATE support.ticket_tasks
    SET status = 'cancelled', updated_at = NOW()
    WHERE ticket_id = ${ticketId}::uuid
      AND status IN ('pending', 'in_progress')
      AND COALESCE((task_payload->>'manual')::boolean, false) = false
      AND COALESCE((task_payload->>'emailApproval')::boolean, false) = false
      AND COALESCE((task_payload->>'adminLoopIn')::boolean, false) = false
      AND (
        COALESCE((task_payload->>'primaryCareTask')::boolean, false) = true
        OR COALESCE((task_payload->>'autoWorkflow')::boolean, false) = true
      )
  `;
}

/** @deprecated Use cancelPendingPrimaryCareTasks */
export const cancelPendingWorkflowTasks = cancelPendingPrimaryCareTasks;

/** @deprecated Use cancelPendingEmailCareTasks */
export const cancelPendingEmailApprovalTasks = cancelPendingEmailCareTasks;

/**
 * Cancel open email-workflow tasks so care/admin never stack duplicates on one ticket.
 * - ticket: all email-approval + send/draft tasks (not admin loop-in)
 * - email: approval/review tasks for one email draft only
 */
export async function cancelPendingEmailCareTasks(
  tx: TransactionSql,
  ticketId: string,
  opts?: { scope?: "ticket" | "email"; emailId?: string | null }
) {
  const scope = opts?.scope ?? (opts?.emailId ? "email" : "ticket");
  const emailId = opts?.emailId ?? null;

  if (scope === "ticket") {
    await tx`
      UPDATE support.ticket_tasks
      SET status = 'cancelled', updated_at = NOW()
      WHERE ticket_id = ${ticketId}::uuid
        AND status IN ('pending', 'in_progress')
        AND COALESCE((task_payload->>'adminLoopIn')::boolean, false) = false
        AND (
          COALESCE((task_payload->>'emailApproval')::boolean, false) = true
          OR task_type::text IN ('send_email', 'draft_response')
        )
    `;
    return;
  }

  await tx`
    UPDATE support.ticket_tasks
    SET status = 'cancelled', updated_at = NOW()
    WHERE ticket_id = ${ticketId}::uuid
      AND status IN ('pending', 'in_progress')
      AND COALESCE((task_payload->>'adminLoopIn')::boolean, false) = false
      AND COALESCE((task_payload->>'emailApproval')::boolean, false) = true
      AND (
        ${emailId}::text IS NULL
        OR task_payload->>'emailId' = ${emailId}
      )
  `;
}

async function markEmailWorkflowTaskDone(
  tx: TransactionSql,
  opts: {
    ticketId: string;
    taskId: string;
    taskType: string;
    actorId: string;
    summary: string;
    payload?: Record<string, unknown>;
  }
) {
  const payload = {
    ...(opts.payload ?? {}),
    summary: opts.summary,
    completedAt: new Date().toISOString(),
  };

  await tx`
    UPDATE support.ticket_tasks
    SET
      status = 'done',
      task_payload = task_payload || ${tx.json(payload)},
      completed_at = NOW(),
      completed_by = ${opts.actorId}::uuid,
      updated_at = NOW()
    WHERE id = ${opts.taskId}::uuid
  `;

  await tx`
    INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal)
    VALUES (
      ${opts.ticketId}::uuid,
      ${opts.actorId}::uuid,
      ${`Care task completed (${opts.taskType}): ${opts.summary}`},
      true
    )
  `;
}

/** Mark the open admin-review task for an email draft as done when admin approves. */
export async function completePendingAdminReviewCareTask(
  tx: TransactionSql,
  opts: {
    ticketId: string;
    emailId: string;
    actorId: string;
    summary?: string;
  }
): Promise<boolean> {
  const [task] = await tx<{ id: string }[]>`
    SELECT id
    FROM support.ticket_tasks
    WHERE ticket_id = ${opts.ticketId}::uuid
      AND task_type::text = 'admin_review'
      AND status IN ('pending', 'in_progress')
      AND COALESCE((task_payload->>'emailApproval')::boolean, false) = true
      AND task_payload->>'emailId' = ${opts.emailId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (!task) return false;

  await markEmailWorkflowTaskDone(tx, {
    ticketId: opts.ticketId,
    taskId: task.id,
    taskType: "admin_review",
    actorId: opts.actorId,
    summary: opts.summary ?? "Email draft approved for care to send",
    payload: { emailApproved: true },
  });
  return true;
}

/** Auto-complete the care send-email task after the draft is actually sent. */
export async function completePendingSendEmailCareTask(
  tx: TransactionSql,
  opts: {
    ticketId: string;
    emailId: string;
    actorId: string;
    channel: "resend" | "gmail";
  }
): Promise<boolean> {
  const [task] = await tx<{ id: string }[]>`
    SELECT id
    FROM support.ticket_tasks
    WHERE ticket_id = ${opts.ticketId}::uuid
      AND task_type::text = 'send_email'
      AND status IN ('pending', 'in_progress')
      AND COALESCE((task_payload->>'emailApproval')::boolean, false) = true
      AND task_payload->>'emailId' = ${opts.emailId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (!task) return false;

  const channelLabel = opts.channel === "resend" ? "Resend" : "Gmail";
  await markEmailWorkflowTaskDone(tx, {
    ticketId: opts.ticketId,
    taskId: task.id,
    taskType: "send_email",
    actorId: opts.actorId,
    summary: `Email sent via ${channelLabel}`,
    payload: { emailSentAuto: true, channel: opts.channel },
  });
  return true;
}

export async function hasOpenPrimaryCareTask(
  tx: TransactionSql,
  ticketId: string,
  excludeTaskId?: string | null
): Promise<boolean> {
  const [row] = await tx<{ ok: number }[]>`
    SELECT 1 AS ok
    FROM support.ticket_tasks
    WHERE ticket_id = ${ticketId}::uuid
      AND (${excludeTaskId ?? null}::uuid IS NULL OR id <> ${excludeTaskId ?? null}::uuid)
      AND status IN ('pending', 'in_progress')
      AND COALESCE((task_payload->>'primaryCareTask')::boolean, false) = true
    LIMIT 1
  `;
  return Boolean(row?.ok);
}

export async function createWorkflowCareTask(
  tx: TransactionSql,
  opts: {
    ticket: SupportTicket;
    taskType: CareTaskType;
    title: string;
    description?: string;
    assignedTo?: string | null;
    priority?: CareTaskPriority;
    dueAt?: string | null;
    createdBy?: string | null;
    trigger: WorkflowTrigger;
    meta?: Record<string, unknown>;
  }
): Promise<string | null> {
  const displayId = await generateCareTaskDisplayId(tx);
  const assignee = opts.assignedTo ?? opts.ticket.assignedTo;
  const priority = opts.priority ?? urgencyToPriority(opts.ticket.urgency);
  const isEmailTask = opts.meta?.emailApproval === true;
  const isManualTask = opts.meta?.manual === true;
  const isPrimaryTask = !isEmailTask && !isManualTask;

  if (isPrimaryTask) {
    await cancelPendingPrimaryCareTasks(tx, opts.ticket.id);
  } else if (isEmailTask) {
    const emailId =
      typeof opts.meta?.emailId === "string" ? opts.meta.emailId : null;
    const isCareEmailAction =
      opts.taskType === "sendEmail" || opts.taskType === "draftResponse";
    if (isCareEmailAction) {
      await cancelPendingEmailCareTasks(tx, opts.ticket.id, { scope: "ticket" });
    } else {
      await cancelPendingEmailCareTasks(tx, opts.ticket.id, {
        scope: "email",
        emailId,
      });
    }
  }

  const resolvedDue =
    opts.dueAt ??
    (await resolveCareTaskDueAt(tx, { assigneeId: assignee })) ??
    defaultDueAt(opts.ticket.urgency);
  const dueAt = resolvedDue;

  let assignedRole: string | null = null;
  if (assignee) {
    const [staff] = await tx<{ role: string }[]>`
      SELECT role::text AS role FROM rm.staff WHERE id = ${assignee}::uuid
    `;
    if (staff) {
      const appRole = fromDbRole(staff.role);
      const roleMap: Record<string, string> = {
        regionalRm: "regional_rm",
        commissionRm: "commission_rm",
        feedbackRm: "feedback_rm",
        careAgent: "care_agent",
        salesRm: "sales_rm",
        salesTl: "sales_tl",
        salesActivation: "sales_activation",
        admin: "admin",
        owner: "owner",
        leadUploader: "lead_uploader",
      };
      assignedRole = roleMap[appRole] ?? staff.role;
    }
  }

  const payload = {
    autoWorkflow: isPrimaryTask,
    primaryCareTask: isPrimaryTask,
    trigger: opts.trigger,
    ...opts.meta,
  };

  const [row] = await tx<{ id: string }[]>`
    INSERT INTO support.ticket_tasks (
      ticket_id,
      display_id,
      task_type,
      title,
      description,
      assigned_to,
      assigned_role,
      priority,
      due_at,
      task_payload,
      created_by
    ) VALUES (
      ${opts.ticket.id}::uuid,
      ${displayId},
      ${toDbCareTaskType(opts.taskType)}::support.care_task_type,
      ${opts.title},
      ${opts.description ?? null},
      ${assignee},
      ${assignedRole}::rm.user_role,
      ${toDbTaskPriority(priority)}::support.task_priority,
      ${dueAt},
      ${tx.json(payload)},
      ${opts.createdBy ?? null}
    )
    RETURNING id
  `;

  if (assignee) {
    const link = await resolveTaskLink(tx, assignee, opts.ticket.id);
    await notifyAssignee(
      tx,
      assignee,
      `New care task ${displayId}: ${opts.title}`,
      opts.ticket.id,
      link
    );
  }

  await tx`
    INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal)
    VALUES (
      ${opts.ticket.id}::uuid,
      ${opts.createdBy},
      ${`Care task ${displayId} created: ${opts.title}`},
      true
    )
  `;

  return row?.id ?? null;
}

export async function createIntakeCareTask(
  tx: TransactionSql,
  ticket: SupportTicket,
  createdBy?: string | null
) {
  const categories = allCategoriesFromTicket(ticket.category, ticket.tags ?? []);
  const requiresLedger = await categoriesRequireLedger(tx, categories);
  const taskType = intakeTaskType(ticket.category, requiresLedger);

  const description = requiresLedger
    ? "Review CRM context, attach lead usage ledger, and confirm MUA match."
    : "Review CRM context tabs, complaint details, and confirm next steps from AI triage.";

  await createWorkflowCareTask(tx, {
    ticket,
    taskType,
    title: `Intake review — ${ticket.ticketNumber}`,
    description,
    assignedTo: ticket.assignedTo,
    createdBy,
    trigger: "intake",
    meta: { category: ticket.category },
  });
}

export async function createStatusChangeCareTask(
  tx: TransactionSql,
  ticket: SupportTicket,
  toStatus: TicketStatus,
  opts: { createdBy?: string | null; nextFollowUpAt?: string | null; note?: string }
) {
  if (toStatus === "received" || toStatus === "closed") return;

  const taskType = statusTaskType(toStatus);
  if (!taskType) return;

  await createWorkflowCareTask(tx, {
    ticket,
    taskType,
    title: statusTaskTitle(toStatus, ticket.ticketNumber),
    description: opts.note ?? undefined,
    assignedTo: ticket.assignedTo,
    dueAt: opts.nextFollowUpAt ?? undefined,
    createdBy: opts.createdBy,
    trigger: "status_change",
    meta: { toStatus },
  });
}

export async function createFollowUpFromTaskComplete(
  tx: TransactionSql,
  ticket: SupportTicket,
  opts: {
    taskType: CareTaskType;
    title: string;
    assignedTo?: string | null;
    dueAt: string;
    createdBy?: string | null;
  }
) {
  await createWorkflowCareTask(tx, {
    ticket,
    taskType: opts.taskType,
    title: opts.title,
    assignedTo: opts.assignedTo ?? ticket.assignedTo,
    dueAt: opts.dueAt,
    createdBy: opts.createdBy,
    trigger: "task_complete",
  });
}
