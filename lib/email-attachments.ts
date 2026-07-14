import type { TransactionSql } from "@/db/index";
import { readUploadFile } from "@/lib/file-storage";
import type { ResendAttachment } from "@/lib/resend";
import { MAX_EMAIL_ATTACHMENTS } from "@/lib/ticket-attachments";

export { MAX_EMAIL_ATTACHMENTS };

type AttachmentRow = {
  id: string;
  fileName: string;
  filePath: string;
  mimeType: string | null;
};

export async function resolveEmailAttachments(
  tx: TransactionSql,
  ticketId: string,
  attachmentIds: string[]
): Promise<{ attachments: ResendAttachment[]; error?: string }> {
  if (!attachmentIds.length) {
    return { attachments: [] };
  }

  if (attachmentIds.length > MAX_EMAIL_ATTACHMENTS) {
    return {
      attachments: [],
      error: `Maximum ${MAX_EMAIL_ATTACHMENTS} attachments per email`,
    };
  }

  const uniqueIds = [...new Set(attachmentIds)];
  const rows = await tx<AttachmentRow[]>`
    SELECT id, file_name AS "fileName", file_path AS "filePath", mime_type AS "mimeType"
    FROM support.ticket_attachments
    WHERE ticket_id = ${ticketId}::uuid
      AND id = ANY(${uniqueIds}::uuid[])
  `;

  if (rows.length !== uniqueIds.length) {
    return { attachments: [], error: "One or more attachments not found on this ticket" };
  }

  const attachments: ResendAttachment[] = [];

  for (const row of rows) {
    const publicPath = row.filePath.startsWith("/") ? row.filePath : `/${row.filePath}`;
    const file = await readUploadFile(publicPath);
    if (!file) {
      return { attachments: [], error: `Could not read file: ${row.fileName}` };
    }

    attachments.push({
      filename: row.fileName,
      content: file.bytes.toString("base64"),
      content_type: row.mimeType ?? file.mimeType,
    });
  }

  return { attachments };
}

export function attachmentSummary(fileNames: string[]): string {
  if (!fileNames.length) return "";
  return ` (${fileNames.length} attachment${fileNames.length === 1 ? "" : "s"}: ${fileNames.join(", ")})`;
}
