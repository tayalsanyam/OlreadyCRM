import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBdmsForTeam } from "@/lib/teams";
import { getLeads, getSellingPrice, getBalance, getLeadById } from "@/lib/leads";
import { getCustomersByLeadIds } from "@/lib/customers";
import { getSubscriptionsByLeadIds } from "@/lib/subscriptions";
import { getPendingRenewalDeals, getRenewalDealBalance, getRenewalDealSellingPrice } from "@/lib/renewal-deals";
import { isSupabaseConfigured } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const filters: Parameters<typeof getLeads>[0] = {
    statuses: ["CONFIRMED", "PARTLY_PAID"],
    dateField: "committed_date",
  };
  if (session.user.role === "bdm" && session.user.assigned_bdm)
    filters.bdm = session.user.assigned_bdm;
  if (session.user.role === "team_leader" && session.user.team_id) {
    filters.teamBdms = await getBdmsForTeam(session.user.team_id);
  }

  const { searchParams } = new URL(request.url);
  const bdmParam = searchParams.get("bdm");
  const planParam = searchParams.get("plan");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const overdue = searchParams.get("overdue") === "true";

  if (dateFrom) filters.dateFrom = dateFrom;
  if (dateTo) filters.dateTo = dateTo;
  if (planParam) filters.plan = planParam;

  const leads = await getLeads(filters);
  let pending = leads.filter((l) => {
    const balance = getBalance(l);
    const selling = getSellingPrice(l);
    return balance > 0 || (selling === 0 && (l.amount_paid ?? 0) === 0);
  });

  if (bdmParam) pending = pending.filter((l) => l.bdm === bdmParam);

  const today = new Date().toISOString().slice(0, 10);
  if (overdue) pending = pending.filter((l) => l.committed_date && l.committed_date < today);

  const leadRows = pending.map((l) => {
    const selling = getSellingPrice(l);
    const balance = getBalance(l);
    return {
      type: "lead" as const,
      id: l.id,
      lead_id: l.id,
      name: l.name,
      bdm: l.bdm,
      plan: l.plan,
      selling_price: selling,
      amount_paid: l.amount_paid,
      balance,
      status_label: (l.amount_paid ?? 0) > 0 ? "Part paid" : "Full due",
      committed_date: l.committed_date,
      next_follow_up: l.next_follow_up,
      is_overdue: !!(l.committed_date && l.committed_date < today),
    };
  });

  let renewalRows: Array<{
    type: "renewal";
    id: string;
    lead_id: string;
    name: string;
    bdm: string;
    plan: string;
    selling_price: number;
    amount_paid?: number;
    balance: number;
    status_label: string;
    committed_date?: string;
    next_follow_up?: string;
    is_overdue: boolean;
    customer_ops_coordinator?: string | null;
  }> = [];

  if (isSupabaseConfigured()) {
    const deals = await getPendingRenewalDeals();
    const pendingDeals = deals.filter((d) => getRenewalDealBalance(d) > 0);

    const leadIds = Array.from(new Set(pendingDeals.map((d) => d.lead_id)));
    const [leadsForDeals, customers, subscriptions] = await Promise.all([
      Promise.all(leadIds.map((lid) => getLeadById(lid))),
      getCustomersByLeadIds(leadIds),
      getSubscriptionsByLeadIds(leadIds),
    ]);
    const leadMap = new Map(leadsForDeals.filter(Boolean).map((l) => [l!.id, l!]));
    const customerMap = new Map(customers.map((c) => [c.lead_id, c]));
    const activeSubsByLead = new Map<string, Array<{ plan_name: string; plan_end_date: string; ops_coordinator?: string }>>();
    for (const s of subscriptions) {
      if (s.plan_end_date >= today) {
        const arr = activeSubsByLead.get(s.lead_id) ?? [];
        arr.push({ plan_name: s.plan_name, plan_end_date: s.plan_end_date, ops_coordinator: s.ops_coordinator });
        activeSubsByLead.set(s.lead_id, arr);
      }
    }
    const renewalBdmFilter = bdmParam || (session.user.role === "bdm" ? session.user.assigned_bdm : null);
    const teamBdms = filters.teamBdms as string[] | undefined;

    for (const d of pendingDeals) {
      const lead = leadMap.get(d.lead_id);
      if (!lead) continue;
      if (renewalBdmFilter && lead.bdm !== renewalBdmFilter) continue;
      if (teamBdms?.length && !teamBdms.includes(lead.bdm)) continue;
      if (planParam && !String(d.plan_name).toLowerCase().includes(planParam.toLowerCase())) continue;
      if (dateFrom && (!d.committed_date || d.committed_date < dateFrom)) continue;
      if (dateTo && (!d.committed_date || d.committed_date > dateTo)) continue;
      if (overdue && (!d.committed_date || d.committed_date >= today)) continue;

      const balance = getRenewalDealBalance(d);
      const selling = getRenewalDealSellingPrice(d);
      const customer = customerMap.get(d.lead_id);
      const activeSubs = activeSubsByLead.get(d.lead_id) ?? [];
      const matchingSub = activeSubs
        .filter((s) => s.plan_name === d.plan_name)
        .sort((a, b) => a.plan_end_date.localeCompare(b.plan_end_date))[0];
      const fallbackSub = activeSubs.sort((a, b) => a.plan_end_date.localeCompare(b.plan_end_date))[0];
      const subOps = matchingSub?.ops_coordinator ?? fallbackSub?.ops_coordinator;
      const customer_ops_coordinator = subOps ?? customer?.ops_coordinator ?? null;
      renewalRows.push({
        type: "renewal",
        id: d.id,
        lead_id: d.lead_id,
        name: lead.name,
        bdm: lead.bdm,
        plan: d.plan_name,
        customer_ops_coordinator,
        selling_price: selling,
        amount_paid: d.amount_paid,
        balance,
        status_label: (d.amount_paid ?? 0) > 0 ? "Part paid" : "Full due",
        committed_date: d.committed_date,
        next_follow_up: d.next_follow_up,
        is_overdue: !!(d.committed_date && d.committed_date < today),
      });
    }
  }

  const rows = [...leadRows, ...renewalRows];
  return NextResponse.json(rows);
}
