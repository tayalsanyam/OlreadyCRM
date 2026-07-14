import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { apiErrorResponse } from "@/lib/api-error-response";
import { listActiveCommissionRms } from "@/lib/commission-rm-staff";
import { mockUsers, USE_MOCK } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const roleFilter = new URL(request.url).searchParams.get("role");
  const wantCommission =
    roleFilter === "commission" || roleFilter === "commission_rm";

  if (USE_MOCK) {
    const role = wantCommission ? "commissionRm" : "regionalRm";
    return NextResponse.json({
      data: mockUsers
        .filter((u) => u.role === role)
        .map((u) => ({ id: u.id, name: u.name, region: u.region })),
      error: null,
    });
  }

  try {
    if (wantCommission) {
      const rows = await listActiveCommissionRms(sql);
      return NextResponse.json({
        data: rows.map((r) => ({
          id: r.id,
          name: r.name,
          region: null,
          regions: [] as string[],
        })),
        error: null,
      });
    }

    const rms = await sql<
      { id: string; name: string; region: string | null; regions: string[] | null }[]
    >`
      SELECT id, name, region::text AS region, regions::text[] AS regions
      FROM staff
      WHERE role = 'regional_rm'::user_role AND active = true
      ORDER BY name
    `;
    return NextResponse.json({
      data: rms.map((r) => ({
        id: r.id,
        name: r.name,
        region: r.region,
        regions: r.regions?.length ? r.regions : r.region ? [r.region] : [],
      })),
      error: null,
    });
  } catch (e) {
    return apiErrorResponse(e, "Failed to load RMs");
  }
}
