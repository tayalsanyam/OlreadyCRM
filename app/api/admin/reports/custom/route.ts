import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { sql } from "@/db/index";

const FIELDS = [
  { key: "leadDisplayId", label: "Lead ID" },
  { key: "brideName", label: "Bride Name" },
  { key: "phone", label: "Phone" },
  { key: "city", label: "City" },
  { key: "region", label: "Region" },
  { key: "status", label: "Status" },
  { key: "budgetTier", label: "Budget Tier" },
  { key: "eventDate", label: "Event Date" },
  { key: "source", label: "Source" },
  { key: "assignedRmName", label: "Assigned RM" },
  { key: "createdAt", label: "Created At" },
  { key: "updatedAt", label: "Updated At" },
  { key: "commsCount", label: "Comms Count" },
  { key: "pushesCount", label: "Pushes Count" },
  { key: "bookingsCount", label: "Bookings Count" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

const FILTERS = [
  { key: "search", label: "Search", type: "text" as const },
  { key: "status", label: "Status", type: "select" as const },
  { key: "region", label: "Region", type: "select" as const },
  { key: "assignedRmId", label: "Assigned RM", type: "select" as const },
  { key: "dateFrom", label: "Created From", type: "date" as const },
  { key: "dateTo", label: "Created To", type: "date" as const },
];

async function getTemplates() {
  return sql<{ id: string; name: string; config: Record<string, unknown>; updatedAt: string }[]>`
    SELECT id, name, config, updated_at AS "updatedAt"
    FROM custom_report_templates
    WHERE report_type = 'backend'
    ORDER BY updated_at DESC
  `;
}

export async function GET() {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }
  const [statusRows, regionRows, rmRows, templates] = await Promise.all([
    sql<{ value: string }[]>`SELECT DISTINCT status::text AS value FROM bride_leads ORDER BY value`,
    sql<{ value: string }[]>`SELECT DISTINCT region::text AS value FROM bride_leads ORDER BY value`,
    sql<{ id: string; name: string; role: string }[]>`
      SELECT id, name, role::text AS role
      FROM staff
      WHERE active = true
        AND role IN ('regional_rm'::user_role, 'commission_rm'::user_role)
      ORDER BY role, name
    `,
    getTemplates(),
  ]);

  return NextResponse.json({
    data: {
      fields: FIELDS,
      filters: FILTERS,
      filterOptions: {
        status: statusRows.map((r) => ({ value: r.value, label: r.value })),
        region: regionRows.map((r) => ({ value: r.value, label: r.value })),
        assignedRmId: rmRows.map((r) => ({
          value: r.id,
          label: `${r.name} (${r.role === "commission_rm" ? "Commission" : "Regional"})`,
        })),
      },
      templates,
    },
    error: null,
  });
}

export async function POST(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: "run" | "saveTemplate" | "deleteTemplate";
    fields?: FieldKey[];
    templateId?: string;
    templateName?: string;
    filters?: {
      region?: string;
      status?: string;
      assignedRmId?: string;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
    };
    page?: number;
    pageSize?: number;
  };

  const action = body.action ?? "run";

  if (action === "saveTemplate") {
    if (!body.templateName?.trim() || !Array.isArray(body.fields) || body.fields.length === 0) {
      return NextResponse.json({ data: null, error: "templateName and fields are required" }, { status: 400 });
    }
    const cfg = { fields: body.fields, filters: body.filters ?? {} };
    await sql`
      INSERT INTO custom_report_templates (report_type, name, config, created_by, updated_by, updated_at)
      VALUES ('backend', ${body.templateName.trim()}, ${sql.json(cfg)}, ${auth.session.userId}::uuid, ${auth.session.userId}::uuid, NOW())
      ON CONFLICT (report_type, name)
      DO UPDATE SET config = EXCLUDED.config, updated_by = EXCLUDED.updated_by, updated_at = NOW()
    `;
    return NextResponse.json({ data: { templates: await getTemplates() }, error: null });
  }
  if (action === "deleteTemplate") {
    if (!body.templateId) {
      return NextResponse.json({ data: null, error: "templateId required" }, { status: 400 });
    }
    await sql`DELETE FROM custom_report_templates WHERE id = ${body.templateId}::uuid AND report_type = 'backend'`;
    return NextResponse.json({ data: { templates: await getTemplates() }, error: null });
  }

  const picked = (body.fields ?? []).filter((f): f is FieldKey => FIELDS.some((x) => x.key === f));
  if (picked.length === 0) {
    return NextResponse.json({ data: null, error: "Select at least one field" }, { status: 400 });
  }
  const page = Math.max(1, Number(body.page ?? 1));
  const pageSize = Math.min(200, Math.max(10, Number(body.pageSize ?? 50)));
  const offset = (page - 1) * pageSize;
  const f = body.filters ?? {};

  const rows = await sql<any[]>`
    SELECT
      bl.display_id AS "leadDisplayId",
      bl.bride_name AS "brideName",
      bl.phone,
      bl.city,
      bl.region::text AS region,
      bl.status::text AS status,
      bl.budget_tier::text AS "budgetTier",
      bl.event_date AS "eventDate",
      bl.source,
      s.name AS "assignedRmName",
      bl.created_at AS "createdAt",
      bl.updated_at AS "updatedAt",
      COALESCE(cm.cnt, 0)::int AS "commsCount",
      COALESCE(ps.cnt, 0)::int AS "pushesCount",
      COALESCE(bk.cnt, 0)::int AS "bookingsCount"
    FROM bride_leads bl
    LEFT JOIN staff s ON s.id = bl.assigned_rm_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS cnt FROM comms c WHERE c.lead_id = bl.id
    ) cm ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS cnt FROM mua_pushes mp WHERE mp.lead_id = bl.id
    ) ps ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS cnt FROM bookings b
      WHERE b.lead_id = bl.id AND NOT COALESCE(b.cancelled, false)
    ) bk ON TRUE
    WHERE (${f.region ?? null}::text IS NULL OR bl.region::text = ${f.region ?? null})
      AND (${f.status ?? null}::text IS NULL OR bl.status::text = ${f.status ?? null})
      AND (${f.assignedRmId ?? null}::text IS NULL OR bl.assigned_rm_id = ${f.assignedRmId ?? null}::uuid)
      AND (${f.dateFrom ?? null}::text IS NULL OR bl.created_at::date >= ${f.dateFrom ?? null}::date)
      AND (${f.dateTo ?? null}::text IS NULL OR bl.created_at::date <= ${f.dateTo ?? null}::date)
      AND (
        ${f.search?.trim() ? `%${f.search.trim()}%` : null}::text IS NULL
        OR bl.bride_name ILIKE ${f.search?.trim() ? `%${f.search.trim()}%` : null}
        OR bl.display_id ILIKE ${f.search?.trim() ? `%${f.search.trim()}%` : null}
        OR bl.phone ILIKE ${f.search?.trim() ? `%${f.search.trim()}%` : null}
      )
    ORDER BY bl.created_at DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;
  const [countRow] = await sql<{ total: number }[]>`
    SELECT COUNT(*)::int AS total
    FROM bride_leads bl
    WHERE (${f.region ?? null}::text IS NULL OR bl.region::text = ${f.region ?? null})
      AND (${f.status ?? null}::text IS NULL OR bl.status::text = ${f.status ?? null})
      AND (${f.assignedRmId ?? null}::text IS NULL OR bl.assigned_rm_id = ${f.assignedRmId ?? null}::uuid)
      AND (${f.dateFrom ?? null}::text IS NULL OR bl.created_at::date >= ${f.dateFrom ?? null}::date)
      AND (${f.dateTo ?? null}::text IS NULL OR bl.created_at::date <= ${f.dateTo ?? null}::date)
      AND (
        ${f.search?.trim() ? `%${f.search.trim()}%` : null}::text IS NULL
        OR bl.bride_name ILIKE ${f.search?.trim() ? `%${f.search.trim()}%` : null}
        OR bl.display_id ILIKE ${f.search?.trim() ? `%${f.search.trim()}%` : null}
        OR bl.phone ILIKE ${f.search?.trim() ? `%${f.search.trim()}%` : null}
      )
  `;

  const headers = picked.map((k) => FIELDS.find((f2) => f2.key === k)?.label ?? k);
  const data = rows.map((r) => {
    const obj: Record<string, unknown> = {};
    for (const k of picked) obj[k] = r[k];
    return obj;
  });
  return NextResponse.json({
    data: {
      headers,
      rows: data,
      page,
      pageSize,
      total: countRow?.total ?? 0,
      totalPages: Math.max(1, Math.ceil((countRow?.total ?? 0) / pageSize)),
    },
    error: null,
  });
}
