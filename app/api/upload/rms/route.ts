import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { mockUsers, USE_MOCK } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRoles(["leadUploader", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  if (USE_MOCK) {
    return NextResponse.json({
      data: mockUsers
        .filter((u) => u.role === "regionalRm")
        .map((u) => ({ id: u.id, name: u.name, region: u.region, regions: [u.region] })),
      error: null,
    });
  }

  const rms = await sql<
    { id: string; name: string; region: string; regions: string[] | null }[]
  >`
    SELECT id, name, region::text AS region, regions::text[] AS regions FROM staff
    WHERE role = 'regional_rm' AND active = true
    ORDER BY name
  `;

  return NextResponse.json({
    data: rms.map((r) => ({
      id: r.id,
      name: r.name,
      region: r.region,
      regions: r.regions?.length ? r.regions : [r.region],
    })),
    error: null,
  });
}
