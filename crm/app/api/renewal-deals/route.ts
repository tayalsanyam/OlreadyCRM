import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBdmsForTeam } from "@/lib/teams";
import { getLeadById } from "@/lib/leads";
import {
  getRenewalDealsByLeadId,
  createRenewalDeal,
  getRenewalDealSellingPrice,
  getRenewalDealBalance,
} from "@/lib/renewal-deals";
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

  const deals = await getRenewalDealsByLeadId(leadId);
  const enriched = deals.map((d) => ({
    ...d,
    selling_price: getRenewalDealSellingPrice(d),
    balance: getRenewalDealBalance(d),
  }));
  return NextResponse.json(enriched);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    lead_id,
    subscription_type,
    plan_name,
    connected_on,
    next_follow_up,
    committed_date,
    original_price,
    discount,
    duration_months,
    add_ons,
    ops_coordinator,
  } = body;

  if (!lead_id || !plan_name)
    return NextResponse.json({ error: "lead_id and plan_name required" }, { status: 400 });
  if (!next_follow_up?.trim())
    return NextResponse.json({ error: "Next follow-up date is required for renewal follow-up" }, { status: 400 });

  const lead = await getLeadById(lead_id);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const ok = await canAccessLead(session, lead.bdm);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const deal = await createRenewalDeal({
    lead_id,
    plan_name,
    subscription_type: subscription_type === "upgrade" ? "upgrade" : "renewal",
    status: "RENEWAL_FOLLOW_UP",
    connected_on: connected_on?.trim().slice(0, 10) || undefined,
    next_follow_up: next_follow_up?.trim().slice(0, 10) || undefined,
    committed_date: undefined,
    original_price: undefined,
    discount: 0,
    amount_paid: 0,
    add_ons: add_ons?.trim() || undefined,
    ops_coordinator: undefined,
  });

  if (!deal) return NextResponse.json({ error: "Failed to create" }, { status: 500 });

  if (deal.next_follow_up) {
    await createTask({
      title: `Renewal follow-up: ${lead.name}`,
      due: deal.next_follow_up,
      assignee: lead.bdm,
      done: false,
      lead_id,
      renewal_deal_id: deal.id,
    });
  }

  return NextResponse.json({
    ...deal,
    selling_price: getRenewalDealSellingPrice(deal),
    balance: getRenewalDealBalance(deal),
  });
}
