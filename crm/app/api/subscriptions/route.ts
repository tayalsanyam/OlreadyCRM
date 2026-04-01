import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSubscriptionsByLeadId, createSubscription, addMonths, addDays } from "@/lib/subscriptions";
import { getLeadById } from "@/lib/leads";
import { getBdmsForTeam } from "@/lib/teams";
import { createTask } from "@/lib/tasks";

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

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const leadId = request.nextUrl.searchParams.get("lead_id");
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const lead = await getLeadById(leadId);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const ok = await canAccessLead(session, lead.bdm);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const subs = await getSubscriptionsByLeadId(leadId);
  return NextResponse.json(subs);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    lead_id,
    subscription_type,
    plan_name,
    plan_start_date,
    duration_months,
    price_paid,
    add_ons,
    business_generated,
    overall_experience,
  } = body;

  if (!lead_id || !subscription_type || !plan_name || !plan_start_date || !duration_months)
    return NextResponse.json(
      { error: "lead_id, subscription_type, plan_name, plan_start_date, duration_months required" },
      { status: 400 }
    );

  const lead = await getLeadById(lead_id);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const ok = await canAccessLead(session, lead.bdm);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const startDate = String(plan_start_date).trim().slice(0, 10);
  const endDate = addMonths(startDate, Number(duration_months));

  const sub = await createSubscription({
    lead_id,
    bdm: lead.bdm,
    subscription_type: subscription_type === "renewal" ? "renewal" : subscription_type === "upgrade" ? "upgrade" : "initial",
    plan_name,
    plan_start_date: startDate,
    plan_end_date: endDate,
    leads_count: body.leads_count != null ? Number(body.leads_count) : undefined,
    duration_months: Number(duration_months),
    price_paid: price_paid != null ? Number(price_paid) : 0,
    add_ons: add_ons?.trim() || undefined,
    business_generated: business_generated?.trim() || undefined,
    overall_experience: overall_experience?.trim() || undefined,
    active: true,
  });

  if (!sub) return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });

  const midWayDate = addMonths(startDate, Math.floor(Number(duration_months) / 2));
  const resalesDate = addDays(endDate, -10);
  await createTask({
    title: `Mid-way follow-up: ${lead.name}`,
    due: midWayDate,
    assignee: lead.bdm,
    done: false,
    lead_id,
  });
  await createTask({
    title: `Re-sales: ${lead.name}`,
    due: resalesDate,
    assignee: lead.bdm,
    done: false,
    lead_id,
  });
  const fillTaskDate = addDays(endDate, -7);
  await createTask({
    title: `Fill business & experience: ${lead.name}`,
    due: fillTaskDate,
    assignee: lead.bdm,
    done: false,
    lead_id,
  });

  return NextResponse.json(sub);
}
