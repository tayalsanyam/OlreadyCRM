import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { setAuditActor, withTransaction } from "@/db/index";
import { exportListCsv, wantsCsv } from "@/lib/admin-csv-export";

function previousMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - 1);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

type TargetRow = {
  userId: string;
  name: string;
  role: string;
  teamId: string | null;
  teamName: string | null;
  targetRevenue: number | null;
  targetPotentialCalls: number | null;
  targetPotentialSold: number | null;
  targetExistingCalls: number | null;
  targetExistingSold: number | null;
  minCallsPerDay: number | null;
  minTalkTimeMinPerDay: number | null;
  planTargets?: Record<string, number | null> | null;
};

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const teamFilter = searchParams.get("team_id");

  const rows = (await withTransaction(async (tx) => tx<TargetRow[]>`
    SELECT s.id AS "userId", s.name, s.role::text AS role,
           s.team_id AS "teamId", tm.name AS "teamName",
           t.target_revenue AS "targetRevenue", t.target_potential_calls AS "targetPotentialCalls",
           t.target_potential_sold AS "targetPotentialSold", t.target_existing_calls AS "targetExistingCalls",
           t.target_existing_sold AS "targetExistingSold", t.plan_targets AS "planTargets",
           t.min_calls_per_day AS "minCallsPerDay", t.min_talk_time_min_per_day AS "minTalkTimeMinPerDay"
    FROM staff s
    LEFT JOIN sales.targets t ON t.user_id = s.id AND t.month = ${month}
    LEFT JOIN sales.teams tm ON tm.id = s.team_id
    WHERE s.active = true
      AND s.role::text IN ('sales_rm', 'sales_tl')
      AND (
        ${teamFilter}::text IS NULL
        OR ${teamFilter} = 'all'
        OR (${teamFilter} = 'unassigned' AND s.team_id IS NULL)
        OR s.team_id = ${teamFilter}::uuid
      )
    ORDER BY tm.name NULLS LAST, s.name
  `)) as TargetRow[];

  if (wantsCsv(request)) {
    return exportListCsv(`sales-targets-${month}`, [
      { header: "Month", value: () => month },
      { header: "Team", value: (r) => r.teamName ?? "" },
      { header: "Name", value: (r) => r.name },
      { header: "Role", value: (r) => r.role },
      { header: "Target revenue", value: (r) => r.targetRevenue ?? "" },
      { header: "Potential calls", value: (r) => r.targetPotentialCalls ?? "" },
      { header: "Potential sold", value: (r) => r.targetPotentialSold ?? "" },
      { header: "Existing calls", value: (r) => r.targetExistingCalls ?? "" },
      { header: "Existing sold", value: (r) => r.targetExistingSold ?? "" },
      { header: "Min calls/day", value: (r) => r.minCallsPerDay ?? "" },
      { header: "Min talk mins/day", value: (r) => r.minTalkTimeMinPerDay ?? "" },
    ], rows);
  }

  return NextResponse.json({ data: { month, rows }, error: null });
}

export async function PATCH(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => ({}))) as {
    action?: "copyPreviousMonth" | "setDefaults";
    month?: string;
    fromMonth?: string;
    minCallsPerDay?: number | null;
    minTalkTimeMinPerDay?: number | null;
  };
  const month = body.month ?? new Date().toISOString().slice(0, 7);

  if (body.action === "copyPreviousMonth") {
    const fromMonth = body.fromMonth ?? previousMonth(month);
    const data = await withTransaction(async (tx) => {
      await setAuditActor(tx, auth.session.userId);
      const [summary] = await tx<{ count: number }[]>`
        WITH eligible AS (
          SELECT id
          FROM staff
          WHERE role IN ('sales_rm', 'sales_tl') AND active = true
        ), source_rows AS (
          SELECT
            e.id AS user_id,
            t.target_revenue,
            t.target_potential_calls,
            t.target_potential_sold,
            t.target_existing_calls,
            t.target_existing_sold,
            t.plan_targets,
            t.min_calls_per_day,
            t.min_talk_time_min_per_day
          FROM eligible e
          LEFT JOIN sales.targets t ON t.user_id = e.id AND t.month = ${fromMonth}
        ), upserted AS (
          INSERT INTO sales.targets (
            user_id, month, target_revenue, target_potential_calls, target_potential_sold,
            target_existing_calls, target_existing_sold, plan_targets, min_calls_per_day,
            min_talk_time_min_per_day, set_by
          )
          SELECT
            user_id, ${month}, target_revenue, target_potential_calls, target_potential_sold,
            target_existing_calls, target_existing_sold, plan_targets, min_calls_per_day,
            min_talk_time_min_per_day, ${auth.session.userId}::uuid
          FROM source_rows
          ON CONFLICT (user_id, month)
          DO UPDATE SET
            target_revenue = EXCLUDED.target_revenue,
            target_potential_calls = EXCLUDED.target_potential_calls,
            target_potential_sold = EXCLUDED.target_potential_sold,
            target_existing_calls = EXCLUDED.target_existing_calls,
            target_existing_sold = EXCLUDED.target_existing_sold,
            plan_targets = EXCLUDED.plan_targets,
            min_calls_per_day = EXCLUDED.min_calls_per_day,
            min_talk_time_min_per_day = EXCLUDED.min_talk_time_min_per_day,
            set_by = ${auth.session.userId}::uuid
          RETURNING user_id
        )
        SELECT COUNT(*)::int AS count FROM upserted
      `;
      return { month, fromMonth, affected: summary?.count ?? 0 };
    });
    return NextResponse.json({ data, error: null });
  }

  if (body.action === "setDefaults") {
    const minCallsPerDay = body.minCallsPerDay ?? null;
    const minTalkTimeMinPerDay = body.minTalkTimeMinPerDay ?? null;
    const data = await withTransaction(async (tx) => {
      await setAuditActor(tx, auth.session.userId);
      const [summary] = await tx<{ count: number }[]>`
        WITH eligible AS (
          SELECT id
          FROM staff
          WHERE role IN ('sales_rm', 'sales_tl') AND active = true
        ), upserted AS (
          INSERT INTO sales.targets (user_id, month, min_calls_per_day, min_talk_time_min_per_day, set_by)
          SELECT id, ${month}, ${minCallsPerDay}, ${minTalkTimeMinPerDay}, ${auth.session.userId}::uuid
          FROM eligible
          ON CONFLICT (user_id, month)
          DO UPDATE SET
            min_calls_per_day = EXCLUDED.min_calls_per_day,
            min_talk_time_min_per_day = EXCLUDED.min_talk_time_min_per_day,
            set_by = ${auth.session.userId}::uuid
          RETURNING user_id
        )
        SELECT COUNT(*)::int AS count FROM upserted
      `;
      return { month, affected: summary?.count ?? 0, minCallsPerDay, minTalkTimeMinPerDay };
    });
    return NextResponse.json({ data, error: null });
  }

  return NextResponse.json({ data: null, error: "Unsupported action" }, { status: 400 });
}

export async function POST(request: Request) {
  const auth = await requireRoles(["admin"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => ({}))) as any;
  if (!body.userId || !body.month) return NextResponse.json({ data: null, error: "userId and month required" }, { status: 400 });

  const data = await withTransaction(async (tx) => {
    await setAuditActor(tx, auth.session.userId);
    await tx`
      INSERT INTO sales.targets (
        user_id, month, target_revenue, target_potential_calls, target_potential_sold,
        target_existing_calls, target_existing_sold, plan_targets, min_calls_per_day,
        min_talk_time_min_per_day, set_by
      ) VALUES (
        ${body.userId}::uuid, ${body.month}, ${body.targetRevenue ?? null}, ${body.targetPotentialCalls ?? null}, ${body.targetPotentialSold ?? null},
        ${body.targetExistingCalls ?? null}, ${body.targetExistingSold ?? null}, ${tx.json(body.planTargets ?? null)}, ${body.minCallsPerDay ?? null},
        ${body.minTalkTimeMinPerDay ?? null}, ${auth.session.userId}::uuid
      )
      ON CONFLICT (user_id, month)
      DO UPDATE SET
        target_revenue = COALESCE(EXCLUDED.target_revenue, sales.targets.target_revenue),
        target_potential_calls = COALESCE(EXCLUDED.target_potential_calls, sales.targets.target_potential_calls),
        target_potential_sold = COALESCE(EXCLUDED.target_potential_sold, sales.targets.target_potential_sold),
        target_existing_calls = COALESCE(EXCLUDED.target_existing_calls, sales.targets.target_existing_calls),
        target_existing_sold = COALESCE(EXCLUDED.target_existing_sold, sales.targets.target_existing_sold),
        plan_targets = COALESCE(EXCLUDED.plan_targets, sales.targets.plan_targets),
        min_calls_per_day = COALESCE(EXCLUDED.min_calls_per_day, sales.targets.min_calls_per_day),
        min_talk_time_min_per_day = COALESCE(EXCLUDED.min_talk_time_min_per_day, sales.targets.min_talk_time_min_per_day),
        set_by = ${auth.session.userId}::uuid
      RETURNING *
    `;
    const [row] = await tx`SELECT * FROM sales.targets WHERE user_id = ${body.userId}::uuid AND month = ${body.month}`;
    return row;
  });

  return NextResponse.json({ data, error: null });
}
