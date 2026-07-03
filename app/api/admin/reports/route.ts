import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";

/** @deprecated Use /api/admin/reports/activity and /api/admin/reports/performance */
export async function GET() {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  return NextResponse.json(
    {
      data: null,
      error:
        "This endpoint is deprecated. Use /api/admin/reports/activity for staff comms and /api/admin/reports/performance for RM KPIs and targets.",
    },
    { status: 410 }
  );
}
