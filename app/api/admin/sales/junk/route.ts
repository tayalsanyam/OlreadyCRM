import { NextResponse } from "next/server";
import {
  junkCustomerSegmentLabel,
  salesPipelineMuaTypeLabel,
} from "@/lib/sales-pipeline-labels";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";

type JunkRow = {
  id: string;
  pipelineId: string;
  muaId: string;
  muaName: string;
  muaCity: string | null;
  muaSource: string | null;
  muaType: string;
  customerSegment: string | null;
  assignedToName: string | null;
  rejectionReason: string | null;
  rejectionNote: string | null;
  junkReason: string | null;
  junkedByName: string | null;
  junkedAt: string;
  junkedFrom: string | null;
};

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const u = new URL(request.url);
  const format = u.searchParams.get("format");
  const segment = u.searchParams.get("segment");

  const rows = await withTransaction(async (tx): Promise<JunkRow[]> => {
    const segmentFilter =
      segment === "prospect" || segment === "ex_customer"
        ? tx`j.customer_segment = ${segment}`
        : tx`TRUE`;

    return tx<JunkRow[]>`
    SELECT
      j.id,
      j.pipeline_id AS "pipelineId",
      j.mua_id AS "muaId",
      j.mua_name AS "muaName",
      j.mua_city AS "muaCity",
      j.mua_source AS "muaSource",
      j.mua_type AS "muaType",
      j.customer_segment AS "customerSegment",
      j.assigned_to_name AS "assignedToName",
      j.rejection_reason AS "rejectionReason",
      j.rejection_note AS "rejectionNote",
      j.junk_reason AS "junkReason",
      junker.name AS "junkedByName",
      j.junked_at AS "junkedAt",
      j.snapshot->>'junkedFrom' AS "junkedFrom"
    FROM sales.pipeline_junk j
    LEFT JOIN staff junker ON junker.id = j.junked_by
    WHERE ${segmentFilter}
    ORDER BY j.junked_at DESC
  `;
  });

  if (format === "csv") {
    const header = [
      "Archive ID",
      "Pipeline ID",
      "MUA ID",
      "MUA",
      "City",
      "Source",
      "Type",
      "Customer segment",
      "Sales RM",
      "Rejection Reason",
      "Rejection Note",
      "Junk Reason",
      "Junked From",
      "Junked By",
      "Junked At",
    ];
    const lines = rows.map((r) =>
      [
        r.id,
        r.pipelineId,
        r.muaId,
        r.muaName,
        r.muaCity ?? "",
        r.muaSource ?? "",
        salesPipelineMuaTypeLabel(r.muaType),
        junkCustomerSegmentLabel(r.customerSegment),
        r.assignedToName ?? "",
        r.rejectionReason ?? "",
        r.rejectionNote ?? "",
        r.junkReason ?? "",
        r.junkedFrom ?? "",
        r.junkedByName ?? "",
        r.junkedAt ? new Date(r.junkedAt).toISOString() : "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const suffix = segment ? `-${segment}` : "";
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="sales-junk-reference${suffix}.csv"`,
      },
    });
  }

  return NextResponse.json({ data: rows, error: null });
}
