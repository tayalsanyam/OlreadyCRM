import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import {
  parseAssignLeadsDate,
  parseAssignLeadsRegion,
  parseAssignLeadsStatus,
  parseAssignLeadsTier,
} from "@/lib/admin-assign-leads-filters";
import {
  assignLeadLogToCsv,
  fetchAssignLeadLogRows,
  type AssignLeadLogView,
} from "@/lib/admin-lead-log-export";
import { parseAdminExitBucket, parseExitSourceFilter } from "@/lib/lead-exit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") as AssignLeadLogView | null;
  if (!view || !["unassigned", "assigned", "attrition"].includes(view)) {
    return NextResponse.json(
      { data: null, error: "view must be unassigned, assigned, or attrition" },
      { status: 400 }
    );
  }

  const rows = await fetchAssignLeadLogRows({
    view,
    region: parseAssignLeadsRegion(searchParams.get("region")),
    budgetTier: parseAssignLeadsTier(searchParams.get("tier")),
    status: parseAssignLeadsStatus(searchParams.get("status")),
    eventFrom: parseAssignLeadsDate(searchParams.get("eventFrom")),
    eventTo: parseAssignLeadsDate(searchParams.get("eventTo")),
    bucket: parseAdminExitBucket(searchParams.get("bucket")),
    source: parseExitSourceFilter(searchParams.get("source")),
  });

  const csv = assignLeadLogToCsv(rows);
  const filename = `lead-log-${view}.csv`;

  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
