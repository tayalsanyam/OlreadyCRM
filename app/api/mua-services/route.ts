import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { listMuaServiceCatalog } from "@/lib/mua-service-catalog";

/** Active service catalog for MUA create/edit pickers (all staff). */
export async function GET() {
  const auth = await requireRoles([
    "admin",
    "owner",
    "salesRm",
    "salesTl",
    "salesActivation",
    "regionalRm",
    "commissionRm",
  ]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const rows = await listMuaServiceCatalog(sql, { activeOnly: true });
  return NextResponse.json({ data: rows, error: null });
}
