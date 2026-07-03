import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { canAccessLead, getLeadForAccess } from "@/lib/lead-access";
import { upsertMakeupLookProfile, getMakeupLookProfile } from "@/lib/makeup-look-db";
import {
  MAKEUP_REFERENCE_MIME_TYPES,
  MAX_MAKEUP_REFERENCE_BYTES,
  MAX_MAKEUP_REFERENCE_IMAGES,
  type MakeupReferenceImage,
} from "@/lib/makeup-reference-images";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const access = await getLeadForAccess(id);
  if (!access) return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  if (!canAccessLead(auth.session, access)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const rows = await sql<MakeupReferenceImage[]>`
    SELECT
      id,
      file_name AS "fileName",
      file_path AS "filePath",
      mime_type AS "mimeType",
      created_at AS "createdAt"
    FROM lead_makeup_reference_images
    WHERE lead_id = ${id}::uuid
    ORDER BY created_at ASC
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
  const access = await getLeadForAccess(id);
  if (!access) return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  if (!canAccessLead(auth.session, access)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ data: null, error: "file is required" }, { status: 400 });
  }
  if (file.size > MAX_MAKEUP_REFERENCE_BYTES) {
    return NextResponse.json({ data: null, error: "Image must be under 8 MB" }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  if (!MAKEUP_REFERENCE_MIME_TYPES.has(mime)) {
    return NextResponse.json(
      { data: null, error: "Only JPEG, PNG, WebP, or GIF images are allowed" },
      { status: 400 },
    );
  }

  const [countRow] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM lead_makeup_reference_images
    WHERE lead_id = ${id}::uuid
  `;
  if ((countRow?.count ?? 0) >= MAX_MAKEUP_REFERENCE_IMAGES) {
    return NextResponse.json(
      { data: null, error: `Maximum ${MAX_MAKEUP_REFERENCE_IMAGES} reference images per lead` },
      { status: 400 },
    );
  }

  const uploadDir = path.join(process.cwd(), "uploads", "makeup-references");
  await mkdir(uploadDir, { recursive: true });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const savedName = `${id}-${Date.now()}-${safeName}`;
  const diskPath = path.join(uploadDir, savedName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(diskPath, bytes);
  const publicPath = `/uploads/makeup-references/${savedName}`;

  const [inserted] = await sql<MakeupReferenceImage[]>`
    INSERT INTO lead_makeup_reference_images (
      lead_id,
      file_name,
      file_path,
      mime_type,
      uploaded_by
    ) VALUES (
      ${id}::uuid,
      ${file.name},
      ${publicPath},
      ${mime},
      ${auth.session.userId}::uuid
    )
    RETURNING
      id,
      file_name AS "fileName",
      file_path AS "filePath",
      mime_type AS "mimeType",
      created_at AS "createdAt"
  `;

  const profile = (await getMakeupLookProfile(sql, id)) ?? {};
  if (!profile.referenceImagesUploaded) {
    await upsertMakeupLookProfile(sql, id, {
      ...profile,
      referenceImagesUploaded: true,
    });
  }

  return NextResponse.json({ data: inserted, error: null });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const access = await getLeadForAccess(id);
  if (!access) return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  if (!canAccessLead(auth.session, access)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const imageId = searchParams.get("imageId");
  if (!imageId) {
    return NextResponse.json({ data: null, error: "imageId is required" }, { status: 400 });
  }

  const [row] = await sql<{ filePath: string }[]>`
    SELECT file_path AS "filePath"
    FROM lead_makeup_reference_images
    WHERE id = ${imageId}::uuid AND lead_id = ${id}::uuid
    LIMIT 1
  `;
  if (!row) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  await sql`
    DELETE FROM lead_makeup_reference_images
    WHERE id = ${imageId}::uuid AND lead_id = ${id}::uuid
  `;

  const rel = row.filePath.replace(/^\/uploads\//, "");
  try {
    await unlink(path.join(process.cwd(), "uploads", rel));
  } catch {
    // file may already be gone
  }

  const [remaining] = await sql<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
    FROM lead_makeup_reference_images
    WHERE lead_id = ${id}::uuid
  `;
  if ((remaining?.count ?? 0) === 0) {
    const profile = (await getMakeupLookProfile(sql, id)) ?? {};
    await upsertMakeupLookProfile(sql, id, {
      ...profile,
      referenceImagesUploaded: false,
    });
  }

  return NextResponse.json({ data: { ok: true }, error: null });
}
