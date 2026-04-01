import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBdmsForTeam } from "@/lib/teams";
import { getLeads } from "@/lib/leads";
import { getActivityLog } from "@/lib/activity";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const bdmParam = searchParams.get("bdm");
  const typeParam = searchParams.get("type");
  const filters: { dateFrom?: string; dateTo?: string } = {};
  if (dateFrom) filters.dateFrom = dateFrom;
  if (dateTo) filters.dateTo = dateTo;

  let logs = await getActivityLog(Object.keys(filters).length ? filters : undefined);
  if (bdmParam) {
    const leads = await getLeads({ bdm: bdmParam });
    const leadIds = new Set(leads.map((l) => l.id));
    logs = logs.filter((l) => leadIds.has(l.lead_id));
  }
  if (typeParam) {
    const typeMap: Record<string, string[]> = {
      Call: ["Call", "call"],
      Note: ["Created"],
      "Status change": ["Updated"],
      Payment: ["Payment recorded"],
    };
    const actions = typeMap[typeParam];
    if (actions) logs = logs.filter((l) => actions.some((a) => l.action?.includes(a) || l.action === a));
  }
  if (session.user.role === "bdm" && session.user.assigned_bdm) {
    const leads = await getLeads({ bdm: session.user.assigned_bdm });
    const leadIds = new Set(leads.map((l) => l.id));
    const filtered = logs.filter((l) => leadIds.has(l.lead_id));
    return NextResponse.json(filtered);
  }
  if (session.user.role === "team_leader" && session.user.team_id) {
    const bdms = await getBdmsForTeam(session.user.team_id);
    const leads = await getLeads({ teamBdms: bdms });
    const leadIds = new Set(leads.map((l) => l.id));
    const filtered = logs.filter((l) => leadIds.has(l.lead_id));
    return NextResponse.json(filtered);
  }
  return NextResponse.json(logs);
}
