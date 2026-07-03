import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import {
  parseAssignLeadsDate,
  parseAssignLeadsRegion,
  parseAssignLeadsState,
  parseAssignLeadsTier,
} from "@/lib/admin-assign-leads-filters";
import {
  fetchUnassignedLeads,
  unassignedLeadsToCsv,
} from "@/lib/admin-leads-query";
import { leadMatchesAssignSearch, normalizeAssignLeadsSearch } from "@/lib/admin-leads-search";
import { reconcileDueLeads } from "@/lib/lead-lifecycle";
import { withTransaction } from "@/db/index";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import type { BrideLead, Region } from "@/lib/types";

function filterMock(
  leads: BrideLead[],
  region: Region | null,
  budgetTier: BrideLead["budgetTier"] | null,
  eventFrom: string | null,
  eventTo: string | null,
  search: string | null
) {
  return leads.filter((l) => {
    if (region && l.region !== region) return false;
    if (budgetTier && l.budgetTier !== budgetTier) return false;
    if (eventFrom && l.eventDate < eventFrom) return false;
    if (eventTo && l.eventDate > eventTo) return false;
    if (!leadMatchesAssignSearch(l, search)) return false;
    return true;
  });
}

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const region = parseAssignLeadsRegion(searchParams.get("region"));
  const state = parseAssignLeadsState(searchParams.get("state"));
  const budgetTier = parseAssignLeadsTier(searchParams.get("tier"));
  const eventFrom = parseAssignLeadsDate(searchParams.get("eventFrom"));
  const eventTo = parseAssignLeadsDate(searchParams.get("eventTo"));
  const search = normalizeAssignLeadsSearch(searchParams.get("q"));
  const format = searchParams.get("format");

  if (USE_MOCK) {
    const rows = filterMock(
      mockStore.getUnassignedLeads(),
      region,
      budgetTier,
      eventFrom,
      eventTo,
      search
    );
    if (format === "csv") {
      return new NextResponse(`\uFEFF${unassignedLeadsToCsv(rows)}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="unassigned-leads.csv"',
        },
      });
    }
    return NextResponse.json({ data: rows, error: null });
  }

  const leads = await withTransaction(async (tx) => {
    await reconcileDueLeads(tx);
    return fetchUnassignedLeads({ region, state, budgetTier, eventFrom, eventTo, search });
  });

  if (format === "csv") {
    return new NextResponse(`\uFEFF${unassignedLeadsToCsv(leads)}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="unassigned-leads.csv"',
      },
    });
  }

  return NextResponse.json({ data: leads, error: null });
}
