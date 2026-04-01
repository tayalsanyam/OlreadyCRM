import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBdmsForTeam } from "@/lib/teams";
import { getTasks, createTask } from "@/lib/tasks";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const done = searchParams.get("done");
  const assignee = searchParams.get("assignee");
  const leadId = searchParams.get("lead_id");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const filters: { done?: boolean; assignee?: string; assignees?: string[]; lead_id?: string } = {};
  if (done !== undefined && done !== "") filters.done = done === "true";
  if (leadId) filters.lead_id = leadId;
  if (session.user.role === "bdm" && session.user.assigned_bdm) {
    filters.assignee = session.user.assigned_bdm;
  } else if (session.user.role === "team_leader" && session.user.team_id) {
    filters.assignees = await getBdmsForTeam(session.user.team_id);
  }
  if (assignee) filters.assignee = assignee;

  let tasks = await getTasks(filters);
  if (dateFrom || dateTo) {
    const from = dateFrom ?? "0000-01-01";
    const to = dateTo ?? "9999-12-31";
    tasks = tasks.filter((t) => t.due && t.due >= from && t.due <= to);
  }
  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const task = await createTask({
    title: body.title ?? "",
    due: body.due ?? "",
    assignee: body.assignee ?? "",
    done: false,
    lead_id: body.lead_id,
    renewal_deal_id: body.renewal_deal_id,
  });
  return NextResponse.json(task);
}
