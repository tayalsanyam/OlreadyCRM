import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";

export async function GET() {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const data = await withTransaction(async (tx) => {
    const [row] = await tx`SELECT * FROM sales.ai_persona WHERE id = 1`;
    return row ?? {
      id: 1,
      toneStyle: "",
      corePitch: "",
      valueProps: [],
      objections: [],
      planDifferentiators: {},
      version: 1,
    };
  });

  return NextResponse.json({ data, error: null });
}

export async function PATCH(request: Request) {
  const auth = await requireRoles(["admin"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const data = await withTransaction(async (tx) => {
    await tx`
      INSERT INTO sales.ai_persona (id, tone_style, core_pitch, value_props, objections, plan_differentiators, updated_by, updated_at, version)
      VALUES (
        1,
        ${typeof body.toneStyle === 'string' ? body.toneStyle : null},
        ${typeof body.corePitch === 'string' ? body.corePitch : null},
        ${tx.json((body.valueProps as any) ?? [])},
        ${tx.json((body.objections as any) ?? [])},
        ${tx.json((body.planDifferentiators as any) ?? {})},
        ${auth.session.userId}::uuid,
        NOW(),
        1
      )
      ON CONFLICT (id)
      DO UPDATE SET
        tone_style = COALESCE(EXCLUDED.tone_style, sales.ai_persona.tone_style),
        core_pitch = COALESCE(EXCLUDED.core_pitch, sales.ai_persona.core_pitch),
        value_props = CASE WHEN EXCLUDED.value_props IS NULL THEN sales.ai_persona.value_props ELSE EXCLUDED.value_props END,
        objections = CASE WHEN EXCLUDED.objections IS NULL THEN sales.ai_persona.objections ELSE EXCLUDED.objections END,
        plan_differentiators = CASE WHEN EXCLUDED.plan_differentiators IS NULL THEN sales.ai_persona.plan_differentiators ELSE EXCLUDED.plan_differentiators END,
        updated_by = ${auth.session.userId}::uuid,
        updated_at = NOW(),
        version = sales.ai_persona.version + 1
      RETURNING *
    `;
    const [row] = await tx`SELECT * FROM sales.ai_persona WHERE id = 1`;
    return row;
  });

  return NextResponse.json({ data, error: null });
}
