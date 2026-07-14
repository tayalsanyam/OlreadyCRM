import { NextResponse } from "next/server";
import { generateTaskDisplayId, withTransaction } from "@/db/index";
import { requireSalesAccess } from "@/lib/api-auth";
import { toDbTaskType } from "@/lib/db-mappers";
import {
  createUnassignedSalesPipeline,
  salesPipelineSegment,
} from "@/lib/sales-pipeline-bootstrap";
import { syncSalesPlanPipelines } from "@/lib/sales-plan-sync";
import {
  isScopeError,
  pipelineAssigneeFilter,
  resolveSalesReportScope,
} from "@/lib/sales-report-scope";

export async function GET(request: Request) {
  const auth = await requireSalesAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const stage = url.searchParams.get("stage");
  const muaType = url.searchParams.get("mua_type");
  const search = url.searchParams.get("search")?.trim();
  const assigneeParam = url.searchParams.get("assigned_to")?.trim() || "all";
  const dateFrom = url.searchParams.get("date_from");
  const dateTo = url.searchParams.get("date_to");

  const isPersonalPipeline =
    auth.session.role === "salesRm" || auth.session.role === "salesTl";

  const result = await withTransaction(async (tx) => {
    await syncSalesPlanPipelines(tx);

    let scopeFilter;
    let scopeLabel = "My pipeline";
    if (isPersonalPipeline) {
      scopeFilter = pipelineAssigneeFilter(tx, [auth.session.userId]);
    } else {
      const scope = await resolveSalesReportScope(tx, auth.session, assigneeParam);
      if (isScopeError(scope)) {
        throw Object.assign(new Error(scope.error), { status: scope.status });
      }
      scopeFilter = pipelineAssigneeFilter(tx, scope.userIds);
      scopeLabel = scope.label;
    }
    const [priorityTagColumn] = await tx<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'sales'
          AND table_name = 'pipeline'
          AND column_name = 'priority_tag'
      ) AS "exists"
    `;

    const stageFilter = stage ? tx`p.stage = ${stage}` : tx`p.stage <> 'Rejected'`;
    const muaTypeFilter = muaType ? tx`p.mua_type = ${muaType}` : tx`TRUE`;
    const dateFromFilter = dateFrom ? tx`p.updated_at::date >= ${dateFrom}::date` : tx`TRUE`;
    const dateToFilter = dateTo ? tx`p.updated_at::date <= ${dateTo}::date` : tx`TRUE`;
    const searchPattern = search ? `%${search}%` : null;
    const searchFilter = searchPattern
      ? tx`(
          m.name ILIKE ${searchPattern}
          OR m.city ILIKE ${searchPattern}
          OR COALESCE(m.phone, '') ILIKE ${searchPattern}
          OR COALESCE(m.source, '') ILIKE ${searchPattern}
          OR p.stage::text ILIKE ${searchPattern}
          OR COALESCE(a.name, '') ILIKE ${searchPattern}
          OR COALESCE(st.name, '') ILIKE ${searchPattern}
          OR p.id::text ILIKE ${searchPattern}
        )`
      : tx`TRUE`;
    const priorityTagSelect = priorityTagColumn?.exists
      ? tx`p.priority_tag AS "priorityTag",`
      : tx`NULL::text AS "priorityTag",`;
    const [notesColumn] = await tx<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'sales' AND table_name = 'pipeline' AND column_name = 'sales_notes'
      ) AS "exists"
    `;
    const salesNotesSelect = notesColumn?.exists
      ? tx`p.sales_notes AS "salesNotes",`
      : tx`NULL::text AS "salesNotes",`;
    const lastNoteSelect = tx`(
      SELECT LEFT(cl.description, 120)
      FROM sales.comms_log cl
      WHERE cl.pipeline_id = p.id AND cl.entry_type IN ('noteAdded', 'callLogged', 'whatsappLogged')
      ORDER BY cl.created_at DESC
      LIMIT 1
    ) AS "lastNotePreview"`;

    const rows = await tx`
      SELECT
        p.id,
        p.mua_id AS "muaId",
        p.mua_type AS "muaType",
        p.stage,
        ${priorityTagSelect}
        ${salesNotesSelect}
        ${lastNoteSelect},
        p.status,
        p.assigned_to AS "assignedTo",
        p.sales_closed_by AS "salesClosedBy",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt",
        m.name AS "muaName",
        m.phone AS "muaPhone",
        m.whatsapp AS "muaWhatsapp",
        m.city AS "muaCity",
        m.source AS "muaSource",
        m.team_id AS "teamId",
        st.name AS "teamName",
        a.name AS "assignedToName",
        sc.name AS "salesClosedByName",
        COALESCE(o.quoted_amount, o.avg_revenue_target)::numeric AS "priceOffered",
        lc.called_at AS "lastCalledAt",
        lc.outcome AS "lastCallOutcome",
        COALESCE(ca.call_attempts_this_week, 0)::int AS "callAttemptsThisWeek",
        COALESCE(na.total_repeated_no_answer, 0)::int AS "totalRepeatedNoAnswer",
        DATE_PART('day', NOW() - p.updated_at)::int AS "daysInStage",
        DATE_PART('day', NOW() - COALESCE((SELECT MAX(created_at) FROM sales.comms_log cl WHERE cl.pipeline_id = p.id), p.created_at))::int AS "daysSinceLastContact",
        to_char(demo.next_touch_point, 'YYYY-MM-DD') AS "demoScheduledAt",
        to_char(confirm_touch.next_touch_point, 'YYYY-MM-DD') AS "confirmScheduledAt",
        to_char(deal_close_touch.next_touch_point, 'YYYY-MM-DD') AS "dealCloseScheduledAt"
      FROM sales.pipeline p
      JOIN muas m ON m.id = p.mua_id
      LEFT JOIN sales.teams st ON st.id = m.team_id
      LEFT JOIN staff a ON a.id = p.assigned_to
      LEFT JOIN staff sc ON sc.id = p.sales_closed_by
      LEFT JOIN LATERAL (
        SELECT amount, payment_date
        FROM sales.payment_records pr
        WHERE pr.pipeline_id = p.id
        ORDER BY pr.created_at DESC
        LIMIT 1
      ) pr ON TRUE
      LEFT JOIN LATERAL (
        SELECT cl.called_at, cl.outcome
        FROM sales.call_logs cl
        WHERE cl.pipeline_id = p.id
        ORDER BY cl.called_at DESC NULLS LAST, cl.created_at DESC
        LIMIT 1
      ) lc ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS call_attempts_this_week
        FROM sales.call_logs cl
        WHERE cl.pipeline_id = p.id
          AND cl.called_at >= NOW() - INTERVAL '7 day'
      ) ca ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          SUM(
            CASE
              WHEN LOWER(COALESCE(t.outcome, '')) IN ('no_answer', 'missed', 'unanswered')
              THEN 1
              ELSE 0
            END
          )::int AS total_repeated_no_answer
        FROM (
          SELECT outcome
          FROM sales.call_logs cl
          WHERE cl.pipeline_id = p.id
          ORDER BY cl.called_at DESC NULLS LAST, cl.created_at DESC
          LIMIT 3
        ) t
      ) na ON TRUE
      LEFT JOIN LATERAL (
        SELECT sl.next_touch_point
        FROM sales.stage_log sl
        WHERE sl.pipeline_id = p.id
          AND sl.next_touch_point IS NOT NULL
          AND (
            sl.to_stage = 'Demo Scheduled'
            OR (p.stage = 'Demo Scheduled' AND sl.to_stage IN ('Demo Scheduled', 'Demo Done', 'Details Shared', 'Call Back', 'Follow Up'))
          )
        ORDER BY
          CASE WHEN sl.to_stage = 'Demo Scheduled' THEN 0 ELSE 1 END,
          sl.created_at DESC
        LIMIT 1
      ) demo ON TRUE
      LEFT JOIN LATERAL (
        SELECT sl.next_touch_point
        FROM sales.stage_log sl
        WHERE sl.pipeline_id = p.id
          AND sl.to_stage = 'Confirm'
          AND sl.next_touch_point IS NOT NULL
        ORDER BY sl.created_at DESC
        LIMIT 1
      ) confirm_touch ON TRUE
      LEFT JOIN LATERAL (
        SELECT sl.next_touch_point
        FROM sales.stage_log sl
        WHERE sl.pipeline_id = p.id
          AND p.stage = 'Confirm'
          AND sl.next_touch_point IS NOT NULL
        ORDER BY sl.created_at DESC
        LIMIT 1
      ) deal_close_touch ON TRUE
      LEFT JOIN sales.onboarding o ON o.pipeline_id = p.id
      WHERE p.status = 'active'
        AND m.status = 'active'
        AND ${stageFilter}
        AND ${muaTypeFilter}
        AND ${dateFromFilter}
        AND ${dateToFilter}
        AND ${searchFilter}
        AND ${scopeFilter}
      ORDER BY p.updated_at DESC
    `;

    return {
      rows,
      scope: {
        label: scopeLabel,
        isPersonal: isPersonalPipeline,
      },
    };
  });

  return NextResponse.json({ data: result.rows, scope: result.scope, error: null });
}

export async function POST(request: Request) {
  const auth = await requireSalesAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }
  if (!(auth.session.role === "salesRm" || auth.session.role === "salesTl" || auth.session.role === "admin")) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    muaId?: string;
    muaType?: "candidate" | "re_engage";
  };
  const muaId = body.muaId;
  if (!muaId) {
    return NextResponse.json({ data: null, error: "muaId is required" }, { status: 400 });
  }

  const result = await withTransaction(async (tx) => {
    const [mua] = await tx<{ id: string; name: string; status: string }[]>`
      SELECT id, name, status::text AS status FROM muas WHERE id = ${muaId}::uuid
    `;
    if (!mua) throw new Error("MUA not found");
    if (mua.status === "inactive") {
      throw Object.assign(new Error("MUA is inactive on roster"), { status: 400 });
    }

    const segment = await salesPipelineSegment(tx, muaId);
    const muaType = body.muaType ?? segment;
    if (muaType !== segment) {
      throw Object.assign(
        new Error(
          segment === "candidate"
            ? "No plan history — use Potential pipeline"
            : "Has plan history — use Existing No Plan pipeline"
        ),
        { status: 400 }
      );
    }

    const [existing] = await tx<{ id: string }[]>`
      SELECT id FROM sales.pipeline WHERE mua_id = ${muaId}::uuid AND status = 'active' LIMIT 1
    `;
    if (existing) throw new Error("Active pipeline already exists for this MUA");

    const [muaPhone] = await tx<{ phone: string | null }[]>`
      SELECT phone FROM muas WHERE id = ${muaId}::uuid
    `;
    if (muaPhone?.phone) {
      const { normalizePhone } = await import("@/lib/phone");
      const normalized = normalizePhone(muaPhone.phone);
      if (normalized.length >= 10) {
        const [dup] = await tx<{ pipelineId: string; muaName: string; stage: string }[]>`
          SELECT p.id AS "pipelineId", m.name AS "muaName", p.stage
          FROM muas m
          JOIN sales.pipeline p ON p.mua_id = m.id AND p.status = 'active'
          WHERE RIGHT(REGEXP_REPLACE(COALESCE(m.phone, ''), '\\D', '', 'g'), 10) = ${normalized}
            AND m.id <> ${muaId}::uuid
          LIMIT 1
        `;
        if (dup) {
          throw Object.assign(
            new Error(`Duplicate phone: active pipeline for ${dup.muaName} (${dup.stage})`),
            { status: 409, duplicate: dup },
          );
        }
      }
    }

    const [pipeline] = await tx`
      INSERT INTO sales.pipeline (mua_id, mua_type, stage, status, assigned_to)
      VALUES (${muaId}::uuid, ${muaType}, 'Untouched', 'active', ${auth.session.userId}::uuid)
      RETURNING id
    `;
    const pipelineRef = `[PIPE:${pipeline.id}]`;

    const taskDisplayId = await generateTaskDisplayId(tx);
    await tx`
      INSERT INTO rm_tasks (display_id, staff_id, lead_id, push_id, task_type, title, due_date, status)
      VALUES (
        ${taskDisplayId},
        ${auth.session.userId}::uuid,
        NULL,
        NULL,
        ${toDbTaskType("salesFollowUp")}::task_type,
        ${`First touchpoint — ${mua.name} ${pipelineRef}`},
        CURRENT_DATE,
        'pending'
      )
    `;

    await tx`
      INSERT INTO sales.comms_log (pipeline_id, entry_type, description, actor_id)
      VALUES (${pipeline.id}::uuid, 'stageChanged', 'Pipeline created at Untouched', ${auth.session.userId}::uuid)
    `;

    return pipeline;
  });

  return NextResponse.json({ data: result, error: null });
}
