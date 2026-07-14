import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import {
  parseAssignLeadsDate,
  parseAssignLeadsRegion,
  parseAssignLeadsState,
  parseAssignLeadsTier,
} from "@/lib/admin-assign-leads-filters";
import {
  assignedLeadsToCsv,
  fetchAssignedLeads,
} from "@/lib/admin-leads-query";
import { normalizeAssignLeadsSearch } from "@/lib/admin-leads-search";
import { reconcileDueLeads } from "@/lib/lead-lifecycle";
import { normalizeLeadFull } from "@/lib/db-mappers";
import type { LeadStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const status =
    statusParam && statusParam !== "all" ? (statusParam as LeadStatus) : null;
  const region = parseAssignLeadsRegion(searchParams.get("region"));
  const state = parseAssignLeadsState(searchParams.get("state"));
  const budgetTier = parseAssignLeadsTier(searchParams.get("tier"));
  const rmId = searchParams.get("rmId");
  const eventFrom = parseAssignLeadsDate(searchParams.get("eventFrom"));
  const eventTo = parseAssignLeadsDate(searchParams.get("eventTo"));
  const search = normalizeAssignLeadsSearch(searchParams.get("q"));
  const format = searchParams.get("format");

  const rows = await withTransaction(async (tx) => {
    await reconcileDueLeads(tx);
    return fetchAssignedLeads({
      status,
      region,
      state,
      budgetTier,
      rmId: rmId || null,
      eventFrom,
      eventTo,
      search,
    });
  });

  const normalized = rows.map((r) => normalizeLeadFull(r));

  if (format === "csv") {
    return new NextResponse(`\uFEFF${assignedLeadsToCsv(normalized)}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="assigned-leads.csv"',
      },
    });
  }

  return NextResponse.json({ data: normalized, error: null });
}
