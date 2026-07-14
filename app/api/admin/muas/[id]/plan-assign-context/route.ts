import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { fetchAdminPlanAssignContext } from "@/lib/admin-plan-assign-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const data = await fetchAdminPlanAssignContext(id);
  if (!data) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ data, error: null });
}
