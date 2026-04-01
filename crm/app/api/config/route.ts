import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAdmin } from "@/lib/auth";
import {
  getBDMs,
  getBDMTargets,
  getPlans,
  saveBDMs,
  saveBDMTargets,
  savePlans,
  getOpsCoordinators,
  saveOpsCoordinators,
} from "@/lib/config";
import { getTeams, saveTeams } from "@/lib/teams";

export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [bdms, targets, plans, teams, opsCoordinators] = await Promise.all([
    getBDMs(),
    getBDMTargets(),
    getPlans(),
    getTeams(),
    getOpsCoordinators(),
  ]);
  return NextResponse.json({ bdms, targets, plans, teams, ops_coordinators: opsCoordinators });
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!requireAdmin(session)) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const body = await request.json();
  if (body.bdms) await saveBDMs(body.bdms);
  if (body.targets) await saveBDMTargets(body.targets);
  if (body.plans) await savePlans(body.plans);
  if (body.teams) await saveTeams(body.teams);
  if (body.ops_coordinators) await saveOpsCoordinators(body.ops_coordinators);
  return NextResponse.json({ ok: true });
}
