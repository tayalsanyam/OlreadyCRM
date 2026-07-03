import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import {
  callSalespersonFilter,
  commsActorFilter,
  isScopeError,
  pipelineClosedByFilter,
  resolveSalesReportScope,
} from "@/lib/sales-report-scope";
import { PIPELINE_CLOSED_AT_SQL } from "@/lib/sales-reports-queries";
import {
  aggregateSalesTargets,
  computeSalesTargetPace,
  fetchSalesTargetActuals,
  fetchSalesTargetByMember,
  salesTargetHasValues,
} from "@/lib/sales-targets";

function monthKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function GET(request: Request) {
  const auth = await requireRoles(["salesRm", "salesTl", "admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const requestedMonth = searchParams.get("month");
  const month = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : monthKey();
  const assignee = searchParams.get("assignee");

  try {
    const data = await withTransaction(async (tx) => {
      const scope = await resolveSalesReportScope(tx, auth.session, assignee);
      if (isScopeError(scope)) {
        throw Object.assign(new Error(scope.error), { status: scope.status });
      }

      const userIds = scope.userIds;
      const closedBy = pipelineClosedByFilter(tx, userIds);
      const closedByP = pipelineClosedByFilter(tx, userIds, "p");
      const actor = commsActorFilter(tx, userIds);
      const caller = callSalespersonFilter(tx, userIds);

      const targetRows =
        userIds.length === 0
          ? await tx`SELECT * FROM sales.targets WHERE month = ${month}`
          : await tx`SELECT * FROM sales.targets WHERE user_id = ANY(${userIds}::uuid[]) AND month = ${month}`;

      const target = aggregateSalesTargets(targetRows as Record<string, unknown>[]);
      const actuals = await fetchSalesTargetActuals(tx, month, { closedBy, closedByP, actor, caller });
      const pace = computeSalesTargetPace(month, target, actuals);

      const closedDeals = await tx`
        SELECT
          p.id,
          m.name AS "muaName",
          m.city AS "muaCity",
          p.mua_type AS "muaType",
          COALESCE(pr.total_amount, 0)::numeric AS revenue,
          ${tx.unsafe(PIPELINE_CLOSED_AT_SQL)} AS "closedAt",
          s.name AS "closedByName"
        FROM sales.pipeline p
        JOIN muas m ON m.id = p.mua_id
        LEFT JOIN staff s ON s.id = p.sales_closed_by
        LEFT JOIN LATERAL (
          SELECT SUM(pr.amount)::numeric(14,2) AS total_amount
          FROM sales.payment_records pr
          WHERE pr.pipeline_id = p.id
            AND to_char(pr.payment_date, 'YYYY-MM') = ${month}
        ) pr ON TRUE
        WHERE ${closedByP}
          AND p.stage IN ('Onboarding', 'Deal Closed')
          AND to_char(${tx.unsafe(PIPELINE_CLOSED_AT_SQL)}, 'YYYY-MM') = ${month}
        ORDER BY ${tx.unsafe(PIPELINE_CLOSED_AT_SQL)} DESC
        LIMIT 100
      `;

      const byMember =
        userIds.length === 1
          ? []
          : await fetchSalesTargetByMember(tx, month, userIds.length > 0 ? userIds : null);

      return {
        month,
        target,
        hasTarget: salesTargetHasValues(target),
        actuals,
        pace,
        byMember,
        closedDeals,
        scopeLabel: scope.label,
      };
    });

    return NextResponse.json({ data, error: null });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 500;
    const message = error instanceof Error ? error.message : "Failed to load targets";
    return NextResponse.json({ data: null, error: message }, { status });
  }
}
