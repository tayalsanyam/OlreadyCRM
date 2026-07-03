import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { withTransaction } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { hasCareTaskAccess } from "@/lib/ticket-access";
import {
  MAX_TICKET_ATTACHMENTS,
  MAX_TICKET_ATTACHMENT_BYTES,
  TICKET_ATTACHMENT_MIME_TYPES,
} from "@/lib/ticket-attachments";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: taskId } = await params;
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

  try {
    const row = await withTransaction(async (tx) => {
      const allowed = await hasCareTaskAccess(tx, auth.session, taskId);
      if (!allowed) return { forbidden: true as const };

      const [task] = await tx<{ ticketId: string; status: string }[]>`
        SELECT ticket_id AS "ticketId", status::text AS status
        FROM support.ticket_tasks
        WHERE id = ${taskId}::uuid
      `;
      if (!task) return null;
      if (task.status === "done") return { closed: true as const };

      const [countRow] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM support.ticket_attachments WHERE ticket_id = ${task.ticketId}::uuid
      `;
      if ((countRow?.count ?? 0) >= MAX_TICKET_ATTACHMENTS) {
        return { limitReached: true as const };
      }

      const uploadDir = path.join(process.cwd(), "uploads", "tickets");
      await mkdir(uploadDir, { recursive: true });
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const savedName = `${task.ticketId}-${Date.now()}-${safeName}`;
      const diskPath = path.join(uploadDir, savedName);
      const bytes = Buffer.from(await file.arrayBuffer());
      await writeFile(diskPath, bytes);
      const publicPath = `/uploads/tickets/${savedName}`;

      const category = String(form.get("category") ?? "staff_document");

      const [inserted] = await tx`
        INSERT INTO support.ticket_attachments (
          ticket_id,
          task_id,
          uploaded_by,
          file_name,
          file_path,
          mime_type,
          attachment_category,
          visibility
        ) VALUES (
          ${task.ticketId}::uuid,
          ${taskId}::uuid,
          ${auth.session.userId}::uuid,
          ${file.name},
          ${publicPath},
          ${mime},
          ${category},
          'internal'
        )
        RETURNING
          id,
          file_name AS "fileName",
          file_path AS "filePath",
          mime_type AS "mimeType",
          created_at AS "createdAt"
      `;

      await tx`
        INSERT INTO support.ticket_comments (ticket_id, author_id, body, is_internal)
        VALUES (
          ${task.ticketId}::uuid,
          ${auth.session.userId}::uuid,
          ${`Task attachment uploaded: ${file.name}`},
          true
        )
      `;

      return inserted;
    });

    if (row && "forbidden" in row) {
      return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
    }
    if (!row) {
      return NextResponse.json({ data: null, error: "Task not found" }, { status: 404 });
    }
    if ("closed" in row && row.closed) {
      return NextResponse.json({ data: null, error: "Task is already completed" }, { status: 400 });
    }
    if ("limitReached" in row && row.limitReached) {
      return NextResponse.json(
        { data: null, error: `Maximum ${MAX_TICKET_ATTACHMENTS} attachments per ticket` },
        { status: 400 }
      );
    }

    return NextResponse.json({ data: row, error: null }, { status: 201 });
  } catch (err) {
    console.error("[care-task attachments POST]", err);
    return NextResponse.json({ data: null, error: "Upload failed" }, { status: 500 });
  }
}
