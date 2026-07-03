import { NextResponse } from "next/server";
import { paginate, sql } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { canAccessMuaByRole, muaInRegion } from "@/lib/mua-access";
import { fetchMuaPushes } from "@/lib/mua-detail";
import { MUA_PUSHES_CSV_HEADERS, muaPushesToCsvRows } from "@/lib/mua-pushes-export";
import { csvResponse } from "@/lib/report-utils";
import type { Region, SessionUser } from "@/lib/types";

async function authorize(
  session: SessionUser,
  muaId: string
): Promise<{ ok: true; region: Region | null } | { ok: false; status: number }> {
  if (session.role === "admin" || session.role === "owner") {
    return { ok: true, region: null };
  }
  if (session.role === "commissionRm") {
    return { ok: true, region: null };
  }
  if (session.role === "regionalRm" && session.region) {
    if (USE_MOCK) {
      if (!mockStore.muaInRegionMock(muaId, session.region)) {
        return { ok: false, status: 403 };
      }
      return { ok: true, region: session.region };
    }
    const ok = await muaInRegion(muaId, session.region);
    if (!ok) return { ok: false, status: 403 };
    return { ok: true, region: session.region };
  }
  if (!canAccessMuaByRole(session, false)) {
    return { ok: false, status: 403 };
  }
  return { ok: true, region: null };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const gate = await authorize(auth.session, id);
  if (!gate.ok) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "20");
  const stage = searchParams.get("stage");
  const tier = searchParams.get("tier");

  if (USE_MOCK) {
    const all = mockStore.getMuaPushes(id, gate.region);
    const filtered = all.filter((p) => {
      if (stage && p.stage !== stage) return false;
      if (tier && p.budgetTier !== tier) return false;
      return true;
    });
    if (format === "csv") {
      const muaDetail = mockStore.getMuaDetail(id);
      return csvResponse(
        `mua-pushes-${muaDetail?.displayId ?? id.slice(0, 8)}`,
        [...MUA_PUSHES_CSV_HEADERS],
        muaPushesToCsvRows(filtered)
      );
    }
    return NextResponse.json({
      data: paginate(filtered, { page, pageSize }),
      error: null,
    });
  }

  if (format === "csv") {
    const { rows } = await fetchMuaPushes(id, {
      page: 1,
      pageSize: 100_000,
      stage,
      tier,
      region: gate.region,
    });
    const [mua] = await sql<{ displayId: string }[]>`
      SELECT display_id AS "displayId" FROM muas WHERE id = ${id}::uuid
    `;
    const slug = mua?.displayId ?? id.slice(0, 8);
    return csvResponse(
      `mua-pushes-${slug}`,
      [...MUA_PUSHES_CSV_HEADERS],
      muaPushesToCsvRows(rows)
    );
  }

  const { rows, total } = await fetchMuaPushes(id, {
    page,
    pageSize,
    stage,
    tier,
    region: gate.region,
  });

  return NextResponse.json({
    data: {
      data: rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
    error: null,
  });
}
