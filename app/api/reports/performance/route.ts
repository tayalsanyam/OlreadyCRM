import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { fetchPerformanceReport } from "@/lib/admin-reports-hub-performance-query";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { currentMonthKey } from "@/lib/targets";
import { rowsToCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRoles(["regionalRm", "commissionRm"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const month = searchParams.get("month") || currentMonthKey();
  const staffId = auth.session.userId;

  if (USE_MOCK) {
    const mockTargets = mockStore.getMyTargets(staffId);
    const mockPerf = mockStore.getReports().rmPerformance.find((r) => r.rmId === staffId);
    const data = {
      month,
      staleThresholdHours: 48,
      summary: {
        staffCount: mockPerf ? 1 : 0,
        totalStale: mockPerf?.staleLeads ?? 0,
        totalOverdueIntake: 0,
        targetsSet:
          mockTargets.targetBookings != null ||
          mockTargets.targetLeadsWorked != null ||
          mockTargets.targetAvgMuasPerLead != null
            ? 1
            : 0,
        bookingsOnTrack:
          mockTargets.targetBookings != null &&
          mockTargets.actualBookings >= mockTargets.targetBookings
            ? 1
            : 0,
        bookingsBehind:
          mockTargets.targetBookings != null &&
          mockTargets.actualBookings < mockTargets.targetBookings
            ? 1
            : 0,
        bestConversion: mockPerf?.conversionPct
          ? { name: mockPerf.rmName, pct: mockPerf.conversionPct }
          : null,
      },
      inactiveCriticalHot: [],
      rows: mockPerf
        ? [
            {
              staffId: mockPerf.rmId,
              staffName: mockPerf.rmName,
              role: "regional_rm",
              region: mockPerf.region,
              totalActive: mockPerf.totalActive,
              totalBooked: mockPerf.totalBooked,
              totalShifted: mockPerf.totalShifted,
              conversionPct: mockPerf.conversionPct,
              avgPushesPerLead: mockPerf.avgPushesPerLead,
              staleLeads: mockPerf.staleLeads,
              pendingConfirmation: 0,
              awaitingProfiles: 0,
              overdueIntakeTasks: 0,
              targets: {
                targetBookings: mockTargets.targetBookings,
                targetLeadsWorked: mockTargets.targetLeadsWorked,
                targetAvgMuasPerLead: mockTargets.targetAvgMuasPerLead,
                targetCommission: null,
                actualBookings: mockTargets.actualBookings,
                actualLeadsWorked: mockTargets.actualLeadsWorked,
                actualAvgMuasPerLead: mockTargets.actualAvgMuasPerLead,
                actualCommissionCollected: 0,
                monthConversionPct: 0,
              },
            },
          ]
        : [],
    };

    if (format === "csv") {
      const headers = ["Metric", "Target", "Actual"];
      const row = data.rows[0];
      const csvRows = row
        ? [
            ["Bookings", row.targets?.targetBookings ?? "", row.targets?.actualBookings ?? ""],
            ["Leads worked", row.targets?.targetLeadsWorked ?? "", row.targets?.actualLeadsWorked ?? ""],
            [
              "Avg MUAs per lead",
              row.targets?.targetAvgMuasPerLead ?? "",
              row.targets?.actualAvgMuasPerLead ?? "",
            ],
          ]
        : [];
      return new NextResponse(`\uFEFF${rowsToCsv(headers, csvRows)}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="my-performance.csv"',
        },
      });
    }

    return NextResponse.json({ data, error: null });
  }

  const data = await fetchPerformanceReport(month, staffId);

  if (format === "csv") {
    const row = data.rows[0];
    const headers = ["Metric", "Target", "Actual"];
    const csvRows = row
      ? [
          ["Bookings", row.targets?.targetBookings ?? "", row.targets?.actualBookings ?? ""],
          ["Leads worked", row.targets?.targetLeadsWorked ?? "", row.targets?.actualLeadsWorked ?? ""],
          [
            "Avg MUAs per lead",
            row.targets?.targetAvgMuasPerLead ?? "",
            row.targets?.actualAvgMuasPerLead ?? "",
          ],
          [
            "Commission",
            row.targets?.targetCommission ?? "",
            row.targets?.actualCommissionCollected ?? "",
          ],
        ]
      : [];
    return new NextResponse(`\uFEFF${rowsToCsv(headers, csvRows)}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="my-performance.csv"',
      },
    });
  }

  return NextResponse.json({ data, error: null });
}
