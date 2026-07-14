import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import {
  fetchAdminBookingsByMuaDetail,
  resolveByMuaDateBounds,
} from "@/lib/admin-bookings-by-mua";
import type { SelfBookingFilter } from "@/lib/bookings-list";
import type { PlanTier, Region } from "@/lib/types";

export const dynamic = "force-dynamic";

export type { AdminBookingByMuaRow } from "@/lib/admin-bookings-by-mua";

function parseOptionalUuid(raw: string | null): string | null {
  if (
    !raw ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)
  ) {
    return null;
  }
  return raw;
}

function parseFilters(url: URL) {
  const region = url.searchParams.get("region");
  const planTier = url.searchParams.get("planTier");
  const selfRaw = url.searchParams.get("selfBooking");
  const selfBooking: SelfBookingFilter =
    selfRaw === "yes" || selfRaw === "no" ? selfRaw : "all";
  const { fromDate, toDate } = resolveByMuaDateBounds({
    fromDate: url.searchParams.get("fromDate"),
    toDate: url.searchParams.get("toDate"),
    month: url.searchParams.get("month"),
  });

  return {
    region:
      region && ["north", "east", "west", "south"].includes(region)
        ? (region as Region)
        : null,
    regionalRmId:
      parseOptionalUuid(url.searchParams.get("regionalRmId")) ??
      parseOptionalUuid(url.searchParams.get("rmId")),
    commissionRmId: parseOptionalUuid(url.searchParams.get("commissionRmId")),
    selfBooking,
    planTier:
      planTier && planTier.length > 0 ? (planTier as PlanTier) : null,
    q: url.searchParams.get("q"),
    fromDate,
    toDate,
  };
}

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  const filters = parseFilters(url);

  const data = await fetchAdminBookingsByMuaDetail(filters);

  if (format === "csv") {
    const header =
      "muaName,brideName,displayId,ceremonyType,eventDate,bookingDate,source,bookedPrice,tracksCommission,commissionDue,commissionReceived";
    const lines = data.map((r) =>
      [
        `"${r.muaName.replace(/"/g, '""')}"`,
        `"${r.brideName.replace(/"/g, '""')}"`,
        r.displayId,
        r.ceremonyType ?? "",
        r.eventDate ?? "",
        r.bookingDate,
        r.source,
        r.bookedPrice ?? "",
        r.tracksCommission ? "yes" : "no",
        r.tracksCommission ? (r.commissionAmount ?? "") : "",
        r.tracksCommission ? (r.commissionPaid ?? 0) : "",
      ].join(",")
    );
    return new NextResponse([header, ...lines].join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="bookings-by-mua.csv"',
      },
    });
  }

  return NextResponse.json({ data, error: null });
}
