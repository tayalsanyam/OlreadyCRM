import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import {
  fetchStaffActivityReport,
  parseStaffActivityRole,
  staffActivityToCsv,
} from "@/lib/admin-reports-hub-activity-query";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");

  const data = await fetchStaffActivityReport({
    dateFrom: searchParams.get("dateFrom"),
    dateTo: searchParams.get("dateTo"),
    role: parseStaffActivityRole(searchParams.get("role")),
    staffId: searchParams.get("staffId"),
    search: searchParams.get("q"),
    entryGroups: searchParams.get("entryGroups"),
  });

  if (format === "csv") {
    return new NextResponse(`\uFEFF${staffActivityToCsv(data.rows)}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="staff-activity.csv"',
      },
    });
  }

  return NextResponse.json({ data, error: null });
}
