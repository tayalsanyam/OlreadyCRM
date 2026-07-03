import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { currentMonthKey, queryTargetVsActual } from "@/lib/targets";

export async function GET() {
  const auth = await requireRoles(["regionalRm"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const month = currentMonthKey();

  if (USE_MOCK) {
    return NextResponse.json({
      data: mockStore.getMyTargets(auth.session.userId),
      error: null,
    });
  }

  const rows = await queryTargetVsActual(sql, month, auth.session.userId);
  const row = rows[0];
  if (!row) {
    return NextResponse.json({
      data: {
        targetBookings: null,
        targetLeadsWorked: null,
        targetAvgMuasPerLead: null,
        actualBookings: 0,
        actualLeadsWorked: 0,
        actualAvgMuasPerLead: 0,
      },
      error: null,
    });
  }

  return NextResponse.json({
    data: {
      targetBookings: row.targetBookings,
      targetLeadsWorked: row.targetLeadsWorked,
      targetAvgMuasPerLead: row.targetAvgMuasPerLead,
      actualBookings: row.actualBookings,
      actualLeadsWorked: row.actualLeadsWorked,
      actualAvgMuasPerLead: row.actualAvgMuasPerLead,
    },
    error: null,
  });
}
