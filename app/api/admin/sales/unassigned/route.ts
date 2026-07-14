import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { exportListCsv, wantsCsv } from "@/lib/admin-csv-export";
import {
  ADMIN_MUA_PAGE_SIZE_DEFAULT,
  ADMIN_MUA_PAGE_SIZE_MAX,
} from "@/lib/admin-muas-query";
import { salesPipelineMuaTypeLabel } from "@/lib/sales-pipeline-labels";

type UnassignedRow = {
  id: string;
  muaType: string;
  muaId: string;
  muaName: string;
  muaCity: string;
  muaSource: string | null;
  daysUnassigned: number;
};

type UnassignedSortBy = "days" | "name" | "city";

function parseUnassignedSortBy(raw: string | null): UnassignedSortBy {
  if (raw === "name" || raw === "city" || raw === "days") return raw;
  return "days";
}

function unassignedOrderBySql(sortBy: UnassignedSortBy): string {
  if (sortBy === "name") return "m.name ASC, p.id";
  if (sortBy === "city") return "m.city ASC, m.name ASC, p.id";
  return "p.created_at ASC, p.id";
}

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const u = new URL(request.url);
  const city = u.searchParams.get("city");
  const source = u.searchParams.get("source");
  const muaType = u.searchParams.get("mua_type");
  const q = u.searchParams.get("q")?.trim() || null;
  const sortBy = parseUnassignedSortBy(u.searchParams.get("sort_by"));
  const page = Math.max(1, Number(u.searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(
    ADMIN_MUA_PAGE_SIZE_MAX,
    Math.max(1, Number(u.searchParams.get("pageSize") ?? ADMIN_MUA_PAGE_SIZE_DEFAULT) || ADMIN_MUA_PAGE_SIZE_DEFAULT)
  );
  const offset = (page - 1) * pageSize;
  const cityFilter = city || null;
  const sourceFilter = source || null;
  const muaTypeFilter = muaType || null;
  const qPattern = q ? `%${q}%` : null;

  if (wantsCsv(request)) {
    const rows = await sql<UnassignedRow[]>`
      SELECT
        p.id,
        p.mua_type AS "muaType",
        m.id AS "muaId",
        m.name AS "muaName",
        m.city AS "muaCity",
        m.source AS "muaSource",
        DATE_PART('day', NOW() - p.created_at)::int AS "daysUnassigned"
      FROM sales.pipeline p
      JOIN muas m ON m.id = p.mua_id
      WHERE p.assigned_to IS NULL
        AND p.status = 'active'
        AND p.stage <> 'Rejected'
        AND m.status = 'active'
        AND (${cityFilter}::text IS NULL OR m.city ILIKE ${cityFilter})
        AND (${sourceFilter}::text IS NULL OR m.source = ${sourceFilter})
        AND (${muaTypeFilter}::text IS NULL OR p.mua_type = ${muaTypeFilter})
        AND (
          ${q}::text IS NULL
          OR m.name ILIKE ${qPattern}
          OR m.city ILIKE ${qPattern}
        )
      ORDER BY ${sql.unsafe(unassignedOrderBySql(sortBy))}
    `;
    return exportListCsv("unassigned-pipeline-muas", [
      { header: "Pipeline ID", value: (r) => r.id },
      { header: "MUA", value: (r) => r.muaName },
      { header: "City", value: (r) => r.muaCity },
      { header: "Source", value: (r) => r.muaSource ?? "" },
      { header: "Type", value: (r) => salesPipelineMuaTypeLabel(r.muaType) },
      { header: "Days unassigned", value: (r) => r.daysUnassigned },
    ], rows);
  }

  const [countRow] = await sql<{ total: number }[]>`
    SELECT COUNT(*)::int AS total
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    WHERE p.assigned_to IS NULL
      AND p.status = 'active'
      AND p.stage <> 'Rejected'
      AND m.status = 'active'
      AND (${cityFilter}::text IS NULL OR m.city ILIKE ${cityFilter})
      AND (${sourceFilter}::text IS NULL OR m.source = ${sourceFilter})
      AND (${muaTypeFilter}::text IS NULL OR p.mua_type = ${muaTypeFilter})
      AND (
        ${q}::text IS NULL
        OR m.name ILIKE ${qPattern}
        OR m.city ILIKE ${qPattern}
      )
  `;
  const total = countRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const rows = await sql<UnassignedRow[]>`
    SELECT
      p.id,
      p.mua_type AS "muaType",
      m.id AS "muaId",
      m.name AS "muaName",
      m.city AS "muaCity",
      m.source AS "muaSource",
      DATE_PART('day', NOW() - p.created_at)::int AS "daysUnassigned"
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    WHERE p.assigned_to IS NULL
      AND p.status = 'active'
      AND p.stage <> 'Rejected'
      AND m.status = 'active'
      AND (${cityFilter}::text IS NULL OR m.city ILIKE ${cityFilter})
      AND (${sourceFilter}::text IS NULL OR m.source = ${sourceFilter})
      AND (${muaTypeFilter}::text IS NULL OR p.mua_type = ${muaTypeFilter})
      AND (
        ${q}::text IS NULL
        OR m.name ILIKE ${qPattern}
        OR m.city ILIKE ${qPattern}
      )
    ORDER BY ${sql.unsafe(unassignedOrderBySql(sortBy))}
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;

  return NextResponse.json({
    data: { items: rows, total, page, pageSize, totalPages },
    error: null,
  });
}
