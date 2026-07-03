import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { apiErrorResponse } from "@/lib/api-error-response";
import {
  COMMISSION_OVERDUE_CSV_HEADERS,
  commissionOverdueToCsv,
  fetchCommissionOverdueBookings,
} from "@/lib/commission-overdue-query";
import { csvResponse } from "@/lib/report-utils";

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  if (auth.session.role !== "admin" && auth.session.role !== "owner") {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const overdueOnly = searchParams.get("overdueOnly") === "true";
  const commissionRmId = searchParams.get("commissionRmId");
  const bookingFrom = searchParams.get("bookingFrom");
  const bookingTo = searchParams.get("bookingTo");

  try {
    const rows = await fetchCommissionOverdueBookings({
      role: "admin",
      userId: auth.session.userId,
      overdueOnly,
      commissionRmId,
      bookingFrom,
      bookingTo,
    });

    if (format === "csv") {
      const slug = overdueOnly ? "commission-overdue" : "commission-bookings";
      return csvResponse(
        slug,
        [...COMMISSION_OVERDUE_CSV_HEADERS],
        rows.map(commissionOverdueToCsv)
      );
    }

    const overdueCount = rows.filter((r) => r.commissionOverdue).length;

    return NextResponse.json({
      data: { rows, overdueCount, total: rows.length },
      error: null,
    });
  } catch (e) {
    return apiErrorResponse(e, "Failed to load commission overdue");
  }
}
