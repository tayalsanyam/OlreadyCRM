import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import {
  callStaffFilter,
  isCallyzerScopeError,
  resolveCallStaffUserIds,
  resolveCallyzerReportScope,
} from "@/lib/callyzer-report-scope";

export async function GET(request: Request) {
  const auth = await requireRoles(["salesRm", "salesTl", "admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const fromRaw = searchParams.get("date_from");
  const toRaw = searchParams.get("date_to");
  const from = fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : null;
  const to = toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? toRaw : null;
  const assignee = searchParams.get("assignee");

  try {
    const data = await withTransaction(async (tx) => {
      const scope = await resolveCallyzerReportScope(tx, auth.session, assignee);
      if (isCallyzerScopeError(scope)) {
        throw Object.assign(new Error(scope.error), { status: scope.status });
      }
      const creditUserIds = await resolveCallStaffUserIds(tx, scope.userIds);
      const scoped = callStaffFilter(tx, creditUserIds);
      const salesScoped =
        scope.userIds.length === 0 ? tx`TRUE` : tx`cl.salesperson_id = ANY(${scope.userIds}::uuid[])`;

      const rows = await tx`
        SELECT cl.called_at::date AS day,
               COUNT(*)::int AS calls,
               COALESCE(SUM(cl.duration_sec),0)::int AS "durationSec",
               ROUND((SUM(CASE WHEN lower(coalesce(cl.outcome,'')) LIKE '%answer%' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*),0)) * 100, 1) AS "answerRate"
        FROM call_logs cl
        WHERE ${scoped}
          AND (${from}::date IS NULL OR cl.called_at::date >= ${from}::date)
          AND (${to}::date IS NULL OR cl.called_at::date <= ${to}::date)
        GROUP BY cl.called_at::date
        ORDER BY cl.called_at::date DESC
      `;

      const recentCalls = await tx`
        SELECT
          cl.id,
          cl.called_at AS "calledAt",
          cl.duration_sec AS "durationSec",
          cl.outcome,
          m.name AS "muaName",
          p.id AS "pipelineId",
          p.stage,
          s.name AS "staffName"
        FROM sales.call_logs cl
        LEFT JOIN sales.pipeline p ON p.id = cl.pipeline_id
        LEFT JOIN muas m ON m.id = p.mua_id
        LEFT JOIN staff s ON s.id = cl.salesperson_id
        WHERE ${salesScoped}
          AND (${from}::date IS NULL OR cl.called_at::date >= ${from}::date)
          AND (${to}::date IS NULL OR cl.called_at::date <= ${to}::date)
        ORDER BY cl.called_at DESC NULLS LAST, cl.created_at DESC
        LIMIT 60
      `;

      return { rows, recentCalls, scopeLabel: scope.label };
    });

    return NextResponse.json({ data, error: null });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 500;
    const message = error instanceof Error ? error.message : "Failed to load call activity";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
