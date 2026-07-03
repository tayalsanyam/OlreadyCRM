import { NextResponse } from "next/server";
import { sql, withTransaction } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { getOpsTaskAccess } from "@/lib/ops-task-access";
import {
  completeOpsTask,
  OPS_TASK_END_RATE_LABELS,
  type OpsTaskEndRate,
} from "@/lib/ops-task";

async function fetchTaskDetail(taskId: string, userId: string, role: string) {
  const access = await withTransaction((tx) =>
    getOpsTaskAccess(tx, taskId, userId, role as never),
  );
  if (!access) return null;

  const [task] = await sql<
    {
      id: string;
      displayId: string;
      title: string;
      description: string | null;
      status: string;
      assignedTo: string;
      muaId: string | null;
      muaName: string | null;
      muaDisplayId: string | null;
      leadId: string | null;
      brideName: string | null;
      brideDisplayId: string | null;
      dueAt: string | null;
      assignedByName: string;
      assigneeName: string;
      completionNotes: string | null;
      completionOutcome: string | null;
      endRate: string | null;
      completedAt: string | null;
      completedByName: string | null;
      createdAt: string;
    }[]
  >`
    SELECT
      t.id,
      t.display_id AS "displayId",
      t.title,
      t.description,
      t.status::text AS status,
      t.assigned_to AS "assignedTo",
      t.mua_id AS "muaId",
      m.name AS "muaName",
      m.display_id AS "muaDisplayId",
      t.lead_id AS "leadId",
      bl.bride_name AS "brideName",
      bl.display_id AS "brideDisplayId",
      t.due_at AS "dueAt",
      ab.name AS "assignedByName",
      s.name AS "assigneeName",
      t.completion_notes AS "completionNotes",
      t.completion_outcome AS "completionOutcome",
      t.end_rate AS "endRate",
      t.completed_at AS "completedAt",
      cb.name AS "completedByName",
      t.created_at AS "createdAt"
    FROM rm.ops_tasks t
    JOIN staff s ON s.id = t.assigned_to
    JOIN staff ab ON ab.id = t.assigned_by
    LEFT JOIN staff cb ON cb.id = t.completed_by
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    WHERE t.id = ${taskId}::uuid
  `;

  if (!task) return null;

  const followUps = await sql<
    {
      id: string;
      displayId: string;
      status: string;
      assigneeName: string;
      dueAt: string | null;
      createdAt: string;
    }[]
  >`
    SELECT
      f.id,
      f.display_id AS "displayId",
      f.status::text AS status,
      s.name AS "assigneeName",
      f.due_at AS "dueAt",
      f.created_at AS "createdAt"
    FROM rm.ops_tasks f
    JOIN staff s ON s.id = f.assigned_to
    WHERE f.parent_task_id = ${taskId}::uuid
    ORDER BY f.created_at ASC
  `;

  return {
    ...task,
    access,
    canComplete:
      (access === "assignee" || access === "admin") && task.status === "pending",
    canCreateFollowUp:
      access === "assigner" || access === "admin",
    endRateLabel: task.endRate
      ? OPS_TASK_END_RATE_LABELS[task.endRate as OpsTaskEndRate] ?? task.endRate
      : null,
    followUps,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const task = await fetchTaskDetail(id, auth.session.userId, auth.session.role);

  if (!task) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: task, error: null });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    summary?: string;
    outcome?: string;
    endRate?: OpsTaskEndRate;
    nextFollowUpAt?: string;
  };

  if (!body.summary?.trim()) {
    return NextResponse.json({ data: null, error: "Summary is required" }, { status: 400 });
  }

  const result = await withTransaction(async (tx) => {
    const access = await getOpsTaskAccess(tx, id, auth.session.userId, auth.session.role);
    if (access !== "assignee" && access !== "admin") {
      return { error: "Only the assignee can complete this task", status: 403 };
    }

    const [row] = await tx<{ status: string }[]>`
      SELECT status::text AS status
      FROM rm.ops_tasks
      WHERE id = ${id}::uuid
    `;
    if (!row) return { error: "Not found", status: 404 };
    if (row.status === "done") return { error: "Already completed", status: 400 };

    const completed = await completeOpsTask(tx, {
      taskId: id,
      completedBy: auth.session.userId,
      summary: body.summary!,
      outcome: body.outcome,
      endRate: body.endRate,
      nextFollowUpAt: body.nextFollowUpAt,
      followUpAssignedTo: auth.session.userId,
    });
    if (!completed) return { error: "Not found", status: 404 };
    return { data: completed };
  });

  if ("error" in result && result.error) {
    return NextResponse.json(
      { data: null, error: result.error },
      { status: result.status ?? 400 },
    );
  }

  return NextResponse.json({ data: result.data, error: null });
}
