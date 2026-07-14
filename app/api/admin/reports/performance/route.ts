import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { fetchPerformanceReport } from "@/lib/admin-reports-hub-performance-query";
import { rowsToCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const data = await fetchPerformanceReport(searchParams.get("month"));

  if (format === "csv") {
    const headers = [
      "Staff",
      "Role",
      "Region",
      "Active leads",
      "Booked (pipeline)",
      "Shifted",
      "Conversion %",
      "Avg pushes",
      "Stale",
      "Pending confirm",
      "Awaiting profiles",
      "Overdue intake",
      "Target bookings",
      "Actual bookings (month)",
      "Target leads worked",
      "Actual leads worked (month)",
      "Target avg MUAs",
      "Actual avg MUAs (month)",
      "Target commission",
      "Actual commission (month)",
    ];
    const csvRows = data.rows.map((r) => [
      r.staffName,
      r.role,
      r.region,
      r.totalActive,
      r.totalBooked,
      r.totalShifted,
      r.conversionPct ?? "",
      r.avgPushesPerLead ?? "",
      r.staleLeads,
      r.pendingConfirmation,
      r.awaitingProfiles,
      r.overdueIntakeTasks,
      r.targets?.targetBookings ?? "",
      r.targets?.actualBookings ?? "",
      r.targets?.targetLeadsWorked ?? "",
      r.targets?.actualLeadsWorked ?? "",
      r.targets?.targetAvgMuasPerLead ?? "",
      r.targets?.actualAvgMuasPerLead ?? "",
      r.targets?.targetCommission ?? "",
      r.targets?.actualCommissionCollected ?? "",
    ]);
    return new NextResponse(`\uFEFF${rowsToCsv(headers, csvRows)}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="performance-report.csv"',
      },
    });
  }

  return NextResponse.json({ data, error: null });
}
