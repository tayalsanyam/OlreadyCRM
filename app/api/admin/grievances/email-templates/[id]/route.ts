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
    category?: string | null;
    name?: string;
    subjectTemplate?: string;
    bodyTemplate?: string;
    approvalTier?: number;
    requiresAdminApproval?: boolean;
    active?: boolean;
  };

  const [row] = await sql`
    UPDATE support.ticket_templates SET
      category = COALESCE(${body.category ?? null}, category),
      name = COALESCE(${body.name?.trim() ?? null}, name),
      subject_template = COALESCE(${body.subjectTemplate?.trim() ?? null}, subject_template),
      body_template = COALESCE(${body.bodyTemplate?.trim() ?? null}, body_template),
      approval_tier = COALESCE(${body.approvalTier ?? null}, approval_tier),
      requires_admin_approval = COALESCE(${body.requiresAdminApproval ?? null}, requires_admin_approval),
      active = COALESCE(${body.active ?? null}, active),
      version = version + 1,
      updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING id
  `;

  if (!row) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: row, error: null });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  await sql`
    UPDATE support.ticket_templates SET active = false, updated_at = NOW()
    WHERE id = ${id}::uuid
  `;

  return NextResponse.json({ data: { ok: true }, error: null });
}
