import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import {
  fetchAdminMineCompletedTasks,
  fetchAdminTasksOverview,
} from "@/lib/admin-tasks-overview";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const view = new URL(request.url).searchParams.get("view") === "completed"
    ? "completed"
    : "open";

  if (view === "completed") {
    const tasks = await fetchAdminMineCompletedTasks(auth.session.userId);
    const byKind = { crm: 0, team: 0, care: 0, support: 0 };
    for (const t of tasks) byKind[t.kind] += 1;

    return NextResponse.json({
      data: {
        view,
        pending: tasks.length,
        dueToday: 0,
        overdue: 0,
        tasks,
        byKind,
      },
      error: null,
    });
  }

  const rows = await fetchAdminTasksOverview({ staffId: auth.session.userId });
  const mine = rows[0] ?? {
    id: auth.session.userId,
    name: auth.session.name,
    role: auth.session.role,
    pending: 0,
    dueToday: 0,
    overdue: 0,
    tasks: [],
  };

  const byKind = { crm: 0, team: 0, care: 0, support: 0 };
  for (const t of mine.tasks) byKind[t.kind] += 1;

  return NextResponse.json({
    data: {
      view,
      pending: mine.pending,
      dueToday: mine.dueToday,
      overdue: mine.overdue,
      tasks: mine.tasks,
      byKind,
    },
    error: null,
  });
}
