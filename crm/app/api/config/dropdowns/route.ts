import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBDMs, getPlans, getOpsCoordinators } from "@/lib/config";
import { getTeams } from "@/lib/teams";

export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [bdms, plans, teams, opsCoordinators] = await Promise.all([
    getBDMs(),
    getPlans(),
    getTeams(),
    getOpsCoordinators(),
  ]);
  const teamIds = Array.from(new Set(teams.map((t) => t.team_id)));
  return NextResponse.json({ bdms, plans, teamIds, ops_coordinators: opsCoordinators });
}
