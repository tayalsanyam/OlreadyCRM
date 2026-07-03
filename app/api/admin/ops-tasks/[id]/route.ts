import { NextResponse } from "next/server";
import { sql, withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { completeOpsTask, createOpsTask, OPS_TASK_END_RATE_LABELS } from "@/lib/ops-task";
import type { OpsTaskEndRate } from "@/lib/ops-task";

async function loadDetail(id: string) {
  const [task] = await sql<
    {
      id: string;
      displayId: string;
      title: string;
      description: string | null;
      status: string;
      assignedTo: string;
      assigneeName: string;
      assignedByName: string;
      muaId: string | null;
      muaName: string | null;
      muaDisplayId: string | null;
      leadId: string | null;
      brideName: string | null;
      brideDisplayId: string | null;
      dueAt: string | null;
      completionNotes: string | null;
      completionOutcome: string | null;
      endRate: string | null;
      completedAt: string | null;
      completedByName: string | null;
      parentTaskId: string | null;
      parentDisplayId: string | null;
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
      s.name AS "assigneeName",
      ab.name AS "assignedByName",
      t.mua_id AS "muaId",
      m.name AS "muaName",
      m.display_id AS "muaDisplayId",
      t.lead_id AS "leadId",
      bl.bride_name AS "brideName",
      bl.display_id AS "brideDisplayId",
      t.due_at AS "dueAt",
      t.completion_notes AS "completionNotes",
      t.completion_outcome AS "completionOutcome",
      t.end_rate AS "endRate",
      t.completed_at AS "completedAt",
      cb.name AS "completedByName",
      t.parent_task_id AS "parentTaskId",
      pt.display_id AS "parentDisplayId",
      t.created_at AS "createdAt"
    FROM rm.ops_tasks t
    JOIN staff s ON s.id = t.assigned_to
    JOIN staff ab ON ab.id = t.assigned_by
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    LEFT JOIN staff cb ON cb.id = t.completed_by
    LEFT JOIN rm.ops_tasks pt ON pt.id = t.parent_task_id
    WHERE t.id = ${id}::uuid
  `;

  if (!task) return null;

  const followUps = await sql<
    {
      id: string;
      displayId: string;
      status: string;
      assigneeName: string;
      dueAt: string | null;
      endRate: string | null;
      createdAt: string;
    }[]
  >`
    SELECT
      f.id,
      f.display_id AS "displayId",
      f.status::text AS status,
      s.name AS "assigneeName",
      f.due_at AS "dueAt",
      f.end_rate AS "endRate",
      f.created_at AS "createdAt"
    FROM rm.ops_tasks f
    JOIN staff s ON s.id = f.assigned_to
    WHERE f.parent_task_id = ${id}::uuid
    ORDER BY f.created_at ASC
  `;

  return {
    ...task,
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
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const detail = await loadDetail(id);
  if (!detail) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: detail, error: null });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: "assign" | "complete" | "followUp" | "close";
    assignedTo?: string;
    dueAt?: string | null;
    summary?: string;
    outcome?: string;
    endRate?: OpsTaskEndRate;
    nextFollowUpAt?: string;
    followUpAssignedTo?: string;
    followUpTitle?: string;
    followUpDueAt?: string;
  };

  const [existing] = await sql<{ status: string; assignedTo: string }[]>`
    SELECT status::text AS status, assigned_to AS "assignedTo"
    FROM rm.ops_tasks WHERE id = ${id}::uuid
  `;
  if (!existing) {
    return NextResponse.json({ data: null, error: "Not found" }, { status: 404 });
  }

  try {
    const result = await withTransaction(async (tx) => {
      if (body.action === "assign" || body.assignedTo) {
        if (!body.assignedTo) {
          return { error: "assignedTo is required", status: 400 };
        }
        await tx`
          UPDATE rm.ops_tasks
          SET
            assigned_to = ${body.assignedTo}::uuid,
            assigned_by = ${auth.session.userId}::uuid,
            due_at = COALESCE(${body.dueAt ?? null}, due_at),
            updated_at = NOW()
          WHERE id = ${id}::uuid
        `;
        await tx`
          INSERT INTO notifications (staff_id, message, link)
          VALUES (
            ${body.assignedTo}::uuid,
            ${`Task reassigned to you`},
            ${`/tasks/ops/${id}`}
          )
        `;
        return { data: { ok: true } };
      }

      if (body.action === "complete") {
        if (!body.summary?.trim()) {
          return { error: "Summary is required", status: 400 };
        }
        if (existing.status === "done") {
          return { error: "Already completed", status: 400 };
        }
        const completed = await completeOpsTask(tx, {
          taskId: id,
          completedBy: auth.session.userId,
          summary: body.summary,
          outcome: body.outcome,
          endRate: body.endRate,
          nextFollowUpAt: body.nextFollowUpAt,
          followUpAssignedTo: body.followUpAssignedTo,
        });
        if (!completed) return { error: "Not found", status: 404 };
        return { data: completed };
      }

      if (body.action === "followUp") {
        const [parent] = await tx<
          {
            title: string;
            muaId: string | null;
            leadId: string | null;
            assignedTo: string;
          }[]
        >`
          SELECT title, mua_id AS "muaId", lead_id AS "leadId", assigned_to AS "assignedTo"
          FROM rm.ops_tasks WHERE id = ${id}::uuid
        `;
        if (!parent) return { error: "Not found", status: 404 };

        const followUp = await createOpsTask(tx, {
          title: body.followUpTitle?.trim() || `Follow-up — ${parent.title}`,
          description: body.summary,
          assignedTo: body.followUpAssignedTo ?? body.assignedTo ?? parent.assignedTo,
          assignedBy: auth.session.userId,
          muaId: parent.muaId,
          leadId: parent.leadId,
          dueAt: body.followUpDueAt ?? body.dueAt,
          parentTaskId: id,
        });
        return { data: followUp };
      }

      if (body.action === "close") {
        await tx`
          UPDATE rm.ops_tasks
          SET status = 'cancelled'::rm.task_status, updated_at = NOW()
          WHERE id = ${id}::uuid
        `;
        return { data: { ok: true } };
      }

      return { error: "Unknown action", status: 400 };
    });

    if ("error" in result && result.error) {
      return NextResponse.json(
        { data: null, error: result.error },
        { status: result.status ?? 400 },
      );
    }

    const detail = await loadDetail(id);
    return NextResponse.json({ data: { ...(result.data ?? {}), detail }, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
