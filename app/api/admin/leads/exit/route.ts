import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import {
  parseAssignLeadsDate,
  parseAssignLeadsRegion,
  parseAssignLeadsState,
  parseAssignLeadsTier,
} from "@/lib/admin-assign-leads-filters";
import {
  adminExitLeadsToCsv,
  bucketToViewSub,
  fetchAdminExitCounts,
  fetchAdminExitLeads,
  parseAdminOffWorkingView,
  parseAdminReviewSubFilter,
  type AdminExitBucket,
} from "@/lib/admin-exit-leads-query";
import { parseAdminExitBucket, parseExitSourceFilter } from "@/lib/lead-exit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const bucket = parseAdminExitBucket(searchParams.get("bucket"));
  const view = parseAdminOffWorkingView(searchParams.get("view") ?? searchParams.get("tab"));
  const subFilter = parseAdminReviewSubFilter(
    searchParams.get("sub") ?? searchParams.get("bucket")
  );
  const legacy = bucketToViewSub(bucket);
  const resolvedView = searchParams.get("view") || searchParams.get("tab") ? view : legacy.view;
  const resolvedSub =
    searchParams.get("sub") || (searchParams.get("bucket") && bucket !== "all")
      ? subFilter
      : legacy.sub;
  const source = parseExitSourceFilter(searchParams.get("source"));
  const countsOnly = searchParams.get("counts") === "true";
  const format = searchParams.get("format");
  const region = parseAssignLeadsRegion(searchParams.get("region"));
  const state = parseAssignLeadsState(searchParams.get("state"));
  const budgetTier = parseAssignLeadsTier(searchParams.get("tier"));
  const rmId = searchParams.get("rmId");
  const eventFrom = parseAssignLeadsDate(searchParams.get("eventFrom"));
  const eventTo = parseAssignLeadsDate(searchParams.get("eventTo"));
  const regionFilter = region;
  const queryFilters = {
    region: regionFilter,
    state,
    rmId: rmId || null,
    budgetTier,
    eventFrom,
    eventTo,
    view: resolvedView,
    subFilter: resolvedSub,
  };

  if (countsOnly) {
    const counts = await fetchAdminExitCounts({ ...queryFilters, scope: resolvedView });
    return NextResponse.json({ data: { counts }, error: null });
  }

  const rows = await fetchAdminExitLeads({
    ...queryFilters,
    source,
    bucket,
  });

  if (format === "csv") {
    const csv = adminExitLeadsToCsv(rows);
    const suffix = [bucket !== "all" ? bucket : null, source !== "all" ? source : null]
      .filter(Boolean)
      .join("-");
    const filename = suffix
      ? `olready-leads-off-working-${suffix}.csv`
      : "olready-leads-off-working.csv";
    return new NextResponse(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const counts = await fetchAdminExitCounts({ ...queryFilters, scope: "all" });

  return NextResponse.json({
    data: { leads: rows, counts },
    error: null,
  });
}
