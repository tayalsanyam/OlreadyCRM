import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const rows = await sql`
    SELECT
      id,
      title,
      category,
      active,
      source_filename AS "sourceFilename",
      updated_at AS "updatedAt"
    FROM support.policy_documents
    ORDER BY title
  `;

  return NextResponse.json({ data: rows, error: null });
}

export async function POST(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    category?: string | null;
    contentText?: string;
  };

  if (!body.title?.trim() || !body.contentText?.trim()) {
    return NextResponse.json(
      { data: null, error: "title and contentText are required" },
      { status: 400 }
    );
  }

  const [row] = await sql`
    INSERT INTO support.policy_documents (title, category, content_text, uploaded_by)
    VALUES (
      ${body.title.trim()},
      ${body.category ?? null},
      ${body.contentText.trim()},
      ${auth.session.userId}::uuid
    )
    RETURNING id
  `;

  return NextResponse.json({ data: row, error: null }, { status: 201 });
}
