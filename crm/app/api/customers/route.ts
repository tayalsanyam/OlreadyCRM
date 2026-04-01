import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCustomers } from "@/lib/customers";
import { getSubscriptionsByLeadIds } from "@/lib/subscriptions";

export type CustomerWithSubscription = {
  id: string;
  lead_id: string;
  name: string;
  city: string;
  phone?: string;
  email?: string;
  ops_coordinator?: string;
  created_at: string;
  plan_name?: string;
  plan_start_date?: string;
  plan_end_date?: string;
  price_paid?: number;
};

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const ops_coordinator = searchParams.get("ops_coordinator") ?? undefined;
  const city = searchParams.get("city") ?? undefined;
  const expiringSoon = searchParams.get("expiring_soon") === "true";

  const customers = await getCustomers({ ops_coordinator, city });
  if (customers.length === 0) return NextResponse.json([]);

  const subs = await getSubscriptionsByLeadIds(customers.map((c) => c.lead_id));
  const latestByLead = new Map<string, (typeof subs)[0]>();
  for (const s of subs) {
    if (!latestByLead.has(s.lead_id)) latestByLead.set(s.lead_id, s);
  }

  const now = new Date();
  const in30Days = new Date(now);
  in30Days.setDate(in30Days.getDate() + 30);

  let result: CustomerWithSubscription[] = customers.map((c) => {
    const sub = latestByLead.get(c.lead_id);
    return {
      ...c,
      plan_name: sub?.plan_name,
      plan_start_date: sub?.plan_start_date,
      plan_end_date: sub?.plan_end_date,
      price_paid: sub?.price_paid,
    };
  });

  if (expiringSoon) {
    result = result.filter((r) => {
      if (!r.plan_end_date) return false;
      const end = new Date(r.plan_end_date);
      return end >= now && end <= in30Days;
    });
  }

  return NextResponse.json(result);
}
