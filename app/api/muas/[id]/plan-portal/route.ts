import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { canAccessMuaByRole, muaInRegion } from "@/lib/mua-access";
import { fetchMuaPlanPortal } from "@/lib/mua-plan-portal";
import type { Region } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id: muaId } = await params;

  const [mua] = await sql<{ city: string | null }[]>`
    SELECT city FROM muas WHERE id = ${muaId}::uuid
  `;
  if (!mua) {
    return NextResponse.json({ data: null, error: "MUA not found" }, { status: 404 });
  }

  const regionOk = auth.session.region
    ? await muaInRegion(muaId, auth.session.region as Region)
    : true;
  if (!canAccessMuaByRole(auth.session, regionOk)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const data = await fetchMuaPlanPortal(muaId);
  if (!data) {
    return NextResponse.json({ data: null, error: "MUA not found" }, { status: 404 });
  }

  return NextResponse.json({ data, error: null });
}
