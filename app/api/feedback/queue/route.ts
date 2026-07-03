import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import {
  FEEDBACK_QUEUE_TABS,
  type FeedbackQueueTab,
} from "@/lib/feedback-constants";
import { fetchFeedbackQueue } from "@/lib/feedback-queue";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRoles(["feedbackRm", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const tab = (new URL(request.url).searchParams.get("tab") ??
    "to_call") as FeedbackQueueTab;
  if (!FEEDBACK_QUEUE_TABS.includes(tab)) {
    return NextResponse.json({ data: null, error: "Invalid tab" }, { status: 400 });
  }

  const data = await fetchFeedbackQueue(tab, auth.session.userId);
  return NextResponse.json({ data, error: null });
}
