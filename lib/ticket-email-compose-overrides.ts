import type { TransactionSql } from "@/db/index";
import type { SupportTicket } from "@/lib/types";
import { approvedCoreContentMatches } from "@/lib/ticket-email-content";
import { stableSubjectForTicket } from "@/lib/ticket-email-workflow";

export type EmailRowForSend = {
  id: string;
  subject: string;
  bodyHtml: string;
  toEmail: string;
  status: string;
  attachmentIds: string[];
};

export type ComposerSendOverrides = {
  bodyHtml?: string;
  toEmail?: string;
  subject?: string;
  attachmentIds?: string[];
};

export async function applyComposerOverridesToEmail(
  tx: TransactionSql,
  ticket: SupportTicket,
  ticketId: string,
  email: EmailRowForSend,
  overrides?: ComposerSendOverrides
): Promise<EmailRowForSend | { error: string }> {
  if (!overrides) return email;

  const hasOverride =
    overrides.bodyHtml !== undefined ||
    overrides.toEmail !== undefined ||
    overrides.subject !== undefined ||
    overrides.attachmentIds !== undefined;

  if (!hasOverride) return email;

  const subject = stableSubjectForTicket(ticket);
  const bodyHtml = overrides.bodyHtml ?? email.bodyHtml;
  const toEmail = (overrides.toEmail ?? email.toEmail).trim();
  const attachmentIds = overrides.attachmentIds ?? email.attachmentIds;

  if (email.status === "approved" && overrides.bodyHtml !== undefined) {
    const allowed = approvedCoreContentMatches(ticket.ticketNumber, email, {
      subject,
      bodyHtml,
      toEmail,
    });
    if (!allowed) {
      return {
        error:
          "Message body was changed beyond the communication log — reload the approved draft or submit for re-approval.",
      };
    }
  }

  await tx`
    UPDATE support.ticket_email_responses
    SET subject = ${subject},
        body_html = ${bodyHtml},
        to_email = ${toEmail},
        attachment_ids = ${attachmentIds},
        updated_at = NOW()
    WHERE id = ${email.id}::uuid AND ticket_id = ${ticketId}::uuid
  `;

  return { ...email, subject, bodyHtml, toEmail, attachmentIds };
}
