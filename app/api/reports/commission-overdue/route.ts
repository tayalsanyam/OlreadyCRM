import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
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

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const overdueOnly = searchParams.get("overdueOnly") === "true";

  const rows = await fetchCommissionOverdueBookings({
    role: auth.session.role,
    userId: auth.session.userId,
    overdueOnly,
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
}
