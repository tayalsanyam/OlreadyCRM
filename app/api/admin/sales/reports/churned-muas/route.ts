import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import { listChurnedMuas } from "@/lib/sales-churned-query";
import { parseAdminSalesReportFilters } from "@/lib/admin-sales-report-filters";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const f = parseAdminSalesReportFilters(new URL(request.url).searchParams);

  const rows = await withTransaction((tx) =>
    listChurnedMuas(tx, {
      city: f.city,
      source: f.source,
      q: f.q,
    })
  );

  return NextResponse.json({ data: rows, error: null });
}
