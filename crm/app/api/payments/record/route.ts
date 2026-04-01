import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAdmin } from "@/lib/auth";
import { getLeadById, recordPayment, updateLead, getBalance, getSellingPrice } from "@/lib/leads";
import { getBdmsForTeam } from "@/lib/teams";
import { createTask } from "@/lib/tasks";
import { addActivity } from "@/lib/activity";
import { getCustomerByLeadId, createCustomer } from "@/lib/customers";
import { createSubscription, addMonths, addDays } from "@/lib/subscriptions";

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

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!requireAdmin(session)) return NextResponse.json({ error: "Record Payment is admin only" }, { status: 403 });
  const body = await request.json();
  const {
    lead_id,
    amount,
    payment_mode,
    next_follow_up,
    leads_count,
    duration_months,
    add_ons,
    ops_coordinator,
    plan_start_date,
  } = body;
  if (!lead_id || amount == null || !payment_mode)
    return NextResponse.json({ error: "lead_id, amount, payment_mode required" }, { status: 400 });
  const lead = await getLeadById(lead_id);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const ok = await canAccessLead(session, lead.bdm);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const balanceBefore = getBalance(lead);
  const isFullPayment = Number(amount) >= balanceBefore;

  if (isFullPayment && (!duration_months || duration_months < 1))
    return NextResponse.json({ error: "Duration (months) required for full payment" }, { status: 400 });

  let updated = await recordPayment(lead_id, Number(amount), payment_mode);
  if (!updated) return NextResponse.json({ error: "Record failed" }, { status: 500 });

  const followUpVal = next_follow_up && String(next_follow_up).trim() ? String(next_follow_up).trim().slice(0, 10) : null;
  const paymentNote = followUpVal
    ? `₹${amount} via ${payment_mode}. Pending payment follow-up: ${followUpVal}`
    : `₹${amount} via ${payment_mode}`;
  await addActivity(lead_id, "Payment recorded", session.user!.username, paymentNote, followUpVal ? { next_connect: followUpVal } : undefined);

  if (followUpVal) {
    updated = await updateLead(lead_id, { next_follow_up: followUpVal });
    if (updated) {
      await createTask({
        title: `Follow up: ${updated.name}`,
        due: followUpVal,
        assignee: updated.bdm,
        done: false,
        lead_id,
      });
    }
  }

  if (isFullPayment && duration_months) {
    const currentLead = updated ?? lead;
    const startDate = (plan_start_date && String(plan_start_date).trim().slice(0, 10)) || new Date().toISOString().slice(0, 10);
    const endDate = addMonths(startDate, duration_months);

    const existing = await getCustomerByLeadId(lead_id);
    if (!existing) {
      await createCustomer({
        lead_id,
        name: currentLead.name,
        city: currentLead.city ?? "",
        phone: currentLead.phone,
        email: currentLead.email,
        ops_coordinator: ops_coordinator?.trim() || undefined,
      });
    }

    const sub = await createSubscription({
      lead_id,
      bdm: currentLead.bdm,
      subscription_type: "initial",
      plan_name: currentLead.plan ?? "",
      plan_start_date: startDate,
      plan_end_date: endDate,
      leads_count: leads_count != null ? Number(leads_count) : undefined,
      duration_months: Number(duration_months),
      price_paid: getSellingPrice(currentLead),
      add_ons: add_ons?.trim() || undefined,
      ops_coordinator: ops_coordinator?.trim() || undefined,
      active: true,
    });

    if (sub) {
      const midWayDate = addMonths(startDate, Math.floor(duration_months / 2));
      const resalesDate = addDays(endDate, -10);
      const fillTaskDate = addDays(endDate, -7);
      await createTask({
        title: `Mid-way follow-up: ${currentLead.name}`,
        due: midWayDate,
        assignee: currentLead.bdm,
        done: false,
        lead_id,
      });
      await createTask({
        title: `Re-sales: ${currentLead.name}`,
        due: resalesDate,
        assignee: currentLead.bdm,
        done: false,
        lead_id,
      });
      await createTask({
        title: `Fill business & experience: ${currentLead.name}`,
        due: fillTaskDate,
        assignee: currentLead.bdm,
        done: false,
        lead_id,
      });
    }
  }

  return NextResponse.json(updated);
}
