import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import {
  fetchGrievanceReport,
  grievanceReportToCsv,
} from "@/lib/grievance-reports-query";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner", "careAgent"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  const data = await fetchGrievanceReport({ dateFrom, dateTo });

  if (format === "csv") {
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(`\uFEFF${grievanceReportToCsv(data)}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="grievance-report-${date}.csv"`,
      },
    });
  }

  return NextResponse.json({ data, error: null });
}
