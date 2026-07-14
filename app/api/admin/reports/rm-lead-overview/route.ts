import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { csvResponse } from "@/lib/report-utils";
import { fetchRmLeadOverviewRows } from "@/lib/rm-lead-overview-query";
import { parseRmOverviewStatusFilters } from "@/lib/rm-lead-overview-filters";
import { csvDateCell, csvDateTimeCell } from "@/lib/utils";

const CSV_HEADERS = [
  "Lead ID",
  "Bride",
  "RM",
  "RM role",
  "Region",
  "Tier",
  "DB status",
  "Phase",
  "Funnel stage",
  "Push stage",
  "Pushes",
  "Bookings",
  "Last activity",
  "Last contact",
  "Event date",
] as const;

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");

  if (USE_MOCK) {
    return NextResponse.json({ data: { rows: [] }, error: null });
  }

  const rows = await fetchRmLeadOverviewRows({
    rmId: searchParams.get("rmId"),
    rmRole: searchParams.get("rmRole"),
    region: searchParams.get("region"),
    tier: searchParams.get("tier"),
    statuses: parseRmOverviewStatusFilters(searchParams.get("statuses")),
    eventFrom: searchParams.get("eventFrom"),
    eventTo: searchParams.get("eventTo"),
    search: searchParams.get("q"),
    assignedOnly: searchParams.get("assignedOnly") !== "false",
  });

  if (format === "csv") {
    return csvResponse(
      "rm-lead-overview",
      [...CSV_HEADERS],
      rows.map((r) => [
        r.displayId,
        r.brideName,
        r.rmName ?? "",
        r.rmRole ?? "",
        r.region ?? "",
        r.budgetTier,
        r.status,
        r.leadPhase ?? "",
        r.funnelStage,
        r.latestPushStage ?? "",
        r.pushCount,
        r.bookingCount,
        r.lastActivitySummary ?? r.lastActivityType ?? "",
        csvDateTimeCell(r.lastContactAt),
        csvDateCell(r.eventDate),
      ])
    );
  }

  return NextResponse.json({
    data: { rows, count: rows.length },
    error: null,
  });
}
