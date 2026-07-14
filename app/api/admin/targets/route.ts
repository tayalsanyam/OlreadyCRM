import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import {
  currentMonthKey,
  monthBounds,
  queryTargetVsActual,
} from "@/lib/targets";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") ?? currentMonthKey();

  if (USE_MOCK) {
    return NextResponse.json({
      data: mockStore.getTargets(month),
      error: null,
    });
  }

  const rows = await queryTargetVsActual(sql, month);
  return NextResponse.json({ data: rows, error: null });
}

export async function POST(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as {
    staffId?: string;
    month?: string;
    targetBookings?: number;
    targetLeadsWorked?: number;
    targetAvgMuasPerLead?: number;
    targetCommission?: number;
    notes?: string;
  };

  if (!body.staffId || !body.month) {
    return NextResponse.json(
      { data: null, error: "staffId and month required" },
      { status: 400 }
    );
  }

  const { start, end } = monthBounds(body.month);

  if (USE_MOCK) {
    mockStore.setTarget({
      staffId: body.staffId,
      month: body.month,
      targetBookings: body.targetBookings ?? 0,
      targetLeadsWorked: body.targetLeadsWorked ?? 0,
      targetAvgMuasPerLead: body.targetAvgMuasPerLead ?? 3,
      targetCommission: body.targetCommission ?? null,
      notes: body.notes ?? null,
    });
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  await sql`
    INSERT INTO rm_targets (
      staff_id, period_start, period_end,
      target_bookings, target_leads_worked, target_avg_muas_per_lead,
      target_commission,
      notes, set_by
    ) VALUES (
      ${body.staffId}::uuid,
      ${start}::date,
      ${end}::date,
      ${body.targetBookings ?? 0},
      ${body.targetLeadsWorked ?? 0},
      ${body.targetAvgMuasPerLead ?? 3},
      ${body.targetCommission ?? null},
      ${body.notes ?? null},
      ${auth.session.userId}::uuid
    )
    ON CONFLICT (staff_id, period_start) DO UPDATE SET
      period_end = EXCLUDED.period_end,
      target_bookings = EXCLUDED.target_bookings,
      target_leads_worked = EXCLUDED.target_leads_worked,
      target_avg_muas_per_lead = EXCLUDED.target_avg_muas_per_lead,
      target_commission = EXCLUDED.target_commission,
      notes = EXCLUDED.notes,
      set_by = EXCLUDED.set_by
  `;

  return NextResponse.json({ data: { ok: true }, error: null });
}
