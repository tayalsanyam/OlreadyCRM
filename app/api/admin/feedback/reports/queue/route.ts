import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { fetchFeedbackAdminQueueStats } from "@/lib/feedback-queue";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const data = await fetchFeedbackAdminQueueStats();
  return NextResponse.json({ data, error: null });
}
