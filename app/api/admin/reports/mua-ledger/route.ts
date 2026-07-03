import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { toDbPlanTier } from "@/lib/db-mappers";
import {
  fetchMuaLedgerEntries,
  fetchMuaLedgerSummary,
} from "@/lib/mua-ledger-query";
import { csvResponse } from "@/lib/report-utils";
import { csvDateCell, csvDateTimeCell } from "@/lib/utils";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner", "careAgent"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const muaId = searchParams.get("muaId");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const allTime = searchParams.get("allTime") === "true";
  const tierRaw = searchParams.get("tier");
  const city = searchParams.get("city");
  const search = searchParams.get("search");
  const regionalRmId = searchParams.get("regionalRmId");
  const planRmId =
    searchParams.get("planRmId") ?? searchParams.get("commissionRmId");

  if (USE_MOCK) {
    const data = mockStore.getMuaLedger({ muaId, dateFrom, dateTo, tier: tierRaw, city });
    if (format === "csv" && muaId) {
      return csvResponse(
        `mua-ledger-${muaId}`,
        [
          "Date",
          "Time",
          "Source",
          "Action",
          "Lead ID",
          "Bride Name",
          "Lead Tier",
          "Region",
          "Stage",
          "Details",
          "RM",
          "Amount",
        ],
        data.entries.map((e) => {
          const d = new Date(e.createdAt);
          const source = e.description.startsWith("[Sales] ") ? "Sales" : "RM";
          return [
            d.toISOString().slice(0, 10),
            d.toISOString().slice(11, 16),
            source,
            e.entryType,
            e.leadDisplayId,
            e.brideName,
            e.budgetTier,
            e.region,
            e.pushStage ?? "",
            e.description,
            e.actorName ?? "",
            e.bookedPrice ?? "",
          ];
        })
      );
    }
    if (format === "csv") {
      return csvResponse(
        "mua-ledger",
        [
          "MUA Name",
          "Display ID",
          "City",
          "Plan",
          "Plan Expiry",
          "Assured Bookings",
          "Monthly Target",
          "Pushes This Month",
          "Total Pushes",
          "Unique Leads",
          "Bookings",
          "Total Revenue",
          "Last Activity",
        ],
        data.summary.map((m) => [
          m.name,
          m.displayId,
          m.city,
          m.planTier ?? "",
          m.planExpiry ?? "",
          m.assuredBookings ?? "",
          m.monthlyPushTarget ?? "",
          m.pushesThisMonth,
          m.totalPushes,
          m.uniqueLeads,
          m.totalBookings,
          m.totalRevenue,
          m.lastActivity ?? "",
        ])
      );
    }
    return NextResponse.json({ data, error: null });
  }

  if (muaId) {
    const entries = await fetchMuaLedgerEntries({
      muaId,
      dateFrom: allTime ? null : dateFrom,
      dateTo: allTime ? null : dateTo,
      allTime,
    });

    if (format === "csv") {
      return csvResponse(
        `mua-ledger-${muaId}`,
        [
          "Date",
          "Time",
          "Source",
          "Action",
          "Lead ID",
          "Bride Name",
          "Lead Tier",
          "Region",
          "Stage",
          "Details",
          "RM",
          "Amount",
        ],
        entries.map((e) => {
          const d = new Date(e.createdAt);
          const source =
            e.source === "sales"
              ? "Sales"
              : e.source === "call"
                ? "Call"
                : e.source === "care"
                  ? "Care"
                  : e.source === "plan"
                    ? "Plan"
                    : "RM";
          return [
            d.toISOString().slice(0, 10),
            d.toISOString().slice(11, 16),
            source,
            e.entryType,
            e.leadDisplayId ?? "",
            e.brideName ?? "",
            e.budgetTier ?? "",
            e.region ?? "",
            e.pushStage ?? "",
            e.description,
            e.actorName ?? "",
            e.bookedPrice ?? "",
          ];
        })
      );
    }

    return NextResponse.json({ data: { entries }, error: null });
  }

  const summary = await fetchMuaLedgerSummary({
    dateFrom,
    dateTo,
    tierRaw,
    city,
    search,
    regionalRmId,
    planRmId,
  });

  if (format === "csv") {
    return csvResponse(
      "mua-ledger",
      [
        "MUA Name",
        "Display ID",
        "City",
        "Current RM",
        "Plan RM",
        "Plan",
        "Plan Expiry",
        "Assured Bookings",
        "Monthly Target",
        "Pushes This Month",
        "Total Pushes",
        "Unique Leads",
        "Bookings",
        "Total Revenue",
        "Last Activity",
      ],
      summary.map((m) => [
        m.name,
        m.displayId,
        m.city,
        m.regionalRmName ?? "",
        m.planRmName ?? "",
        m.planTier ?? "",
        csvDateCell(m.planExpiry),
        m.assuredBookings ?? "",
        m.monthlyPushTarget ?? "",
        m.pushesThisMonth,
        m.totalPushes,
        m.uniqueLeads,
        m.totalBookings,
        m.totalRevenue ?? 0,
        csvDateTimeCell(m.lastActivity),
      ])
    );
  }

  const strip = {
    totalPlanMuas: summary.filter((m) => m.planTier).length,
    activeThisMonth: summary.filter((m) => m.pushesThisMonth > 0).length,
    revenueThisMonth: summary.reduce((a, m) => a + (m.revenueThisMonth ?? 0), 0),
    avgPushes:
      summary.length > 0
        ? Math.round(
            (summary.reduce((a, m) => a + m.pushesThisMonth, 0) / summary.length) * 10
          ) / 10
        : 0,
  };

  return NextResponse.json({ data: { summary, strip }, error: null });
}
