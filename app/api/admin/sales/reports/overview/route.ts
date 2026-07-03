import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import { exportListCsv, wantsCsv } from "@/lib/admin-csv-export";
import { salesPipelineMuaTypeLabel } from "@/lib/sales-pipeline-labels";
import { parseAdminSalesReportFilters } from "@/lib/admin-sales-report-filters";
import { syncSalesPlanPipelines } from "@/lib/sales-plan-sync";

type OverviewRow = {
  id: string;
  muaId: string;
  displayId: string | null;
  stage: string;
  muaType: string;
  muaName: string;
  muaPhone: string | null;
  muaWhatsapp: string | null;
  muaCity: string;
  muaSource: string | null;
  assignedToName: string | null;
  teamName: string | null;
  priceOffered: number | null;
  lastContactAt: string | null;
  lastContactChannel: "call" | "whatsapp" | null;
  lastContactSource: "callyzer" | "manual" | "whatsapp" | null;
  updatedAt: string;
};

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const f = parseAdminSalesReportFilters(new URL(request.url).searchParams);
  const q = f.q;

  const rows = (await withTransaction(async (tx) => {
    await syncSalesPlanPipelines(tx);
    return tx<OverviewRow[]>`
    SELECT p.id,
           p.mua_id AS "muaId",
           m.display_id AS "displayId",
           p.stage,
           p.mua_type AS "muaType",
           p.status,
           p.assigned_to AS "assignedTo",
           m.name AS "muaName",
           m.phone AS "muaPhone",
           m.whatsapp AS "muaWhatsapp",
           m.city AS "muaCity",
           m.source AS "muaSource",
           s.name AS "assignedToName",
           COALESCE(st.name, t.name) AS "teamName",
           COALESCE(pr.amount, o.quoted_amount, o.avg_revenue_target)::numeric AS "priceOffered",
           lc.at AS "lastContactAt",
           lc.channel AS "lastContactChannel",
           lc.source AS "lastContactSource",
           p.updated_at AS "updatedAt"
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    LEFT JOIN staff s ON s.id = p.assigned_to
    LEFT JOIN sales.teams st ON st.id = s.team_id
    LEFT JOIN sales.teams t ON t.id = m.team_id
    LEFT JOIN sales.onboarding o ON o.pipeline_id = p.id
    LEFT JOIN LATERAL (
      SELECT amount FROM sales.payment_records
      WHERE pipeline_id = p.id
      ORDER BY payment_date DESC NULLS LAST, created_at DESC
      LIMIT 1
    ) pr ON true
    LEFT JOIN LATERAL (
      SELECT at, channel, source FROM (
        SELECT
          cl.called_at AS at,
          'call'::text AS channel,
          'callyzer'::text AS source
        FROM sales.call_logs cl
        WHERE cl.pipeline_id = p.id
          AND cl.called_at IS NOT NULL

        UNION ALL

        SELECT
          c.created_at AS at,
          CASE
            WHEN c.entry_type = 'whatsappLogged' THEN 'whatsapp'
            ELSE 'call'
          END AS channel,
          CASE
            WHEN c.entry_type = 'whatsappLogged' THEN 'whatsapp'
            ELSE 'manual'
          END AS source
        FROM sales.comms_log c
        WHERE c.pipeline_id = p.id
          AND c.entry_type IN ('callLogged', 'whatsappLogged')
      ) combined
      WHERE at IS NOT NULL
      ORDER BY at DESC
      LIMIT 1
    ) lc ON TRUE
    WHERE p.status = 'active'
      AND (${f.stage}::text IS NULL OR p.stage = ${f.stage})
      AND (${f.muaType}::text IS NULL OR p.mua_type = ${f.muaType})
      AND (${f.source}::text IS NULL OR m.source = ${f.source})
      AND (${f.city}::text IS NULL OR m.city = ${f.city})
      AND (${f.assignedTo}::text IS NULL OR p.assigned_to = ${f.assignedTo}::uuid)
      AND (
        ${f.teamId}::text IS NULL
        OR m.team_id = ${f.teamId}::uuid
        OR s.team_id = ${f.teamId}::uuid
      )
      AND (${f.dateFrom}::date IS NULL OR p.updated_at::date >= ${f.dateFrom}::date)
      AND (${f.dateTo}::date IS NULL OR p.updated_at::date <= ${f.dateTo}::date)
      AND (${f.unassignedOnly}::boolean IS FALSE OR p.assigned_to IS NULL)
      AND (
        ${f.assignedOnly}::boolean IS FALSE
        OR (
          p.assigned_to IS NOT NULL
          AND s.role IN ('sales_rm', 'sales_tl')
        )
      )
      AND (
        ${q}::text IS NULL
        OR m.name ILIKE ${q ? `%${q}%` : null}
        OR m.city ILIKE ${q ? `%${q}%` : null}
        OR s.name ILIKE ${q ? `%${q}%` : null}
      )
    ORDER BY p.updated_at DESC
  `;
  })) as OverviewRow[];

  if (wantsCsv(request)) {
    return exportListCsv("sales-pipeline-overview", [
      { header: "MUA", value: (r) => r.muaName },
      { header: "Type", value: (r) => salesPipelineMuaTypeLabel(r.muaType) },
      { header: "Stage", value: (r) => r.stage },
      { header: "City", value: (r) => r.muaCity },
      { header: "Source", value: (r) => r.muaSource ?? "" },
      { header: "Sales RM", value: (r) => r.assignedToName ?? "" },
      { header: "Team", value: (r) => r.teamName ?? "" },
      {
        header: "Last contact",
        value: (r) => {
          if (!r.lastContactAt) return "";
          const when = r.lastContactAt.slice(0, 10);
          if (r.lastContactChannel === "whatsapp") return `${when} · WhatsApp`;
          if (r.lastContactSource === "callyzer") return `${when} · Callyzer call`;
          return `${when} · Call`;
        },
      },
      { header: "Price offered", value: (r) => r.priceOffered ?? "" },
      { header: "Updated", value: (r) => r.updatedAt ?? "" },
    ], rows);
  }

  return NextResponse.json({ data: rows, error: null });
}
