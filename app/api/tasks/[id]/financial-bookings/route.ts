import { NextResponse } from "next/server";
import { sql, withTransaction } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { canAccessLead, getLeadForAccess } from "@/lib/lead-access";
import { loadFinancialBookingsForTask } from "@/lib/task-financial-bookings";
import { isFinancialFollowUpTask } from "@/lib/task-utils";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  if (USE_MOCK) {
    const bookings = mockStore.getFinancialBookingsForTask(id, auth.session.userId);
    return NextResponse.json({ data: { bookings }, error: null });
  }

  const [task] = await sql<
    { id: string; staffId: string; leadId: string | null; title: string; taskType: string }[]
  >`
    SELECT id, staff_id AS "staffId", lead_id AS "leadId", title, task_type AS "taskType"
    FROM rm_tasks
    WHERE id = ${id}::uuid AND staff_id = ${auth.session.userId}::uuid
  `;
  if (!task) {
    return NextResponse.json({ data: null, error: "Task not found" }, { status: 404 });
  }
  if (!isFinancialFollowUpTask({ taskType: task.taskType, title: task.title })) {
    return NextResponse.json({ data: null, error: "Not a payment follow-up task" }, { status: 400 });
  }
  if (!task.leadId) {
    return NextResponse.json({ data: { bookings: [] }, error: null });
  }

  const accessRow = await getLeadForAccess(task.leadId);
  if (!accessRow || !canAccessLead(auth.session, accessRow)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const bookings = await withTransaction((tx) =>
    loadFinancialBookingsForTask(tx, task)
  );

  return NextResponse.json({ data: { bookings }, error: null });
}
