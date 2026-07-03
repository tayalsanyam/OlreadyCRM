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
      category,
      name,
      subject_template AS "subjectTemplate",
      body_template AS "bodyTemplate",
      approval_tier AS "approvalTier",
      requires_admin_approval AS "requiresAdminApproval",
      active,
      version,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM support.ticket_templates
    ORDER BY category NULLS LAST, name
  `;

  return NextResponse.json({ data: rows, error: null });
}

export async function POST(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    category?: string | null;
    name?: string;
    subjectTemplate?: string;
    bodyTemplate?: string;
    approvalTier?: number;
    requiresAdminApproval?: boolean;
    active?: boolean;
  };

  if (!body.name?.trim() || !body.subjectTemplate?.trim() || !body.bodyTemplate?.trim()) {
    return NextResponse.json(
      { data: null, error: "name, subjectTemplate, and bodyTemplate are required" },
      { status: 400 }
    );
  }

  const [row] = await sql`
    INSERT INTO support.ticket_templates (
      category, name, subject_template, body_template,
      approval_tier, requires_admin_approval, active
    ) VALUES (
      ${body.category ?? null},
      ${body.name.trim()},
      ${body.subjectTemplate.trim()},
      ${body.bodyTemplate.trim()},
      ${body.approvalTier ?? 0},
      ${body.requiresAdminApproval ?? false},
      ${body.active ?? true}
    )
    RETURNING id
  `;

  return NextResponse.json({ data: row, error: null }, { status: 201 });
}
