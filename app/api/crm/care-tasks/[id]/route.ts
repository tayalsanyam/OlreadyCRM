import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { fromDbRole } from "@/lib/db-mappers";
import { isAdminRole } from "@/lib/ticket-admin-watch";

const ASSIGNED_ROLE_MAP: Record<string, string> = {
  regionalRm: "regional_rm",
  commissionRm: "commission_rm",
  feedbackRm: "feedback_rm",
  careAgent: "care_agent",
  salesRm: "sales_rm",
  salesTl: "sales_tl",
  salesActivation: "sales_activation",
  admin: "admin",
  owner: "owner",
  leadUploader: "lead_uploader",
};

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  if (!isAdminRole(auth.session.role) && auth.session.role !== "careAgent") {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    assignedTo?: string | null;
    dueAt?: string | null;
  };

  if (body.assignedTo === undefined) {
    return NextResponse.json({ data: null, error: "assignedTo is required" }, { status: 400 });
  }

  const result = await withTransaction(async (tx) => {
    const [task] = await tx<
      { id: string; ticketId: string; title: string; displayId: string; status: string }[]
    >`
      SELECT id, ticket_id AS "ticketId", title, display_id AS "displayId", status::text AS status
      FROM support.ticket_tasks
      WHERE id = ${id}::uuid
    `;
    if (!task) return { error: "Task not found", status: 404 };
    if (task.status === "done" || task.status === "cancelled") {
      return { error: "Cannot reassign a closed task", status: 400 };
    }

    let assignedRole: string | null = null;
    if (body.assignedTo) {
      const [staff] = await tx<{ role: string }[]>`
        SELECT role::text AS role FROM staff WHERE id = ${body.assignedTo}::uuid AND active = true
      `;
      if (!staff) return { error: "Staff not found", status: 404 };
      const appRole = fromDbRole(staff.role);
      assignedRole = ASSIGNED_ROLE_MAP[appRole] ?? staff.role;
    }

    await tx`
      UPDATE support.ticket_tasks
      SET
        assigned_to = ${body.assignedTo}::uuid,
        assigned_role = ${assignedRole}::rm.user_role,
        due_at = COALESCE(${body.dueAt ?? null}, due_at),
        status = CASE
          WHEN ${body.assignedTo ?? null}::uuid IS NOT NULL AND status = 'pending' THEN 'in_progress'::support.care_task_status
          ELSE status
        END,
        updated_at = NOW()
      WHERE id = ${id}::uuid
    `;

    if (body.assignedTo) {
      const link = `/tasks/care/${id}`;
      await tx`
        INSERT INTO notifications (staff_id, message, link)
        VALUES (
          ${body.assignedTo}::uuid,
          ${`Care task ${task.displayId} assigned to you: ${task.title}`},
          ${link}
        )
      `;
    }

    return { data: { ok: true } };
  });

  if ("error" in result && result.error) {
    return NextResponse.json(
      { data: null, error: result.error },
      { status: result.status ?? 400 },
    );
  }

  return NextResponse.json({ data: result.data, error: null });
}
