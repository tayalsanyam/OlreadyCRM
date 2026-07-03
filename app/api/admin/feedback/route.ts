import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { exportListCsv, wantsCsv } from "@/lib/admin-csv-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() || null;
  const muaType = url.searchParams.get("muaType")?.trim() || null;
  const connectionStatus = url.searchParams.get("connectionStatus")?.trim() || null;
  const serviceSentiment = url.searchParams.get("serviceSentiment")?.trim() || null;
  const fromDate = url.searchParams.get("fromDate")?.trim() || null;
  const toDate = url.searchParams.get("toDate")?.trim() || null;

  const qLike = q ? `%${q}%` : null;

  const rows = await sql`
    SELECT
      lf.*,
      bl.bride_name AS "brideName",
      bl.display_id AS "displayId"
    FROM lead_feedback lf
    JOIN bride_leads bl ON bl.id = lf.lead_id
    WHERE (${qLike}::text IS NULL
      OR bl.bride_name ILIKE ${qLike}
      OR bl.display_id ILIKE ${qLike}
      OR COALESCE(lf.non_olready_mua_name, '') ILIKE ${qLike})
      AND (${muaType}::text IS NULL OR lf.mua_type = ${muaType})
      AND (${connectionStatus}::text IS NULL OR lf.connection_status = ${connectionStatus})
      AND (${serviceSentiment}::text IS NULL OR lf.service_sentiment = ${serviceSentiment})
      AND (${fromDate}::date IS NULL OR lf.created_at::date >= ${fromDate}::date)
      AND (${toDate}::date IS NULL OR lf.created_at::date <= ${toDate}::date)
    ORDER BY lf.created_at DESC
  `;

  if (wantsCsv(request)) {
    return exportListCsv("lead-feedback", [
      { header: "Lead ID", value: (r) => r.displayId },
      { header: "Bride", value: (r) => r.brideName },
      { header: "MUA type", value: (r) => r.mua_type ?? r.muaType ?? "" },
      { header: "Olready MUA ID", value: (r) => r.olready_mua_id ?? r.olreadyMuaId ?? "" },
      { header: "Other MUA name", value: (r) => r.non_olready_mua_name ?? r.nonOlreadyMuaName ?? "" },
      { header: "Valuable options", value: (r) => r.valuable_options ?? r.valuableOptions ?? "" },
      { header: "Connection status", value: (r) => r.connection_status ?? r.connectionStatus ?? "" },
      { header: "Service sentiment", value: (r) => r.service_sentiment ?? r.serviceSentiment ?? "" },
      { header: "Olready rating", value: (r) => r.olready_rating ?? r.olreadyRating ?? "" },
      { header: "MUA rating", value: (r) => r.mua_rating ?? r.muaRating ?? "" },
      { header: "Olready service note", value: (r) => r.olready_service_note ?? r.olreadyServiceNote ?? "" },
      { header: "MUA service note", value: (r) => r.mua_service_note ?? r.muaServiceNote ?? "" },
      { header: "References note", value: (r) => r.references_note ?? r.referencesNote ?? "" },
      { header: "Improvements note", value: (r) => r.improvements_note ?? r.improvementsNote ?? "" },
      { header: "Recommendations", value: (r) => r.recommendations_note ?? r.recommendationsNote ?? "" },
      { header: "Referrals note", value: (r) => r.referrals_note ?? r.referralsNote ?? "" },
      { header: "Created", value: (r) => r.created_at ?? r.createdAt ?? "" },
    ], rows as Record<string, unknown>[]);
  }

  return NextResponse.json({ data: rows, error: null });
}
