import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { canAccessMuaByRole, muaInRegion } from "@/lib/mua-access";
import { fetchMuaPlanPeriodDetail } from "@/lib/mua-plan-period-detail";
import type { SessionUser } from "@/lib/types";

async function authorize(
  session: SessionUser,
  muaId: string
): Promise<boolean> {
  if (session.role === "admin" || session.role === "owner") return true;
  if (session.role === "commissionRm") return true;
  if (session.role === "regionalRm" && session.region) {
    if (USE_MOCK) return mockStore.muaInRegionMock(muaId, session.region);
    return muaInRegion(muaId, session.region);
  }
  return canAccessMuaByRole(session, false);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; historyId: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: muaId, historyId } = await params;
  if (!(await authorize(auth.session, muaId))) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const [exists] = await sql<{ id: string }[]>`
    SELECT id FROM muas WHERE id = ${muaId}::uuid
  `;
  if (!exists) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  if (USE_MOCK) {
    return NextResponse.json({
      data: null,
      error: "Plan period detail is not available in mock mode",
    });
  }

  const data = await fetchMuaPlanPeriodDetail(muaId, historyId);
  if (!data) {
    return NextResponse.json({ data: null, error: "Plan period not found" }, { status: 404 });
  }

  return NextResponse.json({ data, error: null });
}
