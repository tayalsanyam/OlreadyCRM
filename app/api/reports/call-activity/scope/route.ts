import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import { CALL_REPORT_ROLES, listCallyzerReportAssignees } from "@/lib/callyzer-report-scope";

export async function GET() {
  const auth = await requireRoles(CALL_REPORT_ROLES);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const data = await withTransaction((tx) => listCallyzerReportAssignees(tx, auth.session));
  return NextResponse.json({ data, error: null });
}
