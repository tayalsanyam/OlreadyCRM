import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { scopeFromSession } from "@/lib/report-scope";
import { fetchNiLeads, niLeadsToCsv } from "@/lib/ni-leads-query";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRoles(["regionalRm", "commissionRm", "feedbackRm"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const scope = scopeFromSession(auth.session);
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");

  const scopeRmId = scope.kind === "rm" ? scope.staffId : null;
  const scopeCommission = scope.kind === "commission";

  const data = await fetchNiLeads({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    region: searchParams.get("region"),
    rmId: null,
    scopeRmId,
    scopeCommission,
  });

  if (format === "csv") {
    return new NextResponse(niLeadsToCsv(data), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="ni-leads.csv"',
      },
    });
  }

  return NextResponse.json({ data, error: null });
}
