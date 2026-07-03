import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { exportListCsv, wantsCsv } from "@/lib/admin-csv-export";
import {
  expiredAdminLeadsToCsv,
  fetchAdminLeadsByStatus,
  fetchExpiredAdminLeads,
} from "@/lib/admin-leads-query";
import { BUDGET_TIER_LABELS, LEAD_STATUS_LABELS, type LeadFull, type LeadStatus, type Region } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status") ?? "archived";
  const statuses = statusParam.split(",").map((s) => s.trim()) as LeadStatus[];
  const region = searchParams.get("region") as Region | null;
  const rmId = searchParams.get("rmId");
  const parsedRegion =
    region && ["north", "east", "west", "south"].includes(region) ? region : null;

  const isExpiredOnly =
    statuses.length === 1 && statuses[0] === "expired";

  if (isExpiredOnly) {
    const rows = await fetchExpiredAdminLeads({
      region: parsedRegion,
      rmId: rmId || null,
    });

    if (wantsCsv(request)) {
      return new NextResponse(`\uFEFF${expiredAdminLeadsToCsv(rows)}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="expired-leads.csv"',
        },
      });
    }

    return NextResponse.json({ data: rows, error: null });
  }

  const rows = await fetchAdminLeadsByStatus({
    statuses,
    region: parsedRegion,
    rmId: rmId || null,
  });

  if (wantsCsv(request)) {
    return exportListCsv(`admin-leads-${statusParam}`, [
      { header: "Display ID", value: (r) => (r as LeadFull).displayId },
      { header: "Bride", value: (r) => (r as LeadFull).brideName },
      { header: "Region", value: (r) => (r as LeadFull).region },
      { header: "Event date", value: (r) => (r as LeadFull).eventDate ?? "" },
      { header: "Budget tier", value: (r) => BUDGET_TIER_LABELS[(r as LeadFull).budgetTier] ?? (r as LeadFull).budgetTier },
      { header: "Status", value: (r) => LEAD_STATUS_LABELS[(r as LeadFull).status] ?? (r as LeadFull).status },
      { header: "Expired at", value: (r) => (r as LeadFull).expiredAt ?? "" },
      { header: "Assigned RM", value: (r) => (r as LeadFull).assignedRmName ?? "" },
    ], rows as unknown as LeadFull[]);
  }

  return NextResponse.json({ data: rows, error: null });
}
