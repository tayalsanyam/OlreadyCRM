import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { listFeedbackStaff } from "@/lib/feedback-queue";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const staff = await listFeedbackStaff();
  return NextResponse.json({ data: staff, error: null });
}
