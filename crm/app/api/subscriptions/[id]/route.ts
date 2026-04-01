import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBdmsForTeam } from "@/lib/teams";
import { getLeadById } from "@/lib/leads";
import { getSubscriptionById, updateSubscription } from "@/lib/subscriptions";

async function canAccessLead(
  session: { user?: { role: string; assigned_bdm?: string; team_id?: string } },
  leadBdm: string
): Promise<boolean> {
  if (!session.user) return false;
  if (session.user.role === "admin") return true;
  if (session.user.role === "bdm") return session.user.assigned_bdm === leadBdm;
  if (session.user.role === "team_leader" && session.user.team_id) {
    const bdms = await getBdmsForTeam(session.user.team_id);
    return bdms.includes(leadBdm);
  }
  return false;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sub = await getSubscriptionById(id);
  if (!sub) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });

  const lead = await getLeadById(sub.lead_id);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const ok = await canAccessLead(session, lead.bdm);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const updates: { business_generated?: string; overall_experience?: string } = {};
  if (body.business_generated !== undefined) updates.business_generated = body.business_generated?.trim() || undefined;
  if (body.overall_experience !== undefined) updates.overall_experience = body.overall_experience?.trim() || undefined;

  const updated = await updateSubscription(id, updates);
  return NextResponse.json(updated ?? sub);
}
