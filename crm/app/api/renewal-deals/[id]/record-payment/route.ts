import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAdmin } from "@/lib/auth";
import { getBdmsForTeam } from "@/lib/teams";
import { getLeadById } from "@/lib/leads";
import {
  getRenewalDealById,
  recordRenewalPayment,
  getRenewalDealBalance,
  getRenewalDealSellingPrice,
} from "@/lib/renewal-deals";
import { createSubscription, addMonths, addDays } from "@/lib/subscriptions";
import { getCustomerByLeadId } from "@/lib/customers";
import { createTask } from "@/lib/tasks";
import { addActivity } from "@/lib/activity";

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

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!requireAdmin(session)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { id: dealId } = await params;
  const deal = await getRenewalDealById(dealId);
  if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

  const lead = await getLeadById(deal.lead_id);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const ok = await canAccessLead(session, lead.bdm);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { amount, payment_mode, next_follow_up, duration_months, plan_start_date, ops_coordinator, leads_count } = body;
  if (amount == null || !payment_mode)
    return NextResponse.json({ error: "amount and payment_mode required" }, { status: 400 });

  const balanceBefore = getRenewalDealBalance(deal);
  const isFullPayment = Number(amount) >= balanceBefore;

  if (isFullPayment && (!duration_months || duration_months < 1))
    return NextResponse.json({ error: "duration_months required for full payment" }, { status: 400 });

  const updated = await recordRenewalPayment(dealId, Number(amount));
  if (!updated) return NextResponse.json({ error: "Record failed" }, { status: 500 });

  const followUpVal = next_follow_up?.trim() ? String(next_follow_up).trim().slice(0, 10) : null;
  await addActivity(
    deal.lead_id,
    "Renewal payment",
    session.user!.username,
    `₹${amount} via ${payment_mode} (${deal.subscription_type})`,
    followUpVal ? { next_connect: followUpVal } : undefined
  );

  if (isFullPayment && duration_months) {
    const startDate = (plan_start_date?.trim().slice(0, 10)) || new Date().toISOString().slice(0, 10);
    const endDate = addMonths(startDate, Number(duration_months));

    const existing = await getCustomerByLeadId(deal.lead_id);
    if (!existing) {
      const { createCustomer } = await import("@/lib/customers");
      await createCustomer({
        lead_id: deal.lead_id,
        name: lead.name,
        city: lead.city ?? "",
        phone: lead.phone,
        email: lead.email,
        ops_coordinator: ops_coordinator?.trim() || undefined,
      });
    }

    const sub = await createSubscription({
      lead_id: deal.lead_id,
      bdm: lead.bdm,
      subscription_type: deal.subscription_type,
      plan_name: deal.plan_name,
      plan_start_date: startDate,
      plan_end_date: endDate,
      leads_count: leads_count != null ? Number(leads_count) : undefined,
      duration_months: Number(duration_months),
      price_paid: getRenewalDealSellingPrice(updated),
      add_ons: deal.add_ons ?? undefined,
      ops_coordinator: ops_coordinator?.trim() || undefined,
      active: true,
    });

    if (sub) {
      const midWayDate = addMonths(startDate, Math.floor(Number(duration_months) / 2));
      const resalesDate = addDays(endDate, -10);
      await createTask({
        title: `Mid-way follow-up: ${lead.name}`,
        due: midWayDate,
        assignee: lead.bdm,
        done: false,
        lead_id: deal.lead_id,
      });
      await createTask({
        title: `Re-sales: ${lead.name}`,
        due: resalesDate,
        assignee: lead.bdm,
        done: false,
        lead_id: deal.lead_id,
      });
      const fillTaskDate = addDays(endDate, -7);
      await createTask({
        title: `Fill business & experience: ${lead.name}`,
        due: fillTaskDate,
        assignee: lead.bdm,
        done: false,
        lead_id: deal.lead_id,
      });
    }
  }

  return NextResponse.json({
    ...updated,
    selling_price: getRenewalDealSellingPrice(updated),
    balance: getRenewalDealBalance(updated),
  });
}
