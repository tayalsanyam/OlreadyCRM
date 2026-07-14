/** Max files on public / create-ticket intake */
export const MAX_INTAKE_ATTACHMENTS = 5;
/** Max total attachments per ticket (intake + staff uploads) */
export const MAX_TICKET_ATTACHMENTS = 20;
/** Max attachments per outbound care email */
export const MAX_EMAIL_ATTACHMENTS = 5;
export const MAX_TICKET_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const TICKET_ATTACHMENT_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.txt";

export const TICKET_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);
