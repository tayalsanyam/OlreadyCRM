import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBdmsForTeam } from "@/lib/teams";
import { getLeads, createLead } from "@/lib/leads";
import { createTask } from "@/lib/tasks";
import { addActivity } from "@/lib/activity";
import { getCustomersByLeadIds } from "@/lib/customers";
import { getSubscriptionsByLeadIds } from "@/lib/subscriptions";
import { getRenewalDealsByLeadIds } from "@/lib/renewal-deals";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { Lead } from "@/lib/types";

export type LeadType = "new" | "on_plan" | "existing_customer";
export type RenewalStage = "none" | "follow_up" | "rejected" | "pending" | "paid";

function computeLeadMeta(
  leadIds: string[],
  customers: { lead_id: string }[],
  subscriptions: { lead_id: string; plan_end_date: string; plan_name?: string; ops_coordinator?: string }[],
  renewalDeals: { lead_id: string; status: string }[]
): Map<string, { leadType: LeadType; renewalStage: RenewalStage; planExpiry?: string; activePlanName?: string; activeOpsCoordinator?: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const customerLeadIds = new Set(customers.map((c) => c.lead_id));
  const activeSubByLead = new Map<string, { plan_end_date: string; plan_name?: string; ops_coordinator?: string }>();
  for (const s of subscriptions) {
    if (s.plan_end_date >= today) {
      const existing = activeSubByLead.get(s.lead_id);
      if (!existing || s.plan_end_date < existing.plan_end_date) {
        activeSubByLead.set(s.lead_id, { plan_end_date: s.plan_end_date, plan_name: s.plan_name, ops_coordinator: s.ops_coordinator });
      }
    }
  }
  const renewalByLead = new Map<string, { status: string }[]>();
  for (const r of renewalDeals) {
    const arr = renewalByLead.get(r.lead_id) ?? [];
    arr.push({ status: r.status });
    renewalByLead.set(r.lead_id, arr);
  }

  const out = new Map<string, { leadType: LeadType; renewalStage: RenewalStage; planExpiry?: string; activePlanName?: string; activeOpsCoordinator?: string }>();
  for (const lid of leadIds) {
    const hasCustomer = customerLeadIds.has(lid);
    const activeSub = activeSubByLead.get(lid);
    const deals = renewalByLead.get(lid) ?? [];

    let leadType: LeadType = "new";
    if (activeSub) {
      leadType = "on_plan";
    } else if (hasCustomer) {
      leadType = "existing_customer";
    }

    let renewalStage: RenewalStage = "none";
    const hasFollowUp = deals.some((d) => d.status === "RENEWAL_FOLLOW_UP");
    const hasRejected = deals.some((d) => d.status === "RENEWAL_REJECTED");
    const hasPending = deals.some((d) => d.status === "CONFIRMED" || d.status === "PARTLY_PAID");
    const hasPaid = deals.some((d) => d.status === "PAID");
    if (hasPending) renewalStage = "pending";
    else if (hasRejected) renewalStage = "rejected";
    else if (hasFollowUp) renewalStage = "follow_up";
    else if (hasPaid) renewalStage = "paid";

    out.set(lid, {
      leadType,
      renewalStage,
      planExpiry: activeSub?.plan_end_date,
      activePlanName: activeSub?.plan_name,
      activeOpsCoordinator: activeSub?.ops_coordinator,
    });
  }
  return out;
}

function getFilters(session: { user?: { role: string; assigned_bdm?: string; team_id?: string } }) {
  if (!session.user) return {};
  if (session.user.role === "admin") return {};
  if (session.user.role === "bdm" && session.user.assigned_bdm)
    return { bdm: session.user.assigned_bdm };
  return {};
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const filters: Record<string, string | string[] | undefined> = {};
  const bdmFilters = getFilters(session);
  if (bdmFilters.bdm) filters.bdm = bdmFilters.bdm;

  if (session.user?.role === "team_leader" && session.user.team_id) {
    const teamBdms = await getBdmsForTeam(session.user.team_id);
    filters.teamBdms = teamBdms;
  }

  const bdmParam = searchParams.get("bdm");
  if (bdmParam) {
    if (session.user.role === "admin") {
      filters.bdm = bdmParam;
    } else if (session.user.role === "team_leader" && filters.teamBdms && (filters.teamBdms as string[]).includes(bdmParam)) {
      filters.bdm = bdmParam;
    }
  }

  const status = searchParams.get("status");
  if (status) filters.status = status;
  const statuses = searchParams.get("statuses");
  if (statuses) filters.statuses = statuses.split(",").map((s) => s.trim()).filter(Boolean);
  const plan = searchParams.get("plan");
  if (plan) filters.plan = plan;
  const search = searchParams.get("search");
  if (search) filters.search = search;
  const dateFrom = searchParams.get("dateFrom");
  if (dateFrom) filters.dateFrom = dateFrom;
  const dateTo = searchParams.get("dateTo");
  if (dateTo) filters.dateTo = dateTo;
  const datePreset = searchParams.get("datePreset");
  if (datePreset) filters.datePreset = datePreset;
  const dateField = searchParams.get("dateField");
  if (dateField) filters.dateField = dateField;
  const activeFilter = searchParams.get("activeFilter");
  if (activeFilter === "inactive" || activeFilter === "all") (filters as Record<string, unknown>).activeFilter = activeFilter;

  const leadTypeParam = searchParams.get("leadType") as LeadType | null;
  const renewalStageParam = searchParams.get("renewalStage") as RenewalStage | null;

  let leads = await getLeads(filters);

  if (isSupabaseConfigured() && leads.length > 0) {
    const leadIds = leads.map((l) => l.id);
    const [customers, subscriptions, renewalDeals] = await Promise.all([
      getCustomersByLeadIds(leadIds),
      getSubscriptionsByLeadIds(leadIds),
      getRenewalDealsByLeadIds(leadIds),
    ]);
    const meta = computeLeadMeta(leadIds, customers, subscriptions, renewalDeals);

    leads = leads.map((l) => {
      const m = meta.get(l.id);
      return {
        ...l,
        leadType: m?.leadType ?? "new",
        renewalStage: m?.renewalStage ?? "none",
        planExpiry: m?.planExpiry,
        activePlanName: m?.activePlanName,
        activeOpsCoordinator: m?.activeOpsCoordinator,
      };
    });

    if (leadTypeParam && ["new", "on_plan", "existing_customer"].includes(leadTypeParam)) {
      leads = leads.filter((l) => (l as Lead & { leadType: LeadType }).leadType === leadTypeParam);
    }
    if (renewalStageParam && ["none", "follow_up", "rejected", "pending", "paid"].includes(renewalStageParam)) {
      leads = leads.filter((l) => (l as Lead & { renewalStage: RenewalStage }).renewalStage === renewalStageParam);
    }
  }

  return NextResponse.json(leads);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!body.city?.trim()) return NextResponse.json({ error: "City is required" }, { status: 400 });
  if (!body.bdm?.trim()) return NextResponse.json({ error: "BDM is required" }, { status: 400 });

  const lead: Omit<Lead, "id" | "created_at" | "last_modified"> = {
    name: body.name ?? "",
    city: body.city ?? "",
    company: body.company,
    email: body.email,
    phone: body.phone,
    insta_id: body.insta_id,
    bdm: body.bdm ?? "",
    plan: body.plan ?? "",
    status: body.status ?? "UNTOUCHED",
    source: body.source ?? "manual",
    remarks: body.remarks,
    connected_on: body.connected_on,
    next_follow_up: body.next_follow_up,
    committed_date: body.committed_date,
    original_price: body.original_price,
    discount: body.discount,
  };

  const hasCore = !!(lead.name?.trim() && lead.city?.trim() && (lead.phone || lead.email));
  const status = lead.next_follow_up && hasCore ? "CONTACTED" : (lead.status ?? "UNTOUCHED");
  let created;
  try {
    created = await createLead({ ...lead, status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Create failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (created.next_follow_up) {
    await createTask({
      title: `Follow up: ${created.name}`,
      due: created.next_follow_up,
      assignee: created.bdm,
      done: false,
      lead_id: created.id,
    });
  }
  await addActivity(created.id, "Created", session.user!.username, body.remarks);

  return NextResponse.json(created);
}
