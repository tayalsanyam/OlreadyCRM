import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBdmsForTeam } from "@/lib/teams";
import { bulkUpdateLeads, getLeadById } from "@/lib/leads";
import { addActivity } from "@/lib/activity";

function canAccessLead(
  session: { user?: { role: string; assigned_bdm?: string; team_id?: string } },
  leadBdm: string
): boolean {
  if (!session.user) return false;
  if (session.user.role === "admin") return true;
  if (session.user.role === "bdm") return session.user.assigned_bdm === leadBdm;
  return false;
}

async function canAccessLeadIds(
  session: { user?: { role: string; assigned_bdm?: string; team_id?: string } },
  ids: string[]
): Promise<string[]> {
  if (session.user?.role === "admin") return ids;
  if (session.user?.role === "team_leader" && session.user.team_id) {
    const teamBdms = await getBdmsForTeam(session.user.team_id);
    const allowed: string[] = [];
    for (const id of ids) {
      const lead = await getLeadById(id);
      if (lead && teamBdms.includes(lead.bdm)) allowed.push(id);
    }
    return allowed;
  }
  const allowed: string[] = [];
  for (const id of ids) {
    const lead = await getLeadById(id);
    if (lead && canAccessLead(session, lead.bdm)) allowed.push(id);
  }
  return allowed;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  const action = body.action as string;

  if (ids.length === 0) return NextResponse.json({ error: "No leads selected" }, { status: 400 });
  if (!["inactive", "active", "reassign"].includes(action))
    return NextResponse.json({ error: "Invalid action. Use 'inactive', 'active' or 'reassign'" }, { status: 400 });

  const allowedIds = await canAccessLeadIds(session, ids);
  if (allowedIds.length === 0) return NextResponse.json({ error: "No access to selected leads" }, { status: 403 });

  if (action === "inactive") {
    const count = await bulkUpdateLeads(allowedIds, { active: false });
    for (const id of allowedIds) {
      await addActivity(id, "Updated", session.user!.username, "Marked inactive (bulk)");
    }
    return NextResponse.json({ updated: count });
  }

  if (action === "active") {
    const count = await bulkUpdateLeads(allowedIds, { active: true });
    for (const id of allowedIds) {
      await addActivity(id, "Updated", session.user!.username, "Marked active (bulk)");
    }
    return NextResponse.json({ updated: count });
  }

  if (action === "reassign") {
    const newBdm = (body.bdm as string)?.trim();
    if (!newBdm) return NextResponse.json({ error: "BDM required for reassign" }, { status: 400 });
    const count = await bulkUpdateLeads(allowedIds, { bdm: newBdm });
    for (const id of allowedIds) {
      await addActivity(id, "Updated", session.user!.username, `Reassigned to ${newBdm} (bulk)`);
    }
    return NextResponse.json({ updated: count });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
