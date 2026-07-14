import type { TransactionSql } from "@/db/index";
import { getCareGmailAddress, sendCareEmail } from "@/lib/resend";
import { prepareTicketEmailContent } from "@/lib/ticket-email-gmail";
import { buildResendThreadHeaders } from "@/lib/ticket-email-thread";
import { getTicketById } from "@/lib/ticket-create";
import { logCareComm } from "@/lib/ticket-ledger";
import { completePendingSendEmailCareTask } from "@/lib/ticket-care-workflow";

export type EmailSendChannel = "resend" | "gmail";

export async function fetchPriorResendMessageIds(
  tx: TransactionSql,
  ticketId: string,
): Promise<string[]> {
  const rows = await tx<{ resendMessageId: string }[]>`
    SELECT resend_message_id AS "resendMessageId"
    FROM support.ticket_email_responses
    WHERE ticket_id = ${ticketId}::uuid
      AND status = 'sent'
      AND resend_message_id IS NOT NULL
    ORDER BY sent_at ASC NULLS LAST, created_at ASC
  `;
  return rows.map((r: { resendMessageId: string }) => r.resendMessageId).filter(Boolean);
}

export async function recordTicketEmailSent(
  tx: TransactionSql,
  opts: {
    ticketId: string;
    emailId: string;
    actorId: string;
    toEmail: string;
    subject: string;
    bodyHtml?: string;
    attachNote: string;
    channel: EmailSendChannel;
    resendMessageId?: string | null;
    threadedSubject?: string;
  },
): Promise<string> {
  const {
    ticketId,
    emailId,
    actorId,
    toEmail,
    subject,
    bodyHtml,
    attachNote,
    channel,
    resendMessageId = null,
    threadedSubject,
  } = opts;

  const displaySubject = threadedSubject ?? subject;

  await tx`
    UPDATE support.ticket_email_responses
    SET status = 'sent',
        sent_at = NOW(),
        sent_by = ${actorId}::uuid,
        send_channel = ${channel},
        resend_message_id = ${resendMessageId},
        subject = ${displaySubject},
        body_html = COALESCE(${bodyHtml ?? null}, body_html),
        updated_at = NOW()
    WHERE id = ${emailId}::uuid
  `;

  const ticket = await getTicketById(tx, ticketId);
  const channelLabel = channel === "resend" ? "Resend" : `Gmail (${getCareGmailAddress()})`;

  await tx`
    INSERT INTO support.ticket_comments (
      ticket_id, author_id, body, is_internal, correspondence_kind, channel
    )
    VALUES (
      ${ticketId}::uuid,
      ${actorId}::uuid,
      ${`Email sent via ${channelLabel} to ${toEmail}: ${displaySubject}${attachNote}`},
      false,
      'care_reply',
      'email'
    )
  `;

  if (ticket?.muaId) {
    await logCareComm(tx, {
      muaId: ticket.muaId,
      leadId: ticket.leadId,
      entryType: "careEmailSent",
      description: `Care email sent via ${channelLabel} (${ticket.ticketNumber}): ${displaySubject}${attachNote}`,
      actorId,
      metadata: { ticketId, emailId, channel },
    });
  }

  await completePendingSendEmailCareTask(tx, {
    ticketId,
    emailId,
    actorId,
    channel,
  });

  return emailId;
}

export async function sendTicketEmailViaResend(
  tx: TransactionSql,
  opts: {
    ticketId: string;
    ticketNumber: string;
    emailId: string;
    toEmail: string;
    subject: string;
    bodyHtml: string;
    actorId: string;
    attachNote: string;
    attachments: import("@/lib/resend").ResendAttachment[];
  },
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const priorIds = await fetchPriorResendMessageIds(tx, opts.ticketId);
  const prepared = prepareTicketEmailContent({
    ticketNumber: opts.ticketNumber,
    subject: opts.subject,
    bodyHtml: opts.bodyHtml,
  });
  const threadHeaders = buildResendThreadHeaders(priorIds);

  const sendResult = await sendCareEmail({
    to: opts.toEmail,
    subject: prepared.threadedSubject,
    html: prepared.bodyHtml,
    text: prepared.bodyPlain,
    attachments: opts.attachments,
    threadHeaders:
      threadHeaders?.inReplyTo
        ? { inReplyTo: threadHeaders.inReplyTo, references: threadHeaders.references }
        : undefined,
  });

  if (!sendResult.ok) {
    return { ok: false, error: sendResult.error };
  }
  if (!sendResult.messageId) {
    return { ok: false, error: "Resend did not return a message id" };
  }

  await recordTicketEmailSent(tx, {
    ticketId: opts.ticketId,
    emailId: opts.emailId,
    actorId: opts.actorId,
    toEmail: opts.toEmail,
    subject: opts.subject,
    threadedSubject: prepared.threadedSubject,
    attachNote: opts.attachNote,
    channel: "resend",
    resendMessageId: sendResult.messageId,
  });

  return { ok: true, messageId: sendResult.messageId };
}
