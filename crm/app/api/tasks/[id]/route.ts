import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBdmsForTeam } from "@/lib/teams";
import { getTasks, updateTask } from "@/lib/tasks";

async function canAccessTask(
  session: { user?: { role: string; assigned_bdm?: string; team_id?: string } },
  taskAssignee: string
): Promise<boolean> {
  if (!session.user) return false;
  if (session.user.role === "admin") return true;
  if (session.user.role === "bdm") return session.user.assigned_bdm === taskAssignee;
  if (session.user.role === "team_leader" && session.user.team_id) {
    const bdms = await getBdmsForTeam(session.user.team_id);
    return bdms.includes(taskAssignee);
  }
  return false;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const tasks = await getTasks();
  const task = tasks.find((t) => t.id === id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ok = await canAccessTask(session, task.assignee);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json();
  const updated = await updateTask(id, { done: body.done, title: body.title, due: body.due });
  return NextResponse.json(updated);
}
