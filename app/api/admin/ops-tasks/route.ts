import { NextResponse } from "next/server";
import { sql, withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { createOpsTask } from "@/lib/ops-task";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const params = new URL(request.url).searchParams;
  const scope = params.get("scope") ?? "open";
  const openOnly = scope === "open";
  const assignedTo = params.get("assignedTo");
  const assignedBy = params.get("assignedBy");
  const due = params.get("due");

  const rows = await sql<
    {
      id: string;
      displayId: string;
      title: string;
      status: string;
      assignedTo: string;
      assigneeName: string;
      assignedBy: string;
      assignedByName: string;
      muaName: string | null;
      brideName: string | null;
      dueAt: string | null;
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
      t.status::text AS status,
      t.assigned_to AS "assignedTo",
      s.name AS "assigneeName",
      t.assigned_by AS "assignedBy",
      ab.name AS "assignedByName",
      m.name AS "muaName",
      bl.bride_name AS "brideName",
      t.due_at AS "dueAt",
      t.end_rate AS "endRate",
      t.completed_at AS "completedAt",
      cb.name AS "completedByName",
      t.created_at AS "createdAt"
    FROM rm.ops_tasks t
    JOIN staff s ON s.id = t.assigned_to
    JOIN staff ab ON ab.id = t.assigned_by
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    LEFT JOIN staff cb ON cb.id = t.completed_by
    WHERE (${openOnly} = false OR t.status = 'pending')
      AND (${assignedTo}::uuid IS NULL OR t.assigned_to = ${assignedTo}::uuid)
      AND (${assignedBy}::uuid IS NULL OR t.assigned_by = ${assignedBy}::uuid)
      AND (
        ${due}::text IS NULL
        OR (${due} = 'overdue' AND t.due_at IS NOT NULL AND t.due_at::date < CURRENT_DATE)
        OR (${due} = 'today' AND t.due_at IS NOT NULL AND t.due_at::date = CURRENT_DATE)
        OR (${due} = 'upcoming' AND t.due_at IS NOT NULL AND t.due_at::date > CURRENT_DATE)
        OR (${due} = 'no_date' AND t.due_at IS NULL)
      )
    ORDER BY
      CASE WHEN t.status = 'pending' THEN 0 ELSE 1 END,
      CASE WHEN t.due_at IS NOT NULL AND t.due_at < NOW() THEN 0 ELSE 1 END,
      t.due_at NULLS LAST,
      t.created_at DESC
  `;

  return NextResponse.json({ data: rows, error: null });
}

export async function POST(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
    assignedTo?: string;
    muaId?: string | null;
    leadId?: string | null;
    dueAt?: string | null;
    parentTaskId?: string | null;
  };

  if (!body.title?.trim() || !body.assignedTo) {
    return NextResponse.json(
      { data: null, error: "title and assignedTo are required" },
      { status: 400 },
    );
  }

  try {
    const data = await withTransaction(async (tx) =>
      createOpsTask(tx, {
        title: body.title!,
        description: body.description,
        assignedTo: body.assignedTo!,
        assignedBy: auth.session.userId,
        muaId: body.muaId,
        leadId: body.leadId,
        dueAt: body.dueAt,
        parentTaskId: body.parentTaskId,
      }),
    );
    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create task";
    return NextResponse.json({ data: null, error: message }, { status: 400 });
  }
}
