import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    category?: string | null;
    contentText?: string;
    active?: boolean;
  };

  const [row] = await sql`
    UPDATE support.policy_documents SET
      title = COALESCE(${body.title?.trim() ?? null}, title),
      category = COALESCE(${body.category ?? null}, category),
      content_text = COALESCE(${body.contentText?.trim() ?? null}, content_text),
      active = COALESCE(${body.active ?? null}, active),
      updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING id
  `;

  if (!row) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: row, error: null });
}
