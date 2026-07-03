import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const [row] = await sql`
    SELECT high_hours AS "highHours", medium_hours AS "mediumHours", low_hours AS "lowHours"
    FROM support.sla_config WHERE id = 1
  `;

  return NextResponse.json({ data: row ?? null, error: null });
}

export async function PATCH(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    highHours?: number;
    mediumHours?: number;
    lowHours?: number;
  };

  const hours = [body.highHours, body.mediumHours, body.lowHours].filter(
    (value): value is number => value !== undefined
  );
  if (hours.some((value) => !Number.isFinite(value) || value < 1)) {
    return NextResponse.json(
      { data: null, error: "SLA hours must be a positive number." },
      { status: 400 }
    );
  }

  try {
    const [row] = await sql`
      UPDATE support.sla_config SET
        high_hours = COALESCE(${body.highHours ?? null}, high_hours),
        medium_hours = COALESCE(${body.mediumHours ?? null}, medium_hours),
        low_hours = COALESCE(${body.lowHours ?? null}, low_hours),
        updated_at = NOW()
      WHERE id = 1
      RETURNING high_hours AS "highHours", medium_hours AS "mediumHours", low_hours AS "lowHours"
    `;

    return NextResponse.json({ data: row, error: null });
  } catch (err) {
    console.error("[sla-config PATCH]", err);
    const message = err instanceof Error ? err.message : "Could not update SLA hours.";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
