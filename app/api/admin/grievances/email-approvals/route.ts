import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { fetchPendingEmailApprovals } from "@/lib/pending-email-approvals-query";

export async function GET() {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const rows = await fetchPendingEmailApprovals();
  return NextResponse.json({ data: rows, error: null });
}
