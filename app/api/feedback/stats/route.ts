import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { fetchFeedbackStats } from "@/lib/feedback-queue";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRoles(["feedbackRm"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const data = await fetchFeedbackStats(auth.session.userId);
  return NextResponse.json({ data, error: null });
}
