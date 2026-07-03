import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import {
  isScopeError,
  pipelineAssigneeFilter,
  resolveSalesReportScope,
} from "@/lib/sales-report-scope";
import { pipelineReportActiveFilter } from "@/lib/sales-reports-queries";

export async function GET(request: Request) {
  const auth = await requireRoles(["salesRm", "salesTl", "admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const fromRaw = searchParams.get("date_from");
  const toRaw = searchParams.get("date_to");
  const from = fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : null;
  const to = toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? toRaw : null;
  const assignee = searchParams.get("assignee");
  const muaTypeRaw = searchParams.get("mua_type");
  const muaType =
    muaTypeRaw && ["candidate", "renewal", "re_engage"].includes(muaTypeRaw) ? muaTypeRaw : null;

  try {
    const data = await withTransaction(async (tx) => {
      const scope = await resolveSalesReportScope(tx, auth.session, assignee);
      if (isScopeError(scope)) {
        throw Object.assign(new Error(scope.error), { status: scope.status });
      }
      const scoped = pipelineAssigneeFilter(tx, scope.userIds);
      const activePipeline = pipelineReportActiveFilter(tx);
      const muaTypeFilter = muaType ? tx`p.mua_type = ${muaType}` : tx`TRUE`;

      const byStage = await tx`
        SELECT p.stage, p.mua_type AS "muaType", COUNT(*)::int AS count
        FROM sales.pipeline p
        WHERE ${scoped}
          AND ${activePipeline}
          AND ${muaTypeFilter}
          AND (${from}::date IS NULL OR p.updated_at::date >= ${from}::date)
          AND (${to}::date IS NULL OR p.updated_at::date <= ${to}::date)
        GROUP BY p.stage, p.mua_type
        ORDER BY p.stage
      `;

      const [stale] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM sales.pipeline p
        WHERE ${scoped}
          AND ${activePipeline}
          AND ${muaTypeFilter}
          AND p.updated_at < NOW() - INTERVAL '7 days'
      `;

      const [untouched] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM sales.pipeline p
        WHERE ${scoped}
          AND ${activePipeline}
          AND ${muaTypeFilter}
          AND p.stage = 'Untouched'
          AND p.updated_at < NOW() - INTERVAL '3 days'
      `;

      const [hot] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM sales.pipeline p
        WHERE ${scoped}
          AND ${activePipeline}
          AND ${muaTypeFilter}
          AND p.stage IN ('Demo Done', 'Senior Call', 'Senior Call Done', 'Confirm')
      `;

      const [totalActive] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM sales.pipeline p
        WHERE ${scoped} AND ${activePipeline} AND ${muaTypeFilter}
      `;

      return {
        byStage,
        stale: stale?.count ?? 0,
        untouched: untouched?.count ?? 0,
        hot: hot?.count ?? 0,
        totalActive: totalActive?.count ?? 0,
        scopeLabel: scope.label,
      };
    });

    return NextResponse.json({ data, error: null });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 500;
    const message = error instanceof Error ? error.message : "Failed to load pipeline summary";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
