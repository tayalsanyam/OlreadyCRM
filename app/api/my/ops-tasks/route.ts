import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { OPS_TASK_END_RATE_LABELS, type OpsTaskEndRate } from "@/lib/ops-task";

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const view = new URL(request.url).searchParams.get("view") ?? "mine";

  if (view === "assigned") {
    const rows = await sql<
      {
        id: string;
        displayId: string;
        title: string;
        status: string;
        assignedTo: string;
        assigneeName: string;
        muaId: string | null;
        muaName: string | null;
        leadId: string | null;
        brideName: string | null;
        dueAt: string | null;
        endRate: string | null;
        endRateLabel: string | null;
        completedAt: string | null;
        completionOutcome: string | null;
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
        t.mua_id AS "muaId",
        m.name AS "muaName",
        t.lead_id AS "leadId",
        bl.bride_name AS "brideName",
        t.due_at AS "dueAt",
        t.end_rate AS "endRate",
        t.completed_at AS "completedAt",
        t.completion_outcome AS "completionOutcome",
        t.created_at AS "createdAt"
      FROM rm.ops_tasks t
      JOIN staff s ON s.id = t.assigned_to
      LEFT JOIN muas m ON m.id = t.mua_id
      LEFT JOIN bride_leads bl ON bl.id = t.lead_id
      WHERE t.assigned_by = ${auth.session.userId}::uuid
         OR t.created_by = ${auth.session.userId}::uuid
      ORDER BY
        CASE WHEN t.status = 'pending' THEN 0 ELSE 1 END,
        t.completed_at DESC NULLS LAST,
        t.created_at DESC
    `;

    return NextResponse.json({
      data: rows.map((r) => ({
        ...r,
        endRateLabel: r.endRate
          ? OPS_TASK_END_RATE_LABELS[r.endRate as OpsTaskEndRate] ?? r.endRate
          : null,
      })),
      error: null,
    });
  }

  const rows = await sql<
    {
      id: string;
      displayId: string;
      title: string;
      status: string;
      muaName: string | null;
      brideName: string | null;
      leadId: string | null;
      dueAt: string | null;
      assignedByName: string;
      createdAt: string;
    }[]
  >`
    SELECT
      t.id,
      t.display_id AS "displayId",
      t.title,
      t.status::text AS status,
      m.name AS "muaName",
      bl.bride_name AS "brideName",
      t.lead_id AS "leadId",
      t.due_at AS "dueAt",
      ab.name AS "assignedByName",
      t.created_at AS "createdAt"
    FROM rm.ops_tasks t
    JOIN staff ab ON ab.id = t.assigned_by
    LEFT JOIN muas m ON m.id = t.mua_id
    LEFT JOIN bride_leads bl ON bl.id = t.lead_id
    WHERE t.assigned_to = ${auth.session.userId}::uuid
      AND t.status = 'pending'
    ORDER BY
      CASE WHEN t.due_at IS NOT NULL AND t.due_at < NOW() THEN 0 ELSE 1 END,
      t.due_at NULLS LAST,
      t.created_at DESC
  `;

  return NextResponse.json({ data: rows, error: null });
}
