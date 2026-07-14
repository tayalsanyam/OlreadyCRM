import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";

export async function GET() {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const data = await withTransaction(async (tx) => tx`
    SELECT d.id, d.filename, d.created_at AS "createdAt", s.name AS "uploadedByName", char_length(d.content_text)::int AS "charCount"
    FROM sales.ai_documents d
    LEFT JOIN staff s ON s.id = d.uploaded_by
    ORDER BY d.created_at DESC
  `);

  return NextResponse.json({ data, error: null });
}

export async function POST(request: Request) {
  const auth = await requireRoles(["admin"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ data: null, error: "File is required" }, { status: 400 });
  }

  const filename = file.name;
  const text = await file.text();
  if (!text.trim()) {
    return NextResponse.json({ data: null, error: "No text extracted from file" }, { status: 400 });
  }

  const data = await withTransaction(async (tx) => {
    const [row] = await tx`
      INSERT INTO sales.ai_documents (filename, content_text, uploaded_by)
      VALUES (${filename}, ${text}, ${auth.session.userId}::uuid)
      RETURNING id, filename, char_length(content_text)::int AS "charCount"
    `;
    return row;
  });

  return NextResponse.json({ data, error: null });
}
