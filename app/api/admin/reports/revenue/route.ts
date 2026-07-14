import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { csvResponse } from "@/lib/report-utils";
import {
  buildRevenueSummary,
  fetchRevenueReportRows,
  REVENUE_CSV_HEADERS,
  revenueRowToCsv,
} from "@/lib/revenue-report-query";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const includeCancelled = searchParams.get("includeCancelled") === "true";

  if (USE_MOCK) {
    const data = mockStore.getRevenueReport({
      month: searchParams.get("month"),
      region: searchParams.get("region"),
      rmId: searchParams.get("rmId"),
      tier: searchParams.get("tier"),
    });
    if (format === "csv") {
      return csvResponse(
        "revenue",
        [...REVENUE_CSV_HEADERS],
        data.rows.map((r) => revenueRowToCsv(r as Parameters<typeof revenueRowToCsv>[0]))
      );
    }
    return NextResponse.json({ data, error: null });
  }

  const enriched = await fetchRevenueReportRows({
    month: searchParams.get("month"),
    bookingFrom: searchParams.get("bookingFrom"),
    bookingTo: searchParams.get("bookingTo"),
    region: searchParams.get("region"),
    rmId: searchParams.get("rmId"),
    tier: searchParams.get("tier"),
    includeCancelled,
  });

  const summary = buildRevenueSummary(enriched);

  if (format === "csv") {
    return csvResponse(
      "revenue",
      [...REVENUE_CSV_HEADERS],
      enriched.map(revenueRowToCsv)
    );
  }

  return NextResponse.json({ data: { rows: enriched, summary }, error: null });
}
