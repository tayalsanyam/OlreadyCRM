import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { apiErrorResponse } from "@/lib/api-error-response";
import { withTransaction } from "@/db/index";
import { parseOverviewDateRange } from "@/lib/admin-overview-date-range";
import { fetchDayEndConsolidated } from "@/lib/day-end-queries";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const range = parseOverviewDateRange(searchParams);

  try {
    const data = await withTransaction((tx) =>
      fetchDayEndConsolidated(tx, {
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        roleFilter: searchParams.get("role"),
        templateFilter: searchParams.get("template"),
      }),
    );
    return NextResponse.json({ data, error: null });
  } catch (error) {
    return apiErrorResponse(error, "Failed to load consolidated day end reports");
  }
}
