import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { canAccessMuaByRole, muaInRegion } from "@/lib/mua-access";
import { fetchMuaPlanHistory } from "@/lib/mua-detail";
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
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!(await authorize(auth.session, id))) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  if (USE_MOCK) {
    return NextResponse.json({
      data: mockStore.getMuaPlanHistory(id),
      error: null,
    });
  }

  const data = await fetchMuaPlanHistory(id);
  return NextResponse.json({ data, error: null });
}
