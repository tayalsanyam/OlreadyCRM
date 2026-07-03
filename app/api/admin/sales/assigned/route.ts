import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { exportListCsv, wantsCsv } from "@/lib/admin-csv-export";
import { parseAdminSalesReportFilters } from "@/lib/admin-sales-report-filters";
import {
  ADMIN_MUA_PAGE_SIZE_DEFAULT,
  ADMIN_MUA_PAGE_SIZE_MAX,
} from "@/lib/admin-muas-query";
import { salesPipelineMuaTypeLabel } from "@/lib/sales-pipeline-labels";

type AssignedRow = {
  id: string;
  muaType: string;
  muaId: string;
  muaName: string;
  muaCity: string;
  muaSource: string | null;
  stage: string;
  assignedToId: string;
  assignedToName: string;
  daysSinceUpdate: number;
};

type AssignedSortBy = "name" | "city" | "stage" | "salesperson" | "updated";

function parseAssignedSortBy(raw: string | null): AssignedSortBy {
  if (raw === "name" || raw === "city" || raw === "stage" || raw === "salesperson" || raw === "updated") {
    return raw;
  }
  return "updated";
}

function assignedOrderBySql(sortBy: AssignedSortBy): string {
  if (sortBy === "name") return "m.name ASC, p.id";
  if (sortBy === "city") return "m.city ASC, m.name ASC, p.id";
  if (sortBy === "stage") return "p.stage ASC, m.name ASC, p.id";
  if (sortBy === "salesperson") return "s.name ASC, m.name ASC, p.id";
  return "p.updated_at ASC, p.id";
}

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const u = new URL(request.url);
  const f = parseAdminSalesReportFilters(u.searchParams);
  const sortBy = parseAssignedSortBy(u.searchParams.get("sort_by"));
  const page = Math.max(1, Number(u.searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(
    ADMIN_MUA_PAGE_SIZE_MAX,
    Math.max(1, Number(u.searchParams.get("pageSize") ?? ADMIN_MUA_PAGE_SIZE_DEFAULT) || ADMIN_MUA_PAGE_SIZE_DEFAULT)
  );
  const offset = (page - 1) * pageSize;
  const qPattern = f.q ? `%${f.q}%` : null;

  if (wantsCsv(request)) {
    const rows = await sql<AssignedRow[]>`
      SELECT
        p.id,
        p.mua_type AS "muaType",
        m.id AS "muaId",
        m.name AS "muaName",
        m.city AS "muaCity",
        m.source AS "muaSource",
        p.stage,
        p.assigned_to AS "assignedToId",
        s.name AS "assignedToName",
        DATE_PART('day', NOW() - p.updated_at)::int AS "daysSinceUpdate"
      FROM sales.pipeline p
      JOIN muas m ON m.id = p.mua_id
      JOIN staff s ON s.id = p.assigned_to
      WHERE p.assigned_to IS NOT NULL
        AND p.status = 'active'
        AND p.stage <> 'Rejected'
        AND (${f.stage}::text IS NULL OR p.stage = ${f.stage})
        AND (${f.city}::text IS NULL OR m.city ILIKE ${f.city})
        AND (${f.source}::text IS NULL OR m.source = ${f.source})
        AND (${f.muaType}::text IS NULL OR p.mua_type = ${f.muaType})
        AND (${f.assignedTo}::text IS NULL OR p.assigned_to = ${f.assignedTo}::uuid)
        AND (${f.teamId}::text IS NULL OR m.team_id = ${f.teamId}::uuid)
        AND (
          ${f.q}::text IS NULL
          OR m.name ILIKE ${qPattern}
          OR m.city ILIKE ${qPattern}
          OR s.name ILIKE ${qPattern}
        )
      ORDER BY ${sql.unsafe(assignedOrderBySql(sortBy))}
    `;
    return exportListCsv("assigned-pipeline-muas", [
      { header: "Pipeline ID", value: (r) => r.id },
      { header: "MUA", value: (r) => r.muaName },
      { header: "City", value: (r) => r.muaCity },
      { header: "Source", value: (r) => r.muaSource ?? "" },
      { header: "Type", value: (r) => salesPipelineMuaTypeLabel(r.muaType) },
      { header: "Stage", value: (r) => r.stage },
      { header: "Sales RM", value: (r) => r.assignedToName },
      { header: "Days since update", value: (r) => r.daysSinceUpdate },
    ], rows);
  }

  const [countRow] = await sql<{ total: number }[]>`
    SELECT COUNT(*)::int AS total
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    JOIN staff s ON s.id = p.assigned_to
    WHERE p.assigned_to IS NOT NULL
      AND p.status = 'active'
      AND p.stage <> 'Rejected'
      AND (${f.stage}::text IS NULL OR p.stage = ${f.stage})
      AND (${f.city}::text IS NULL OR m.city ILIKE ${f.city})
      AND (${f.source}::text IS NULL OR m.source = ${f.source})
      AND (${f.muaType}::text IS NULL OR p.mua_type = ${f.muaType})
      AND (${f.assignedTo}::text IS NULL OR p.assigned_to = ${f.assignedTo}::uuid)
      AND (${f.teamId}::text IS NULL OR m.team_id = ${f.teamId}::uuid)
      AND (
        ${f.q}::text IS NULL
        OR m.name ILIKE ${qPattern}
        OR m.city ILIKE ${qPattern}
        OR s.name ILIKE ${qPattern}
      )
  `;
  const total = countRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const rows = await sql<AssignedRow[]>`
    SELECT
      p.id,
      p.mua_type AS "muaType",
      m.id AS "muaId",
      m.name AS "muaName",
      m.city AS "muaCity",
      m.source AS "muaSource",
      p.stage,
      p.assigned_to AS "assignedToId",
      s.name AS "assignedToName",
      DATE_PART('day', NOW() - p.updated_at)::int AS "daysSinceUpdate"
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    JOIN staff s ON s.id = p.assigned_to
    WHERE p.assigned_to IS NOT NULL
      AND p.status = 'active'
      AND p.stage <> 'Rejected'
      AND (${f.stage}::text IS NULL OR p.stage = ${f.stage})
      AND (${f.city}::text IS NULL OR m.city ILIKE ${f.city})
      AND (${f.source}::text IS NULL OR m.source = ${f.source})
      AND (${f.muaType}::text IS NULL OR p.mua_type = ${f.muaType})
      AND (${f.assignedTo}::text IS NULL OR p.assigned_to = ${f.assignedTo}::uuid)
      AND (${f.teamId}::text IS NULL OR m.team_id = ${f.teamId}::uuid)
      AND (
        ${f.q}::text IS NULL
        OR m.name ILIKE ${qPattern}
        OR m.city ILIKE ${qPattern}
        OR s.name ILIKE ${qPattern}
      )
    ORDER BY ${sql.unsafe(assignedOrderBySql(sortBy))}
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;

  return NextResponse.json({
    data: { items: rows, total, page, pageSize, totalPages },
    error: null,
  });
}
