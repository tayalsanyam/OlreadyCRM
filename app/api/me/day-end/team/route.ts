import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { apiErrorResponse } from "@/lib/api-error-response";
import { withTransaction } from "@/db/index";
import { resolveTlTeamMemberIds } from "@/lib/sales-report-scope";
import {
  parseOptionalOverviewDate,
  parseOverviewDateRange,
} from "@/lib/admin-overview-date-range";
import {
  fetchDayEndOverview,
  fetchDayEndCumulativeOverview,
  fetchDayEndReportDetail,
  fetchDayEndReportDetailForStaff,
} from "@/lib/day-end-queries";

function parseTeamDateRange(searchParams: URLSearchParams) {
  const singleDate = parseOptionalOverviewDate(searchParams.get("date"));
  if (singleDate) {
    return { dateFrom: singleDate, dateTo: singleDate };
  }
  return parseOverviewDateRange(searchParams);
}

export async function GET(request: Request) {
  const auth = await requireRoles(["salesTl", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const checkoutId = searchParams.get("checkoutId");

  try {
    const data = await withTransaction(async (tx) => {
      let staffIds: string[] | null = null;
      if (auth.session.role === "salesTl") {
        staffIds = await resolveTlTeamMemberIds(tx, auth.session.userId);
      }

      if (checkoutId) {
        if (auth.session.role === "salesTl") {
          if (!staffIds?.length) return null;
          return fetchDayEndReportDetailForStaff(tx, checkoutId, staffIds);
        }
        return fetchDayEndReportDetail(tx, checkoutId);
      }

      const range = parseTeamDateRange(searchParams);
      const mode = searchParams.get("mode");
      const isCumulative =
        mode === "cumulative" ||
        (mode !== "day" && range.dateFrom !== range.dateTo);

      if (isCumulative) {
        return fetchDayEndCumulativeOverview(tx, {
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
          staffIds,
          roleFilter: auth.session.role === "salesTl" ? null : searchParams.get("role"),
        });
      }

      return fetchDayEndOverview(tx, {
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        staffIds,
        roleFilter: auth.session.role === "salesTl" ? null : searchParams.get("role"),
      });
    });

    if (checkoutId && !data) {
      return NextResponse.json(
        { data: null, error: "Report not found or not in your team" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (error) {
    return apiErrorResponse(error, "Failed to load team day end reports");
  }
}
