import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { exportListCsv, wantsCsv } from "@/lib/admin-csv-export";
import { salesPipelineMuaTypeLabel } from "@/lib/sales-pipeline-labels";
import { listRejectedPipelines } from "@/lib/sales-pipeline-rejected";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const rows = await withTransaction((tx) => listRejectedPipelines(tx, {}));

  if (wantsCsv(request)) {
    return exportListCsv("rejected-pipeline-muas", [
      { header: "Pipeline ID", value: (r) => r.id },
      { header: "MUA", value: (r) => r.muaName },
      { header: "City", value: (r) => r.muaCity },
      { header: "Source", value: (r) => r.muaSource ?? "" },
      { header: "Type", value: (r) => salesPipelineMuaTypeLabel(r.muaType) },
      { header: "Sales RM", value: (r) => r.assignedToName ?? "" },
      { header: "Rejections", value: (r) => r.rejectionCount },
      { header: "Rejection reason", value: (r) => r.rejectionReason ?? "" },
      { header: "Rejection note", value: (r) => r.rejectionNote ?? "" },
      { header: "Rejected at", value: (r) => r.rejectedAt ?? "" },
      { header: "Rejected by", value: (r) => r.rejectedByName ?? "" },
      { header: "Days in rejected", value: (r) => r.daysInRejected },
    ], rows);
  }

  return NextResponse.json({ data: rows, error: null });
}
