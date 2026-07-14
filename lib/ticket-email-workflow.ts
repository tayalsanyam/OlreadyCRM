import type { TransactionSql } from "@/db/index";
import { getCareGmailAddress } from "@/lib/resend";
import { notifyCareIncharge, notifyWatchingAdmin } from "@/lib/ticket-admin-watch";
import {
  ticketConcernLabel,
  ticketStableEmailSubject,
} from "@/lib/ticket-email-thread";
import {
  completePendingAdminReviewCareTask,
  createWorkflowCareTask,
} from "@/lib/ticket-care-workflow";
import { getTicketById } from "@/lib/ticket-create";
import { notifyAdminsOfTicket } from "@/lib/ticket-ledger";
import { toDbTicketStatus } from "@/lib/ticket-db-mappers";
import { ticketStatusLabel } from "@/lib/ticket-status";
import type { SupportTicket, TicketStatus } from "@/lib/types";

export async function setTicketStatus(
  tx: TransactionSql,
  ticket: SupportTicket,
  toStatus: TicketStatus,
  actorId: string | null,
  note?: string | null
): Promise<SupportTicket | null> {
  const dbStatus = toDbTicketStatus(toStatus);
  const fromDb = toDbTicketStatus(ticket.status);
  if (fromDb === dbStatus) return ticket;

  await tx`
    UPDATE support.tickets
    SET status = ${dbStatus}::support.ticket_status,
        updated_at = NOW(),
        closed_at = CASE WHEN ${dbStatus} = 'closed' THEN NOW() ELSE closed_at END,
        closed_by = CASE WHEN ${dbStatus} = 'closed' THEN ${actorId}::uuid ELSE closed_by END
    WHERE id = ${ticket.id}::uuid
  `;

  await tx`
    INSERT INTO support.ticket_status_history (ticket_id, from_status, to_status, changed_by, reason)
    VALUES (
      ${ticket.id}::uuid,
      ${fromDb}::support.ticket_status,
      ${dbStatus}::support.ticket_status,
      ${actorId},
      ${note ?? null}
    )
  `;

  const label = ticketStatusLabel(toStatus);
  await tx`
    INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal)
    VALUES (
      ${ticket.id}::uuid,
      ${actorId},
      ${`Status → ${label}${note?.trim() ? `\n${note.trim()}` : ""}`},
      true
    )
  `;

  return getTicketById(tx, ticket.id);
}

export function stableSubjectForTicket(ticket: SupportTicket): string {
  return ticketStableEmailSubject(
    ticket.ticketNumber,
    ticketConcernLabel({
      category: ticket.category,
      subcategory: ticket.subcategory,
    })
  );
}

export async function supersedeTicketEmail(
  tx: TransactionSql,
  emailId: string,
  ticketId: string
) {
  await tx`
    UPDATE support.ticket_email_responses
    SET status = 'superseded', updated_at = NOW()
    WHERE id = ${emailId}::uuid
      AND ticket_id = ${ticketId}::uuid
      AND status IN ('approved', 'revision_requested', 'pending_approval')
  `;
}

export async function queueEmailForAdminApproval(
  tx: TransactionSql,
  opts: {
    ticket: SupportTicket;
    emailId: string;
    subject: string;
    actorId: string;
    attachNote?: string;
  }
) {
  const { ticket, emailId, subject, actorId, attachNote = "" } = opts;

  await createWorkflowCareTask(tx, {
    ticket,
    taskType: "adminReview",
    title: `Review email draft — ${ticket.ticketNumber}`,
    description: `Review and approve or request changes before care sends.\nSubject: ${subject}${attachNote}`,
    assignedTo: ticket.assignedAdminId ?? ticket.assignedTo,
    createdBy: actorId,
    trigger: "status_change",
    meta: { emailId, emailApproval: true },
  });

  if (ticket.assignedAdminId) {
    await notifyWatchingAdmin(
      tx,
      ticket,
      `Email draft pending review — ${ticket.ticketNumber}${attachNote}`
    );
  } else {
    await notifyAdminsOfTicket(tx, {
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      message: `Email draft pending review — ${ticket.ticketNumber}${attachNote}`,
    });
  }
}

export async function approveEmailForCareSend(
  tx: TransactionSql,
  opts: {
    ticket: SupportTicket;
    emailId: string;
    subject: string;
    adminId: string;
  }
) {
  const { ticket, emailId, subject, adminId } = opts;
  const threadedSubject = stableSubjectForTicket(ticket);

  await tx`
    UPDATE support.ticket_email_responses
    SET status = 'approved',
        subject = ${threadedSubject},
        approved_by = ${adminId}::uuid,
        approved_at = NOW(),
        approved_subject = ${threadedSubject},
        approved_body_html = body_html,
        approved_to_email = to_email,
        updated_at = NOW()
    WHERE id = ${emailId}::uuid AND ticket_id = ${ticket.id}::uuid
  `;

  const updated = await getTicketById(tx, ticket.id);
  if (!updated) return null;

  await completePendingAdminReviewCareTask(tx, {
    ticketId: ticket.id,
    emailId,
    actorId: adminId,
    summary: `Email draft approved: ${subject}`,
  });

  await createWorkflowCareTask(tx, {
    ticket: updated,
    taskType: "sendEmail",
    title: `Send approved email — ${ticket.ticketNumber}`,
    description: `Admin approved the draft. Open in Gmail (${getCareGmailAddress()}) and send after final check.\nSubject: ${subject}`,
    assignedTo: updated.assignedTo,
    createdBy: adminId,
    trigger: "status_change",
    meta: { emailId, emailApproval: true },
  });

  if (updated.assignedTo) {
    await notifyCareIncharge(
      tx,
      updated,
      `Approved email ready to send — ${updated.ticketNumber}`
    );
  }

  await tx`
    INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal)
    VALUES (
      ${ticket.id}::uuid,
      ${adminId}::uuid,
      ${`Admin approved email draft (care to send): ${subject}`},
      true
    )
  `;

  return updated;
}

export async function requestEmailRevision(
  tx: TransactionSql,
  opts: {
    ticket: SupportTicket;
    emailId: string;
    subject: string;
    adminId: string;
    revisionNote: string;
  }
) {
  const { ticket, emailId, subject, adminId, revisionNote } = opts;

  await tx`
    UPDATE support.ticket_email_responses
    SET status = 'revision_requested',
        admin_revision_note = ${revisionNote},
        approved_by = ${adminId}::uuid,
        approved_at = NOW(),
        updated_at = NOW()
    WHERE id = ${emailId}::uuid AND ticket_id = ${ticket.id}::uuid
  `;

  const updated = await getTicketById(tx, ticket.id);
  if (!updated) return null;

  await createWorkflowCareTask(tx, {
    ticket: updated,
    taskType: "draftResponse",
    title: `Revise email draft — ${ticket.ticketNumber}`,
    description: `Admin feedback:\n${revisionNote}\n\nOriginal subject: ${subject}`,
    assignedTo: updated.assignedTo,
    createdBy: adminId,
    trigger: "status_change",
    meta: { emailId, emailApproval: true, revisionNote },
  });

  if (updated.assignedTo) {
    await notifyCareIncharge(
      tx,
      updated,
      `Email revision requested — ${updated.ticketNumber}`
    );
  }

  return updated;
}

export async function adminUpdatePendingEmail(
  tx: TransactionSql,
  opts: {
    ticket: SupportTicket;
    emailId: string;
    adminId: string;
    subject: string;
    bodyHtml: string;
    toEmail: string;
  }
) {
  const { ticket, emailId, adminId, subject, bodyHtml, toEmail } = opts;

  const [row] = await tx<{ status: string }[]>`
    SELECT status::text AS status
    FROM support.ticket_email_responses
    WHERE id = ${emailId}::uuid AND ticket_id = ${ticket.id}::uuid
  `;
  if (!row) return { error: "Email not found" as const };
  if (row.status !== "pending_approval") {
    return { error: "Only pending drafts can be edited" as const };
  }

  const threadedSubject = stableSubjectForTicket(ticket);

  await tx`
    UPDATE support.ticket_email_responses
    SET subject = ${threadedSubject},
        body_html = ${bodyHtml},
        to_email = ${toEmail},
        approved_subject = NULL,
        approved_body_html = NULL,
        approved_to_email = NULL,
        updated_at = NOW()
    WHERE id = ${emailId}::uuid AND ticket_id = ${ticket.id}::uuid
  `;

  await tx`
    INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal)
    VALUES (
      ${ticket.id}::uuid,
      ${adminId}::uuid,
      ${`Admin edited pending email draft before approval.\nSubject: ${threadedSubject}`},
      true
    )
  `;

  return { ok: true as const, subject: threadedSubject, bodyHtml, toEmail };
}
