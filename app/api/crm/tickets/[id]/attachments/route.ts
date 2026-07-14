import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireGrievanceAccess, requireSession } from "@/lib/api-auth";
import { sanitizeUploadFilename, saveUploadFromFile } from "@/lib/file-storage";
import { getTicketById } from "@/lib/ticket-create";
import { hasTicketViewAccess } from "@/lib/ticket-access";

import { MAX_TICKET_ATTACHMENTS, MAX_TICKET_ATTACHMENT_BYTES, TICKET_ATTACHMENT_MIME_TYPES } from "@/lib/ticket-attachments";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const rows = await withTransaction(async (tx) => {
    const allowed = await hasTicketViewAccess(tx, auth.session, id);
    if (!allowed) return { forbidden: true as const };

    const ticket = await getTicketById(tx, id);
    if (!ticket) return null;

    return tx`
      SELECT
        id,
        file_name AS "fileName",
        file_path AS "filePath",
        mime_type AS "mimeType",
        attachment_category AS "attachmentCategory",
        visibility,
        created_at AS "createdAt"
      FROM support.ticket_attachments
      WHERE ticket_id = ${id}::uuid
      ORDER BY created_at DESC
    `;
  });

  if (rows && "forbidden" in rows) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }
  if (rows === null) {
    return NextResponse.json({ data: null, error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json({ data: rows, error: null });
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ data: null, error: "file is required" }, { status: 400 });
  }

  if (file.size > MAX_TICKET_ATTACHMENT_BYTES) {
    return NextResponse.json({ data: null, error: "File must be under 10 MB" }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  if (!TICKET_ATTACHMENT_MIME_TYPES.has(mime)) {
    return NextResponse.json(
      { data: null, error: "File type not allowed (PDF, images, Word, Excel, text)" },
      { status: 400 }
    );
  }

  const category = String(form.get("category") ?? "staff_document");
  const visibility = String(form.get("visibility") ?? "internal");

  try {
    const row = await withTransaction(async (tx) => {
      const ticket = await getTicketById(tx, id);
      if (!ticket) return null;

      const [countRow] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM support.ticket_attachments WHERE ticket_id = ${id}::uuid
      `;
      if ((countRow?.count ?? 0) >= MAX_TICKET_ATTACHMENTS) {
        return { limitReached: true as const };
      }

      const savedName = `${id}-${Date.now()}-${sanitizeUploadFilename(file.name)}`;
      const { publicPath } = await saveUploadFromFile("tickets", savedName, file);

      const [inserted] = await tx`
        INSERT INTO support.ticket_attachments (
          ticket_id,
          uploaded_by,
          file_name,
          file_path,
          mime_type,
          attachment_category,
          visibility
        ) VALUES (
          ${id}::uuid,
          ${auth.session.userId}::uuid,
          ${file.name},
          ${publicPath},
          ${mime},
          ${category},
          ${visibility}
        )
        RETURNING
          id,
          file_name AS "fileName",
          file_path AS "filePath",
          mime_type AS "mimeType",
          attachment_category AS "attachmentCategory",
          visibility,
          created_at AS "createdAt"
      `;

      await tx`
        INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal)
        VALUES (
          ${id}::uuid,
          ${auth.session.userId}::uuid,
          ${`Attachment uploaded: ${file.name}`},
          true
        )
      `;

      return inserted;
    });

    if (!row) {
      return NextResponse.json({ data: null, error: "Ticket not found" }, { status: 404 });
    }
    if ("limitReached" in row && row.limitReached) {
      return NextResponse.json(
        { data: null, error: `Maximum ${MAX_TICKET_ATTACHMENTS} attachments per ticket` },
        { status: 400 }
      );
    }

    return NextResponse.json({ data: row, error: null }, { status: 201 });
  } catch (err) {
    console.error("[ticket attachments POST]", err);
    return NextResponse.json({ data: null, error: "Upload failed" }, { status: 500 });
  }
}
