import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { fetchPlanDeliverables } from "@/lib/plan-deliverables-query";
import { toDbPlanTier } from "@/lib/db-mappers";
import { csvResponse } from "@/lib/report-utils";
import { csvDateCell, csvDateTimeCell } from "@/lib/utils";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const planRmId = searchParams.get("planRmId");
  const regionalRmId = searchParams.get("regionalRmId");
  const search = searchParams.get("search");
  const tierRaw = searchParams.get("tier");
  const tier = tierRaw ? toDbPlanTier(tierRaw) : null;
  const nearExpiry = searchParams.get("nearExpiry") === "true";
  const state = searchParams.get("state");
  const regionRaw = searchParams.get("region");
  const region =
    regionRaw === "north" ||
    regionRaw === "east" ||
    regionRaw === "west" ||
    regionRaw === "south"
      ? regionRaw
      : null;

  const rows = await fetchPlanDeliverables({
    planRmId,
    regionalRmId,
    search,
    planTier: tier,
    nearExpiry,
    state,
    region,
  });

  if (format === "csv") {
    return csvResponse(
      "plan-deliverables",
      [
        "MUA",
        "Display ID",
        "City",
        "Plan",
        "Admin tag",
        "Plan Expiry",
        "Plan Activated",
        "Current RM",
        "Sales RM",
        "Plan RM",
        "Last contact",
        "Last push",
        "Monthly Push Target",
        "Pushes This Month",
        "Pushes Since Plan",
        "Total Pushes",
        "Assured Bookings",
        "Total Bookings",
        "Booking Revenue",
        "Weekly Cap",
        "Weekly Used",
      ],
      rows.map((r) => [
        r.name,
        r.displayId,
        r.city,
        r.planTierLabel,
        r.adminPlanTagLabel ?? "",
        csvDateCell(r.planExpiry),
        csvDateCell(r.planActivatedAt),
        r.regionalRmName ?? "",
        r.salesRmName ?? "",
        r.planRmName ?? "",
        csvDateTimeCell(r.lastContactAt),
        csvDateTimeCell(r.lastPushedAt),
        r.monthlyPushTarget ?? "",
        r.pushesThisMonth,
        r.pushesSincePlan,
        r.totalPushes,
        r.assuredBookings ?? "",
        r.totalBookings,
        r.totalBookingRevenue,
        r.weeklyCap ?? "",
        r.weeklyUsed,
      ])
    );
  }

  const summary = {
    total: rows.length,
    pushTargetMet: rows.filter((r) => r.pushTargetMet).length,
    bookingTargetMet: rows.filter((r) => r.bookingTargetMet).length,
    planExpired: rows.filter((r) => r.planExpired).length,
    expiringWithin30Days: rows.filter((r) => r.expiringWithin30Days).length,
  };

  return NextResponse.json({ data: { rows, summary }, error: null });
}
