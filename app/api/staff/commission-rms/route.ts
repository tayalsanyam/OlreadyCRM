import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { listActiveCommissionRms } from "@/lib/commission-rm-staff";
import { mockUsers, USE_MOCK } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRoles([
    "leadUploader",
    "regionalRm",
    "admin",
    "owner",
  ]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  if (USE_MOCK) {
    return NextResponse.json({
      data: mockUsers
        .filter((u) => u.role === "commissionRm" && u.active)
        .map((u) => ({ id: u.id, name: u.name })),
      error: null,
    });
  }

  const rows = await listActiveCommissionRms(sql);
  return NextResponse.json({ data: rows, error: null });
}
