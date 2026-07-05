import { NextResponse } from "next/server";
import { withTransaction, type TransactionSql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import {
  isScopeError,
  pipelineAssigneeFilter,
  resolveSalesReportScope,
} from "@/lib/sales-report-scope";

export async function GET(request: Request) {
  const auth = await requireRoles(["salesRm", "salesTl", "admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const assignee = searchParams.get("assignee");
  const muaTypeRaw = searchParams.get("mua_type");
  const stage = searchParams.get("stage");
  const fromRaw = searchParams.get("date_from");
  const toRaw = searchParams.get("date_to");
  const muaType =
    muaTypeRaw && ["candidate", "renewal", "re_engage"].includes(muaTypeRaw) ? muaTypeRaw : null;
  const from = fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : null;
  const to = toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? toRaw : null;

  try {
    const data = await withTransaction(async (tx) => {
      const scope = await resolveSalesReportScope(tx, auth.session, assignee);
      if (isScopeError(scope)) {
        throw Object.assign(new Error(scope.error), { status: scope.status });
      }
      const scoped = pipelineAssigneeFilter(tx, scope.userIds);
      const muaTypeFilter = muaType ? tx`p.mua_type = ${muaType}` : tx`TRUE`;
      const stageFilter = stage ? tx`p.stage = ${stage}` : tx`TRUE`;

      const [priorityTagColumn] = await tx<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'sales' AND table_name = 'pipeline' AND column_name = 'priority_tag'
        ) AS "exists"
      `;
      const priorityTagSelect = priorityTagColumn?.exists
        ? tx`p.priority_tag AS "priorityTag",`
        : tx`NULL::text AS "priorityTag",`;

      const rows = await tx`
        SELECT
          p.id,
          m.name AS "muaName",
          m.city AS "muaCity",
          m.phone AS "muaPhone",
          m.whatsapp AS "muaWhatsapp",
          p.stage,
          p.mua_type AS "muaType",
          ${priorityTagSelect}
          s.name AS "assignedToName",
          DATE_PART('day', NOW() - p.updated_at)::int AS "daysInStage",
          DATE_PART(
            'day',
            NOW() - COALESCE((SELECT MAX(created_at) FROM sales.comms_log cl WHERE cl.pipeline_id = p.id), p.created_at)
          )::int AS "daysSinceLastContact",
          COALESCE(o.quoted_amount, o.avg_revenue_target)::numeric AS "priceOffered",
          lc.outcome AS "lastCallOutcome",
          COALESCE(na.total_repeated_no_answer, 0)::int AS "totalRepeatedNoAnswer",
          (
            SELECT LEFT(cl.description, 120)
            FROM sales.comms_log cl
            WHERE cl.pipeline_id = p.id
              AND cl.entry_type IN ('noteAdded', 'callLogged', 'whatsappLogged')
            ORDER BY cl.created_at DESC
            LIMIT 1
          ) AS "lastNotePreview"
        FROM sales.pipeline p
        JOIN muas m ON m.id = p.mua_id
        LEFT JOIN staff s ON s.id = p.assigned_to
        LEFT JOIN LATERAL (
          SELECT amount FROM sales.payment_records pr
          WHERE pr.pipeline_id = p.id ORDER BY pr.created_at DESC LIMIT 1
        ) pr ON TRUE
        LEFT JOIN sales.onboarding o ON o.pipeline_id = p.id
        LEFT JOIN LATERAL (
          SELECT cl.outcome FROM sales.call_logs cl
          WHERE cl.pipeline_id = p.id
          ORDER BY cl.called_at DESC NULLS LAST, cl.created_at DESC LIMIT 1
        ) lc ON TRUE
        LEFT JOIN LATERAL (
          SELECT SUM(
            CASE WHEN LOWER(COALESCE(t.outcome, '')) IN ('no_answer', 'missed', 'unanswered') THEN 1 ELSE 0 END
          )::int AS total_repeated_no_answer
          FROM (
            SELECT outcome FROM sales.call_logs cl
            WHERE cl.pipeline_id = p.id
            ORDER BY cl.called_at DESC NULLS LAST, cl.created_at DESC LIMIT 3
          ) t
        ) na ON TRUE
        WHERE p.status = 'active'
          AND ${scoped}
          AND ${muaTypeFilter}
          AND ${stageFilter}
          AND (${from}::date IS NULL OR p.updated_at::date >= ${from}::date)
          AND (${to}::date IS NULL OR p.updated_at::date <= ${to}::date)
        ORDER BY p.stage, p.updated_at ASC
      `;

      return { rows, scopeLabel: scope.label };
    });

    return NextResponse.json({ data, error: null });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 500;
    const message = error instanceof Error ? error.message : "Failed to load pipeline rows";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
