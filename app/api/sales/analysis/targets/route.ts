import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import { resolveTlTeamMemberIds } from "@/lib/sales-report-scope";

function monthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const auth = await requireRoles(["salesTl", "admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const requestedMonth = new URL(request.url).searchParams.get("month");
  const month = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : monthKey();
  const rows = await withTransaction(async (tx) => {
    let userScope = tx`s.role IN ('sales_rm', 'sales_tl')`;
    if (auth.session.role === "salesTl") {
      const memberIds = await resolveTlTeamMemberIds(tx, auth.session.userId);
      userScope = tx`s.id = ANY(${memberIds}::uuid[])`;
    }

    return tx`
      WITH actuals AS (
        SELECT
          p.sales_closed_by AS user_id,
          COUNT(*)::int AS actual_sold,
          COALESCE(SUM(pr.amount), 0)::numeric(14,2) AS actual_revenue
        FROM sales.pipeline p
        LEFT JOIN sales.payment_records pr ON pr.pipeline_id = p.id
        WHERE p.stage IN ('Onboarding', 'Deal Closed')
          AND TO_CHAR(COALESCE(pr.payment_date, p.updated_at::date), 'YYYY-MM') = ${month}
        GROUP BY p.sales_closed_by
      )
      SELECT
        s.id,
        s.name,
        t.target_revenue AS "targetRevenue",
        t.target_potential_sold AS "targetSold",
        COALESCE(a.actual_revenue, 0)::numeric(14,2) AS "actualRevenue",
        COALESCE(a.actual_sold, 0)::int AS "actualSold"
      FROM staff s
      LEFT JOIN sales.targets t ON t.user_id = s.id AND t.month = ${month}
      LEFT JOIN actuals a ON a.user_id = s.id
      WHERE ${userScope}
      ORDER BY s.name
    `;
  });

  return NextResponse.json({ data: { month, rows }, error: null });
}
