import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { sql } from "@/db/index";
import { PIPELINE_STAGE_ORDER } from "@/lib/types";
import { salesPipelineMuaTypeLabel } from "@/lib/sales-pipeline-labels";

const FIELDS = [
  { key: "pipelineId", label: "Pipeline ID" },
  { key: "muaName", label: "MUA Name" },
  { key: "muaPhone", label: "MUA Phone" },
  { key: "muaType", label: "MUA Type" },
  { key: "stage", label: "Stage" },
  { key: "status", label: "Pipeline Status" },
  { key: "source", label: "Source" },
  { key: "city", label: "City" },
  { key: "assignedToName", label: "Assigned Sales RM" },
  { key: "createdAt", label: "Created At" },
  { key: "updatedAt", label: "Updated At" },
  { key: "priceOffered", label: "Price Offered" },
  { key: "callsCount", label: "Calls Count" },
  { key: "talkTimeSec", label: "Talk Time (sec)" },
  { key: "lastCallAt", label: "Last Call At" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

const FILTERS = [
  { key: "search", label: "Search", type: "text" as const },
  { key: "status", label: "Pipeline Status", type: "select" as const },
  { key: "stage", label: "Stage", type: "select" as const },
  { key: "muaType", label: "MUA Type", type: "select" as const },
  { key: "source", label: "Source", type: "select" as const },
  { key: "assignedToId", label: "Assigned Sales RM", type: "select" as const },
  { key: "dateFrom", label: "Created From", type: "date" as const },
  { key: "dateTo", label: "Created To", type: "date" as const },
];

async function getTemplates(userId: string, role: string) {
  return sql<{ id: string; name: string; config: Record<string, unknown>; updatedAt: string }[]>`
    SELECT id, name, config, updated_at AS "updatedAt"
    FROM custom_report_templates
    WHERE report_type = 'sales'
      AND (
        ${role} IN ('admin', 'owner')
        OR created_by = ${userId}::uuid
      )
    ORDER BY updated_at DESC
  `;
}

export async function GET() {
  const auth = await requireRoles(["salesRm", "salesTl", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }
  const [self] = await sql<{ teamId: string | null }[]>`SELECT team_id AS "teamId" FROM staff WHERE id = ${auth.session.userId}::uuid`;
  const assigneeRows = await sql<{ id: string; name: string }[]>`
    SELECT id, name
    FROM staff
    WHERE role::text IN ('sales_rm', 'sales_tl')
      AND (
        ${auth.session.role} IN ('admin', 'owner')
        OR (${auth.session.role} = 'salesTl' AND team_id = ${self?.teamId ?? null}::uuid)
        OR (${auth.session.role} = 'salesRm' AND id = ${auth.session.userId}::uuid)
      )
    ORDER BY name
  `;
  const [sourceRows, templates] = await Promise.all([
    sql<{ value: string }[]>`
      SELECT DISTINCT m.source AS value
      FROM sales.pipeline p
      JOIN muas m ON m.id = p.mua_id
      WHERE m.source IS NOT NULL
        AND (
          ${auth.session.role} IN ('admin', 'owner')
          OR (${auth.session.role} = 'salesRm' AND p.assigned_to = ${auth.session.userId}::uuid)
          OR (${auth.session.role} = 'salesTl' AND (
            p.assigned_to = ${auth.session.userId}::uuid
            OR EXISTS (
              SELECT 1 FROM staff sx
              WHERE sx.id = p.assigned_to
                AND sx.team_id = ${self?.teamId ?? null}::uuid
            )
          ))
        )
      ORDER BY value
      LIMIT 100
    `,
    getTemplates(auth.session.userId, auth.session.role),
  ]);
  const statusOptions = ["active", "closed"].map((value) => ({ value, label: value }));
  const stageOptions = PIPELINE_STAGE_ORDER.map((value) => ({ value, label: value }));
  const muaTypeOptions = ["candidate", "re_engage"].map((value) => ({
    value,
    label: salesPipelineMuaTypeLabel(value),
  }));
  const fields = auth.session.role === "salesRm" || auth.session.role === "salesTl"
    ? FIELDS.filter((f) => f.key !== "muaPhone")
    : FIELDS;
  return NextResponse.json({
    data: {
      fields,
      filters: FILTERS,
      filterOptions: {
        status: statusOptions,
        stage: stageOptions,
        muaType: muaTypeOptions,
        source: sourceRows.map((r) => ({ value: r.value, label: r.value })),
        assignedToId: assigneeRows.map((r) => ({ value: r.id, label: r.name })),
      },
      templates,
    },
    error: null,
  });
}

export async function POST(request: Request) {
  const auth = await requireRoles(["salesRm", "salesTl", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: "run" | "saveTemplate" | "deleteTemplate";
    fields?: FieldKey[];
    templateId?: string;
    templateName?: string;
    filters?: {
      stage?: string;
      status?: string;
      muaType?: string;
      assignedToId?: string;
      source?: string;
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
      VALUES ('sales', ${body.templateName.trim()}, ${sql.json(cfg)}, ${auth.session.userId}::uuid, ${auth.session.userId}::uuid, NOW())
      ON CONFLICT (report_type, name)
      DO UPDATE SET config = EXCLUDED.config, updated_by = EXCLUDED.updated_by, updated_at = NOW()
    `;
    return NextResponse.json({ data: { templates: await getTemplates(auth.session.userId, auth.session.role) }, error: null });
  }
  if (action === "deleteTemplate") {
    if (!body.templateId) {
      return NextResponse.json({ data: null, error: "templateId required" }, { status: 400 });
    }
    await sql`
      DELETE FROM custom_report_templates
      WHERE id = ${body.templateId}::uuid
        AND report_type = 'sales'
        AND (
          ${auth.session.role} IN ('admin', 'owner')
          OR created_by = ${auth.session.userId}::uuid
        )
    `;
    return NextResponse.json({ data: { templates: await getTemplates(auth.session.userId, auth.session.role) }, error: null });
  }

  const allowPhone = auth.session.role === "admin" || auth.session.role === "owner";
  const picked = (body.fields ?? [])
    .filter((f): f is FieldKey => FIELDS.some((x) => x.key === f))
    .filter((f) => (allowPhone ? true : f !== "muaPhone"));
  if (picked.length === 0) {
    return NextResponse.json({ data: null, error: "Select at least one field" }, { status: 400 });
  }
  const page = Math.max(1, Number(body.page ?? 1));
  const pageSize = Math.min(200, Math.max(10, Number(body.pageSize ?? 50)));
  const offset = (page - 1) * pageSize;
  const f = body.filters ?? {};
  const search = f.search?.trim();
  const searchLike = search ? `%${search}%` : null;
  const [self] = await sql<{ teamId: string | null }[]>`SELECT team_id AS "teamId" FROM staff WHERE id = ${auth.session.userId}::uuid`;

  const rows = await sql<any[]>`
    SELECT
      p.id AS "pipelineId",
      m.name AS "muaName",
      CASE WHEN ${allowPhone} THEN m.phone ELSE NULL END AS "muaPhone",
      p.mua_type AS "muaType",
      p.stage,
      p.status,
      m.source,
      m.city,
      s.name AS "assignedToName",
      p.created_at AS "createdAt",
      p.updated_at AS "updatedAt",
      COALESCE(pr.amount, o.avg_revenue_target) AS "priceOffered",
      COALESCE(ca.calls_count, 0)::int AS "callsCount",
      COALESCE(ca.talk_time_sec, 0)::int AS "talkTimeSec",
      ca.last_call_at AS "lastCallAt"
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    LEFT JOIN staff s ON s.id = p.assigned_to
    LEFT JOIN sales.onboarding o ON o.pipeline_id = p.id
    LEFT JOIN LATERAL (
      SELECT amount
      FROM sales.payment_records pr
      WHERE pr.pipeline_id = p.id
      ORDER BY pr.created_at DESC
      LIMIT 1
    ) pr ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS calls_count,
        COALESCE(SUM(cl.duration_sec), 0)::int AS talk_time_sec,
        MAX(cl.called_at) AS last_call_at
      FROM sales.call_logs cl
      WHERE cl.pipeline_id = p.id
    ) ca ON TRUE
    WHERE (${f.stage ?? null}::text IS NULL OR p.stage = ${f.stage ?? null})
      AND (${f.status ?? null}::text IS NULL OR p.status = ${f.status ?? null})
      AND (${f.muaType ?? null}::text IS NULL OR p.mua_type = ${f.muaType ?? null})
      AND (
        ${auth.session.role} IN ('admin', 'owner')
        OR (${auth.session.role} = 'salesRm' AND p.assigned_to = ${auth.session.userId}::uuid)
        OR (${auth.session.role} = 'salesTl' AND (
          p.assigned_to = ${auth.session.userId}::uuid
          OR EXISTS (
            SELECT 1 FROM staff sx
            WHERE sx.id = p.assigned_to
              AND sx.team_id = ${self?.teamId ?? null}::uuid
          )
        ))
      )
      AND (
        ${auth.session.role} IN ('admin', 'owner')
        OR (${f.assignedToId ?? null}::text IS NULL OR p.assigned_to = ${f.assignedToId ?? null}::uuid)
      )
      AND (${f.source ?? null}::text IS NULL OR m.source = ${f.source ?? null})
      AND (${f.dateFrom ?? null}::text IS NULL OR p.created_at::date >= ${f.dateFrom ?? null}::date)
      AND (${f.dateTo ?? null}::text IS NULL OR p.created_at::date <= ${f.dateTo ?? null}::date)
      AND (
        ${searchLike}::text IS NULL
        OR m.name ILIKE ${searchLike}
        OR (${allowPhone} AND m.phone ILIKE ${searchLike})
        OR p.id::text ILIKE ${searchLike}
      )
    ORDER BY p.created_at DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `;
  const [countRow] = await sql<{ total: number }[]>`
    SELECT COUNT(*)::int AS total
    FROM sales.pipeline p
    JOIN muas m ON m.id = p.mua_id
    WHERE (${f.stage ?? null}::text IS NULL OR p.stage = ${f.stage ?? null})
      AND (${f.status ?? null}::text IS NULL OR p.status = ${f.status ?? null})
      AND (${f.muaType ?? null}::text IS NULL OR p.mua_type = ${f.muaType ?? null})
      AND (
        ${auth.session.role} IN ('admin', 'owner')
        OR (${auth.session.role} = 'salesRm' AND p.assigned_to = ${auth.session.userId}::uuid)
        OR (${auth.session.role} = 'salesTl' AND (
          p.assigned_to = ${auth.session.userId}::uuid
          OR EXISTS (
            SELECT 1 FROM staff sx
            WHERE sx.id = p.assigned_to
              AND sx.team_id = ${self?.teamId ?? null}::uuid
          )
        ))
      )
      AND (
        ${auth.session.role} IN ('admin', 'owner')
        OR (${f.assignedToId ?? null}::text IS NULL OR p.assigned_to = ${f.assignedToId ?? null}::uuid)
      )
      AND (${f.source ?? null}::text IS NULL OR m.source = ${f.source ?? null})
      AND (${f.dateFrom ?? null}::text IS NULL OR p.created_at::date >= ${f.dateFrom ?? null}::date)
      AND (${f.dateTo ?? null}::text IS NULL OR p.created_at::date <= ${f.dateTo ?? null}::date)
      AND (
        ${searchLike}::text IS NULL
        OR m.name ILIKE ${searchLike}
        OR (${allowPhone} AND m.phone ILIKE ${searchLike})
        OR p.id::text ILIKE ${searchLike}
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
