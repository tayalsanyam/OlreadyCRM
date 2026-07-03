import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import {
  fetchFeedbackOutcomesReport,
  type FeedbackReportScope,
} from "@/lib/feedback-reports";
import { csvResponse } from "@/lib/report-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRoles(["feedbackRm"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const scopeParam = searchParams.get("scope");
  const scope: FeedbackReportScope = scopeParam === "team" ? "team" : "mine";
  const month = searchParams.get("month");
  const format = searchParams.get("format");

  const data = await fetchFeedbackOutcomesReport({
    scope,
    staffId: auth.session.userId,
    month,
  });

  if (format === "csv") {
    return csvResponse(
      `feedback-outcomes-${scope}`,
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

  return NextResponse.json({ data, error: null });
}
