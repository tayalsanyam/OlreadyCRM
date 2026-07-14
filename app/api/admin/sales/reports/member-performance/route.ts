import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import { apiErrorResponse } from "@/lib/api-error-response";
import {
  effectiveSalesMonth,
  parseAdminSalesReportFilters,
} from "@/lib/admin-sales-report-filters";
import { syncSalesPlanPipelines } from "@/lib/sales-plan-sync";
import { PIPELINE_CLOSED_AT_SQL } from "@/lib/sales-reports-queries";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const f = parseAdminSalesReportFilters(new URL(request.url).searchParams);
  const effectiveMonth = effectiveSalesMonth(f);
  const qPattern = f.q ? `%${f.q}%` : null;

  try {
    const data = await withTransaction(async (tx) => {
    await syncSalesPlanPipelines(tx);

    const [summary] = await tx<
      {
        totalPipeline: number;
        unassigned: number;
        potential: number;
        renewal: number;
        reEngage: number;
        confirm: number;
        closed: number;
        revenue: string;
      }[]
    >`
      SELECT
        COUNT(*)::int AS "totalPipeline",
        COUNT(*) FILTER (WHERE p.assigned_to IS NULL)::int AS unassigned,
        COUNT(*) FILTER (WHERE p.mua_type = 'candidate')::int AS potential,
        COUNT(*) FILTER (WHERE p.mua_type = 'renewal')::int AS renewal,
        COUNT(*) FILTER (WHERE p.mua_type = 're_engage')::int AS "reEngage",
        COUNT(*) FILTER (WHERE p.stage = 'Confirm')::int AS confirm,
        COUNT(*) FILTER (WHERE p.stage IN ('Onboarding', 'Deal Closed'))::int AS closed,
        COALESCE(
          SUM(
            CASE
              WHEN p.stage IN ('Onboarding', 'Deal Closed') THEN
                COALESCE(pr.amount, o.quoted_amount, o.avg_revenue_target)
              ELSE 0
            END
          ),
          0
        )::numeric(14,2) AS revenue
      FROM sales.pipeline p
      JOIN muas m ON m.id = p.mua_id
      LEFT JOIN staff s ON s.id = p.assigned_to
      LEFT JOIN sales.onboarding o ON o.pipeline_id = p.id
      LEFT JOIN LATERAL (
        SELECT amount
        FROM sales.payment_records
        WHERE pipeline_id = p.id
        ORDER BY payment_date DESC NULLS LAST, created_at DESC
        LIMIT 1
      ) pr ON true
      WHERE p.status = 'active'
        AND (${f.stage}::text IS NULL OR p.stage = ${f.stage})
        AND (${f.muaType}::text IS NULL OR p.mua_type = ${f.muaType})
        AND (${f.source}::text IS NULL OR m.source = ${f.source})
        AND (${f.city}::text IS NULL OR m.city = ${f.city})
        AND (${f.assignedTo}::uuid IS NULL OR p.assigned_to = ${f.assignedTo}::uuid)
        AND (${f.teamId}::uuid IS NULL OR m.team_id = ${f.teamId}::uuid)
        AND (${f.dateFrom}::date IS NULL OR p.updated_at::date >= ${f.dateFrom}::date)
        AND (${f.dateTo}::date IS NULL OR p.updated_at::date <= ${f.dateTo}::date)
        AND (${f.unassignedOnly}::boolean IS FALSE OR p.assigned_to IS NULL)
        AND (
          ${f.assignedOnly}::boolean IS FALSE
          OR (
            p.assigned_to IS NOT NULL
            AND s.role IN ('sales_rm', 'sales_tl')
          )
        )
        AND (
          ${qPattern}::text IS NULL
          OR m.name ILIKE ${qPattern}
          OR m.city ILIKE ${qPattern}
          OR s.name ILIKE ${qPattern}
        )
    `;

    const members = await tx<
      {
        staffId: string;
        name: string;
        role: string;
        teamId: string | null;
        teamName: string | null;
        activePipeline: number;
        confirmStage: number;
        dealsClosedMtd: number;
        revenueMtd: string;
        callsMtd: number;
        talkMinutesMtd: number;
        targetRevenue: string | null;
        targetPotentialSold: number | null;
        targetExistingSold: number | null;
        targetSoldTotal: number | null;
        overdueTasks: number;
      }[]
    >`
      WITH filtered_pipeline AS (
        SELECT
          p.id,
          p.stage,
          p.assigned_to,
          p.mua_type
        FROM sales.pipeline p
        JOIN muas m ON m.id = p.mua_id
        LEFT JOIN staff s ON s.id = p.assigned_to
        WHERE p.status = 'active'
          AND (${f.stage}::text IS NULL OR p.stage = ${f.stage})
          AND (${f.muaType}::text IS NULL OR p.mua_type = ${f.muaType})
          AND (${f.source}::text IS NULL OR m.source = ${f.source})
          AND (${f.city}::text IS NULL OR m.city = ${f.city})
          AND (${f.assignedTo}::uuid IS NULL OR p.assigned_to = ${f.assignedTo}::uuid)
          AND (${f.teamId}::uuid IS NULL OR m.team_id = ${f.teamId}::uuid)
          AND (${f.dateFrom}::date IS NULL OR p.updated_at::date >= ${f.dateFrom}::date)
          AND (${f.dateTo}::date IS NULL OR p.updated_at::date <= ${f.dateTo}::date)
          AND (${f.unassignedOnly}::boolean IS FALSE OR p.assigned_to IS NULL)
          AND (
            ${f.assignedOnly}::boolean IS FALSE
            OR (
              p.assigned_to IS NOT NULL
              AND s.role IN ('sales_rm', 'sales_tl')
            )
          )
          AND (
            ${qPattern}::text IS NULL
            OR m.name ILIKE ${qPattern}
            OR m.city ILIKE ${qPattern}
            OR s.name ILIKE ${qPattern}
          )
      ),
      pipeline_by_staff AS (
        SELECT
          fp.assigned_to AS staff_id,
          COUNT(*)::int AS active_pipeline,
          COUNT(*) FILTER (WHERE fp.stage = 'Confirm')::int AS confirm_stage
        FROM filtered_pipeline fp
        WHERE fp.assigned_to IS NOT NULL
        GROUP BY fp.assigned_to
      ),
      revenue_actuals AS (
        SELECT
          p.sales_closed_by AS user_id,
          COALESCE(SUM(pr.amount), 0)::numeric(14,2) AS revenue
        FROM sales.payment_records pr
        JOIN sales.pipeline p ON p.id = pr.pipeline_id
        JOIN muas m ON m.id = p.mua_id
        WHERE p.sales_closed_by IS NOT NULL
          AND to_char(pr.payment_date, 'YYYY-MM') = ${effectiveMonth}
          AND (${f.dateFrom}::date IS NULL OR pr.payment_date >= ${f.dateFrom}::date)
          AND (${f.dateTo}::date IS NULL OR pr.payment_date <= ${f.dateTo}::date)
          AND (${f.stage}::text IS NULL OR p.stage = ${f.stage})
          AND (${f.muaType}::text IS NULL OR p.mua_type = ${f.muaType})
          AND (${f.source}::text IS NULL OR m.source = ${f.source})
          AND (${f.city}::text IS NULL OR m.city = ${f.city})
          AND (${f.assignedTo}::uuid IS NULL OR p.assigned_to = ${f.assignedTo}::uuid)
          AND (${f.teamId}::uuid IS NULL OR m.team_id = ${f.teamId}::uuid)
          AND (
            ${qPattern}::text IS NULL
            OR m.name ILIKE ${qPattern}
            OR m.city ILIKE ${qPattern}
          )
        GROUP BY p.sales_closed_by
      ),
      sold_actuals AS (
        SELECT
          p.sales_closed_by AS user_id,
          COUNT(*)::int AS deals_closed
        FROM sales.pipeline p
        JOIN muas m ON m.id = p.mua_id
        WHERE p.stage IN ('Onboarding', 'Deal Closed')
          AND p.sales_closed_by IS NOT NULL
          AND to_char(${tx.unsafe(PIPELINE_CLOSED_AT_SQL)}, 'YYYY-MM') = ${effectiveMonth}
          AND (${f.dateFrom}::date IS NULL OR (${tx.unsafe(PIPELINE_CLOSED_AT_SQL)})::date >= ${f.dateFrom}::date)
          AND (${f.dateTo}::date IS NULL OR (${tx.unsafe(PIPELINE_CLOSED_AT_SQL)})::date <= ${f.dateTo}::date)
          AND (${f.stage}::text IS NULL OR p.stage = ${f.stage})
          AND (${f.muaType}::text IS NULL OR p.mua_type = ${f.muaType})
          AND (${f.source}::text IS NULL OR m.source = ${f.source})
          AND (${f.city}::text IS NULL OR m.city = ${f.city})
          AND (${f.assignedTo}::uuid IS NULL OR p.assigned_to = ${f.assignedTo}::uuid)
          AND (${f.teamId}::uuid IS NULL OR m.team_id = ${f.teamId}::uuid)
          AND (
            ${qPattern}::text IS NULL
            OR m.name ILIKE ${qPattern}
            OR m.city ILIKE ${qPattern}
          )
        GROUP BY p.sales_closed_by
      ),
      call_stats AS (
        SELECT
          cl.salesperson_id AS staff_id,
          COUNT(*)::int AS calls_mtd,
          COALESCE(SUM(cl.duration_sec), 0)::int AS duration_sec_mtd
        FROM sales.call_logs cl
        WHERE cl.called_at >= date_trunc('month', NOW())
        GROUP BY cl.salesperson_id
      ),
      overdue_tasks AS (
        SELECT
          t.staff_id,
          COUNT(*)::int AS overdue_tasks
        FROM rm_tasks t
        WHERE t.status = 'pending'
          AND t.task_type::text IN ('sales_follow_up', 'sales_senior_call')
          AND t.due_date < CURRENT_DATE
        GROUP BY t.staff_id
      )
      SELECT
        s.id AS "staffId",
        s.name,
        s.role::text AS role,
        st.id AS "teamId",
        st.name AS "teamName",
        COALESCE(pb.active_pipeline, 0)::int AS "activePipeline",
        COALESCE(pb.confirm_stage, 0)::int AS "confirmStage",
        COALESCE(sa.deals_closed, 0)::int AS "dealsClosedMtd",
        COALESCE(ra.revenue, 0)::numeric(14,2) AS "revenueMtd",
        COALESCE(cs.calls_mtd, 0)::int AS "callsMtd",
        ROUND(COALESCE(cs.duration_sec_mtd, 0) / 60.0)::int AS "talkMinutesMtd",
        COALESCE(ot.overdue_tasks, 0)::int AS "overdueTasks",
        tgt.target_revenue::numeric(14,2) AS "targetRevenue",
        tgt.target_potential_sold AS "targetPotentialSold",
        tgt.target_existing_sold AS "targetExistingSold",
        (COALESCE(tgt.target_potential_sold, 0) + COALESCE(tgt.target_existing_sold, 0))::int AS "targetSoldTotal"
      FROM staff s
      LEFT JOIN sales.teams st ON st.id = s.team_id
      LEFT JOIN pipeline_by_staff pb ON pb.staff_id = s.id
      LEFT JOIN sold_actuals sa ON sa.user_id = s.id
      LEFT JOIN revenue_actuals ra ON ra.user_id = s.id
      LEFT JOIN call_stats cs ON cs.staff_id = s.id
      LEFT JOIN overdue_tasks ot ON ot.staff_id = s.id
      LEFT JOIN sales.targets tgt ON tgt.user_id = s.id AND tgt.month = ${effectiveMonth}
      WHERE s.active = true
        AND s.role::text IN ('sales_rm', 'sales_tl')
        AND (${f.assignedTo}::uuid IS NULL OR s.id = ${f.assignedTo}::uuid)
        AND (${f.teamId}::uuid IS NULL OR s.team_id = ${f.teamId}::uuid)
      ORDER BY st.name NULLS LAST, s.name
    `;

    const teams = await tx<{ id: string; name: string; memberCount: number }[]>`
      SELECT
        t.id,
        t.name,
        COUNT(s.id) FILTER (WHERE s.role = 'sales_rm')::int AS "memberCount"
      FROM sales.teams t
      LEFT JOIN staff s ON s.team_id = t.id AND s.active = true AND s.role::text IN ('sales_rm', 'sales_tl')
      GROUP BY t.id, t.name
      ORDER BY t.name
    `;

    const revenue = Number(summary?.revenue ?? 0);
    const totalPipeline = summary?.totalPipeline ?? 0;
    const closed = summary?.closed ?? 0;

    return {
      month: effectiveMonth,
      summary: {
        totalPipeline,
        unassigned: summary?.unassigned ?? 0,
        potential: summary?.potential ?? 0,
        renewal: summary?.renewal ?? 0,
        reEngage: summary?.reEngage ?? 0,
        confirm: summary?.confirm ?? 0,
        closed,
        revenue,
        closeRate: totalPipeline > 0 ? Math.round((closed / totalPipeline) * 100) : 0,
      },
      members: members.map((m: (typeof members)[number]) => ({
        ...m,
        revenueMtd: Number(m.revenueMtd),
        targetRevenue: m.targetRevenue != null ? Number(m.targetRevenue) : null,
        revenuePct:
          m.targetRevenue != null && Number(m.targetRevenue) > 0
            ? Math.round((Number(m.revenueMtd) / Number(m.targetRevenue)) * 100)
            : null,
        soldPct:
          m.targetSoldTotal != null && m.targetSoldTotal > 0
            ? Math.round((m.dealsClosedMtd / m.targetSoldTotal) * 100)
            : null,
      })),
      teams,
    };
  });

    return NextResponse.json({ data, error: null });
  } catch (error) {
    return apiErrorResponse(error, "Failed to load member performance");
  }
}
