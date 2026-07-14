import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { apiErrorResponse } from "@/lib/api-error-response";
import { requireRoles } from "@/lib/api-auth";
import {
  fetchAdminDashboardCallyzerSummary,
  fetchAdminDashboardKpis,
  fetchAdminDashboardPortfolio,
} from "@/lib/admin-dashboard-query";
import {
  overviewMonthLabel,
  overviewMonthToDateRange,
  parseOverviewMonth,
} from "@/lib/admin-overview-date-range";
import { reconcileDueLeads } from "@/lib/lead-lifecycle";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const month = parseOverviewMonth(new URL(request.url).searchParams);

  if (USE_MOCK) {
    return NextResponse.json({ data: mockStore.getDashboard(), error: null });
  }

  try {
    await withTransaction(async (tx) => {
      await reconcileDueLeads(tx);
    });

    const [kpis, staffPortfolio, callyzer] = await Promise.all([
      fetchAdminDashboardKpis(month),
      fetchAdminDashboardPortfolio(month),
      fetchAdminDashboardCallyzerSummary(month),
    ]);

    const regionalCount = staffPortfolio.filter((s) => s.role === "regional_rm").length;
    const commissionCount = staffPortfolio.filter((s) => s.role === "commission_rm").length;

    return NextResponse.json({
      data: {
        month,
        monthLabel: overviewMonthLabel(month),
        dateRange: overviewMonthToDateRange(month),
        kpis,
        staffPortfolio,
        summary: {
          regionalRmCount: regionalCount,
          commissionRmCount: commissionCount,
          commissionLeads: kpis.commissionPipeline,
          callyzer,
        },
        callyzer,
        /** @deprecated use staffPortfolio */
        rmPortfolio: staffPortfolio
          .filter((s) => s.role === "regional_rm")
          .map((s) => ({
            id: s.id,
            name: s.name,
            region: s.region ?? "",
            activeLeads: s.activeLeads,
            criticalUntouched: s.criticalUntouched,
            bypassesWeek: s.bypassesWeek,
            conversionRate: s.conversionRate,
          })),
      },
      error: null,
    });
  } catch (error) {
    return apiErrorResponse(error, "Failed to load dashboard");
  }
}
