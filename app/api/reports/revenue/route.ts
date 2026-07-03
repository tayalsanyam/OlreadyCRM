import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { scopeFromSession } from "@/lib/report-scope";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { csvResponse } from "@/lib/report-utils";
import {
  buildRevenueSummary,
  fetchRevenueReportRows,
  revenueRowToCsv,
} from "@/lib/revenue-report-query";

export async function GET(request: Request) {
  const auth = await requireRoles(["regionalRm", "commissionRm", "feedbackRm"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const scope = scopeFromSession(auth.session);
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const month = searchParams.get("month");
  const region = searchParams.get("region");
  const tier = searchParams.get("tier");
  const bookingFrom = searchParams.get("bookingFrom");
  const bookingTo = searchParams.get("bookingTo");

  const scopeRmId = scope.kind === "rm" ? scope.staffId : null;
  const scopeCommission = scope.kind === "commission";
  const scopeFeedback = scope.kind === "feedback";

  if (USE_MOCK) {
    const data = mockStore.getRevenueReport({ month, region, rmId: scopeRmId ?? null, tier });
    if (format === "csv") {
      return csvResponse(
        "my-revenue",
        ["Date", "Bride", "Ceremony", "MUA", "Booked Price", "Outstanding", "Status"],
        data.rows.map((r) => [
          r.bookingDate,
          r.brideName,
          r.ceremonyType,
          r.muaName,
          r.bookedPrice,
          r.outstanding,
          r.status,
        ])
      );
    }
    return NextResponse.json({ data, error: null });
  }

  const enriched = await fetchRevenueReportRows({
    month,
    bookingFrom,
    bookingTo,
    region,
    tier,
    scopeRmId,
    scopeCommission,
    scopeFeedback,
  });

  const summary = buildRevenueSummary(enriched);

  if (format === "csv") {
    return csvResponse(
      "my-revenue",
      ["Date", "Bride", "Ceremony", "MUA", "Booked Price", "Outstanding", "Status"],
      enriched.map((r) => [
        r.bookingDate,
        r.brideName,
        r.ceremonyType,
        r.muaName,
        r.bookedPrice,
        r.outstanding,
        r.status,
      ])
    );
  }

  return NextResponse.json({ data: { rows: enriched, summary }, error: null });
}
