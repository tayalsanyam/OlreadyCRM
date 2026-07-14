import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import {
  fetchBackendTeamTaskStats,
  fetchBackendTeamTasks,
} from "@/lib/backend-team-tasks-query";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const staffId = searchParams.get("staffId");
  const role = searchParams.get("role") as "regional_rm" | "commission_rm" | null;
  const region = searchParams.get("region");
  const taskType = searchParams.get("taskType");
  const due = searchParams.get("due") as
    | "all"
    | "overdue"
    | "today"
    | "upcoming"
    | null;
  const status = (searchParams.get("status") as "pending" | "done" | null) ?? "pending";
  const search = searchParams.get("search");

  if (USE_MOCK) {
    return NextResponse.json({
      data: mockStore.getBackendTeamTasks({
        staffId,
        role,
        region,
        taskType,
        due,
        status,
        search,
      }),
      error: null,
    });
  }

  const [stats, tasks] = await Promise.all([
    fetchBackendTeamTaskStats(),
    fetchBackendTeamTasks({
      staffId,
      role,
      region,
      taskType,
      due: due ?? "all",
      status,
      search,
    }),
  ]);

  return NextResponse.json({ data: { stats, tasks }, error: null });
}
