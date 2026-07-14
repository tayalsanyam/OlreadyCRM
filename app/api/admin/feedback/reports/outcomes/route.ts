import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { fetchFeedbackAdminQueueStats } from "@/lib/feedback-queue";
import {
  fetchFeedbackOutcomesReport,
  type FeedbackReportScope,
} from "@/lib/feedback-reports";
import { csvResponse } from "@/lib/report-utils";

export const dynamic = "force-dynamic";

function resolveStaffId(
  scope: FeedbackReportScope,
  staffIdParam: string | null,
  fallbackStaffId: string
): string {
  if (scope === "mine" && staffIdParam) return staffIdParam;
  return fallbackStaffId;
}

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const scope: FeedbackReportScope =
    searchParams.get("scope") === "mine" ? "mine" : "team";
  const month = searchParams.get("month");
  const format = searchParams.get("format");
  const staffIdParam = searchParams.get("staffId");
  const staffId = resolveStaffId(scope, staffIdParam, auth.session.userId);

  const data = await fetchFeedbackOutcomesReport({
    scope,
    staffId,
    month,
  });
  const queue = await fetchFeedbackAdminQueueStats();

  if (format === "csv") {
    const suffix =
      scope === "mine" && staffIdParam ? `staff-${staffIdParam}` : scope;
    return csvResponse(
      `feedback-outcomes-${suffix}`,
      [
        "Date",
        "Lead",
        "Bride",
        "Outcome",
        "Sentiment",
        "Olready ★",
        "MUA ★",
        "MUA type",
        "Engage again",
        "Logged by",
      ],
      data.rows.map((r) => [
        r.createdAt.slice(0, 10),
        r.displayId,
        r.brideName,
        r.connectionStatus,
        r.serviceSentiment ?? "",
        r.olreadyRating ?? "",
        r.muaRating ?? "",
        r.muaType,
        r.engageAgain ?? "",
        r.submittedByName ?? "",
      ])
    );
  }

  return NextResponse.json({
    data: { summary: data.summary, rows: data.rows, queue },
    error: null,
  });
}
