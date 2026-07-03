import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sql, withTransaction } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { getOpsTaskAccess } from "@/lib/ops-task-access";
import {
  MAX_OPS_TASK_ATTACHMENTS,
  MAX_OPS_TASK_ATTACHMENT_BYTES,
  OPS_TASK_ATTACHMENT_MIME_TYPES,
} from "@/lib/ops-task-attachments";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  const access = await withTransaction((tx) =>
    getOpsTaskAccess(tx, id, auth.session.userId, auth.session.role),
  );
  if (!access) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  const rows = await sql`
    SELECT
      a.id,
      a.file_name AS "fileName",
      a.file_path AS "filePath",
      a.mime_type AS "mimeType",
      a.created_at AS "createdAt",
      u.name AS "uploadedByName"
    FROM rm.ops_task_attachments a
    JOIN staff u ON u.id = a.uploaded_by
    WHERE a.task_id = ${id}::uuid
    ORDER BY a.created_at DESC
  `;

  return NextResponse.json({ data: rows, error: null });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ data: null, error: "file is required" }, { status: 400 });
  }

  if (file.size > MAX_OPS_TASK_ATTACHMENT_BYTES) {
    return NextResponse.json({ data: null, error: "File must be under 10 MB" }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  if (!OPS_TASK_ATTACHMENT_MIME_TYPES.has(mime)) {
    return NextResponse.json(
      { data: null, error: "File type not allowed (PDF, images, Word, Excel, text)" },
      { status: 400 },
    );
  }

  try {
    const row = await withTransaction(async (tx) => {
      const access = await getOpsTaskAccess(tx, id, auth.session.userId, auth.session.role);
      if (!access) return null;

      const [countRow] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM rm.ops_task_attachments WHERE task_id = ${id}::uuid
      `;
      if ((countRow?.count ?? 0) >= MAX_OPS_TASK_ATTACHMENTS) {
        return { limitReached: true as const };
      }

      const uploadDir = path.join(process.cwd(), "uploads", "ops-tasks");
      await mkdir(uploadDir, { recursive: true });
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const savedName = `${id}-${Date.now()}-${safeName}`;
      const diskPath = path.join(uploadDir, savedName);
      const bytes = Buffer.from(await file.arrayBuffer());
      await writeFile(diskPath, bytes);
      const publicPath = `/uploads/ops-tasks/${savedName}`;

      const [inserted] = await tx`
        INSERT INTO rm.ops_task_attachments (
          task_id, uploaded_by, file_name, file_path, mime_type
        ) VALUES (
          ${id}::uuid,
          ${auth.session.userId}::uuid,
          ${file.name},
          ${publicPath},
          ${mime}
        )
        RETURNING
          id,
          file_name AS "fileName",
          file_path AS "filePath",
          mime_type AS "mimeType",
          created_at AS "createdAt"
      `;
      return inserted;
    });

    if (!row) {
      return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
    }
    if ("limitReached" in row && row.limitReached) {
      return NextResponse.json(
        { data: null, error: `Maximum ${MAX_OPS_TASK_ATTACHMENTS} attachments per task` },
        { status: 400 },
      );
    }

    return NextResponse.json({ data: row, error: null }, { status: 201 });
  } catch (err) {
    console.error("[ops task attachments POST]", err);
    return NextResponse.json({ data: null, error: "Upload failed" }, { status: 500 });
  }
}
