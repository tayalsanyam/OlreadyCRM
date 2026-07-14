import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { apiErrorResponse } from "@/lib/api-error-response";
import { withTransaction } from "@/db/index";
import { parseOverviewDateRange } from "@/lib/admin-overview-date-range";
import {
  fetchDayEndOverview,
  fetchDayEndReportDetail,
} from "@/lib/day-end-queries";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const checkoutId = searchParams.get("checkoutId");

  try {
    if (checkoutId) {
      const detail = await withTransaction((tx) =>
        fetchDayEndReportDetail(tx, checkoutId),
      );
      return NextResponse.json({ data: detail, error: null });
    }

    const range = parseOverviewDateRange(searchParams);
    const data = await withTransaction((tx) =>
      fetchDayEndOverview(tx, {
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        roleFilter: searchParams.get("role"),
      }),
    );
    return NextResponse.json({ data, error: null });
  } catch (error) {
    return apiErrorResponse(error, "Failed to load day end overview");
  }
}
