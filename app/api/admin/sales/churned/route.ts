import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { exportListCsv, wantsCsv } from "@/lib/admin-csv-export";
import { listChurnedMuas } from "@/lib/sales-churned-query";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner", "salesTl"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const u = new URL(request.url);
  const pendingOnly = u.searchParams.get("pending_pipeline") === "1";
  const city = u.searchParams.get("city");
  const source = u.searchParams.get("source");
  const q = u.searchParams.get("q")?.trim() || null;

  const rows = await withTransaction((tx) =>
    listChurnedMuas(tx, {
      pendingPipelineOnly: pendingOnly,
      city,
      source,
      q,
    })
  );

  if (wantsCsv(request)) {
    return exportListCsv("re-engage-muas", [
      { header: "MUA ID", value: (r) => r.displayId ?? "" },
      { header: "MUA", value: (r) => r.muaName },
      { header: "Contact", value: (r) => r.phone ?? "" },
      { header: "City", value: (r) => r.muaCity ?? "" },
      { header: "Source", value: (r) => r.muaSource ?? "" },
      { header: "Last plan", value: (r) => r.lastPlan ?? "" },
      { header: "Plan expiry", value: (r) => r.planExpiry ?? "" },
      { header: "Days since expiry", value: (r) => r.daysSincePlanExpiry },
      { header: "Deal closed RM", value: (r) => r.salesClosedByName ?? "" },
      { header: "Regional RM", value: (r) => r.assignedRmName ?? "" },
      { header: "Plan RM", value: (r) => r.planRmName ?? "" },
      { header: "Current sales RM", value: (r) => r.currentSalesRmName ?? "" },
      { header: "Booking revenue", value: (r) => r.totalBookingRevenue ?? 0 },
      { header: "In active pipeline", value: (r) => r.hasActivePipeline },
    ], rows);
  }

  return NextResponse.json({ data: rows, error: null });
}
