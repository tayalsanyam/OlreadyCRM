import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { withTransaction } from "@/db/index";
import { completeChat } from "@/lib/ai-openai";
import { hasOpenAiKey } from "@/lib/ai-config";

async function scopedUserIds(tx: any, session: { userId: string; role: string }) {
  if (session.role === "salesRm") return [session.userId];
  if (session.role === "salesTl") {
    const [team] = await tx<{ teamId: string | null }[]>`SELECT team_id AS "teamId" FROM staff WHERE id = ${session.userId}::uuid`;
    if (!team?.teamId) return [session.userId];
    const members = await tx<{ id: string }[]>`SELECT id FROM staff WHERE team_id = ${team.teamId}::uuid AND active = true`;
    return members.map((m: { id: string }) => m.id);
  }
  return null;
}

export async function POST() {
  const auth = await requireRoles(["salesRm", "salesTl", "admin", "owner"]);
  if ("error" in auth) return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });

  const plan = await withTransaction(async (tx) => {
    const scopedIds = await scopedUserIds(tx, auth.session);
    if (scopedIds !== null && scopedIds.length === 0) {
      return {
        todayTasks: 0,
        overdueTasks: 0,
        stalePipelines: [],
        dueTodayPipelines: [],
      };
    }
    const staffFilter = scopedIds === null ? tx`TRUE` : tx`t.staff_id IN ${tx(scopedIds.map((id: string) => tx`${id}::uuid`))}`;
    const pipelineStaffFilter = scopedIds === null ? tx`TRUE` : tx`p.assigned_to IN ${tx(scopedIds.map((id: string) => tx`${id}::uuid`))}`;

    const [taskStats] = await tx<{ todayTasks: number; overdueTasks: number }[]>`
      SELECT
        COUNT(*) FILTER (WHERE t.due_date = CURRENT_DATE)::int AS "todayTasks",
        COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE)::int AS "overdueTasks"
      FROM rm_tasks t
      WHERE t.status = 'pending'
        AND t.task_type IN ('sales_follow_up', 'sales_senior_call')
        AND ${staffFilter}
    `;
    const stalePipelines = await tx`
      SELECT p.id, m.name AS "muaName", p.stage, DATE_PART('day', NOW() - p.updated_at)::int AS "daysInStage"
      FROM sales.pipeline p
      JOIN muas m ON m.id = p.mua_id
      WHERE p.status = 'active'
        AND DATE_PART('day', NOW() - p.updated_at) >= 3
        AND ${pipelineStaffFilter}
      ORDER BY p.updated_at ASC
      LIMIT 8
    `;
    const stageBreakdown = await tx`
      SELECT
        p.stage,
        p.mua_type AS "muaType",
        COUNT(*)::int AS count,
        COUNT(*) FILTER (WHERE DATE_PART('day', NOW() - p.updated_at) >= 3)::int AS "unmovedCount",
        COUNT(*) FILTER (
          WHERE DATE_PART(
            'day',
            NOW() - COALESCE((SELECT MAX(created_at) FROM sales.comms_log cl WHERE cl.pipeline_id = p.id), p.created_at)
          ) >= 3
        )::int AS "notContactedCount"
      FROM sales.pipeline p
      WHERE p.status = 'active'
        AND ${pipelineStaffFilter}
      GROUP BY p.stage, p.mua_type
      ORDER BY p.stage
    `;
    const topPotential = await tx`
      SELECT
        p.id,
        m.name AS "muaName",
        p.stage,
        DATE_PART('day', NOW() - p.updated_at)::int AS "daysInStage",
        DATE_PART(
          'day',
          NOW() - COALESCE((SELECT MAX(created_at) FROM sales.comms_log cl WHERE cl.pipeline_id = p.id), p.created_at)
        )::int AS "daysSinceLastContact"
      FROM sales.pipeline p
      JOIN muas m ON m.id = p.mua_id
      WHERE p.status = 'active'
        AND p.mua_type = 'candidate'
        AND ${pipelineStaffFilter}
      ORDER BY p.updated_at ASC
      LIMIT 8
    `;
    const topExisting = await tx`
      SELECT
        p.id,
        m.name AS "muaName",
        p.stage,
        DATE_PART('day', NOW() - p.updated_at)::int AS "daysInStage",
        DATE_PART(
          'day',
          NOW() - COALESCE((SELECT MAX(created_at) FROM sales.comms_log cl WHERE cl.pipeline_id = p.id), p.created_at)
        )::int AS "daysSinceLastContact"
      FROM sales.pipeline p
      JOIN muas m ON m.id = p.mua_id
      WHERE p.status = 'active'
        AND p.mua_type IN ('re_engage', 'renewal')
        AND ${pipelineStaffFilter}
      ORDER BY p.updated_at ASC
      LIMIT 8
    `;
    const [segmentSummary] = await tx<{
      potentialTotal: number;
      existingTotal: number;
      potentialStale: number;
      existingStale: number;
    }[]>`
      SELECT
        COUNT(*) FILTER (WHERE p.mua_type = 'candidate')::int AS "potentialTotal",
        COUNT(*) FILTER (WHERE p.mua_type IN ('re_engage', 'renewal'))::int AS "existingTotal",
        COUNT(*) FILTER (WHERE p.mua_type = 'candidate' AND DATE_PART('day', NOW() - p.updated_at) >= 3)::int AS "potentialStale",
        COUNT(*) FILTER (WHERE p.mua_type IN ('re_engage', 'renewal') AND DATE_PART('day', NOW() - p.updated_at) >= 3)::int AS "existingStale"
      FROM sales.pipeline p
      WHERE p.status = 'active'
        AND ${pipelineStaffFilter}
    `;
    const dueTodayPipelines = await tx`
      SELECT t.title, t.due_date AS "dueDate"
      FROM rm_tasks t
      WHERE t.status = 'pending'
        AND t.task_type IN ('sales_follow_up', 'sales_senior_call')
        AND t.due_date = CURRENT_DATE
        AND ${staffFilter}
      ORDER BY t.created_at ASC
      LIMIT 12
    `;
    return {
      todayTasks: taskStats?.todayTasks ?? 0,
      overdueTasks: taskStats?.overdueTasks ?? 0,
      segmentSummary: segmentSummary ?? {
        potentialTotal: 0,
        existingTotal: 0,
        potentialStale: 0,
        existingStale: 0,
      },
      stageBreakdown,
      stalePipelines,
      topPotential,
      topExisting,
      dueTodayPipelines,
    };
  });

  const prompt = [
    "You are Olready Sales daily planner with strict data grounding.",
    "Use ONLY the provided DB context. Do not give generic advice.",
    "Mandatory: clearly differentiate Potential (candidate) vs Existing No Plan (re_engage).",
    "Mandatory output format:",
    "1) Snapshot (numbers only)",
    "2) Potential Plan (top targets + action for each)",
    "3) Existing No Plan Plan (top targets + action for each)",
    "4) Hour-by-hour plan for today",
    "5) Risk alerts (what slips if not done today)",
    "Each target action must reference stage and whether it's unmoved/not contacted risk.",
    `Context: ${JSON.stringify(plan)}`,
  ].join("\n");

  let reply = "";

  if (!hasOpenAiKey()) {
    reply = `Top Priorities:\n1) Complete ${plan.overdueTasks} overdue follow-ups.\n2) Execute ${plan.todayTasks} due-today tasks.\n3) Address stale pipelines first.\n\nHour-by-hour:\n- 10:00-12:00 overdue follow-ups\n- 12:00-14:00 due-today calls\n- 15:00-17:00 stale stage movement\n\nRisks if delayed: Conversion drops, stage pile-up, missed callbacks.`;
  } else {
    try {
      reply = await completeChat([{ role: "system", content: prompt }], {
        temperature: 0.3,
        maxTokens: 1400,
      });
    } catch {
      reply = `Could not generate AI plan right now. Use this fallback:\n1) Close overdue (${plan.overdueTasks})\n2) Complete due today (${plan.todayTasks})\n3) Move stale pipelines (${plan.stalePipelines.length}).`;
    }
  }

  return NextResponse.json({ data: { plan, reply }, error: null });
}

