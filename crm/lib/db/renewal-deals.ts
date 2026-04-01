import { getSupabase } from "../supabase";

export interface RenewalDeal {
  id: string;
  lead_id: string;
  plan_name: string;
  subscription_type: "renewal" | "upgrade";
  status: "RENEWAL_FOLLOW_UP" | "CONFIRMED" | "PARTLY_PAID" | "PAID" | "RENEWAL_REJECTED";
  connected_on?: string;
  next_follow_up?: string;
  committed_date?: string;
  original_price?: number;
  discount?: number;
  amount_paid?: number;
  duration_months?: number;
  add_ons?: string;
  ops_coordinator?: string;
  rejection_reason?: string;
  created_at: string;
}

function rowToDeal(r: Record<string, unknown>): RenewalDeal {
  const num = (v: unknown) => (v != null && v !== "" ? Number(v) : undefined);
  const str = (v: unknown) => (v != null ? String(v).trim() : undefined);
  return {
    id: String(r.id ?? ""),
    lead_id: String(r.lead_id ?? ""),
    plan_name: String(r.plan_name ?? ""),
    subscription_type: (r.subscription_type as RenewalDeal["subscription_type"]) ?? "renewal",
    status: (r.status as RenewalDeal["status"]) ?? "RENEWAL_FOLLOW_UP",
    connected_on: str(r.connected_on),
    next_follow_up: str(r.next_follow_up),
    committed_date: str(r.committed_date),
    original_price: num(r.original_price),
    discount: num(r.discount),
    amount_paid: num(r.amount_paid),
    duration_months: num(r.duration_months),
    add_ons: str(r.add_ons),
    ops_coordinator: str(r.ops_coordinator),
    rejection_reason: str(r.rejection_reason),
    created_at: String(r.created_at ?? ""),
  };
}

export function getRenewalDealSellingPrice(d: RenewalDeal): number {
  const orig = d.original_price ?? 0;
  const disc = d.discount ?? 0;
  return Math.max(0, orig - disc);
}

export function getRenewalDealBalance(d: RenewalDeal): number {
  const selling = getRenewalDealSellingPrice(d);
  const paid = d.amount_paid ?? 0;
  return Math.max(0, selling - paid);
}

export async function getPendingRenewalDeals(): Promise<RenewalDeal[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("renewal_deals")
    .select("*")
    .in("status", ["CONFIRMED", "PARTLY_PAID"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToDeal(r));
}

export async function getRenewalDealsByLeadId(leadId: string): Promise<RenewalDeal[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("renewal_deals")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToDeal(r));
}

export async function getRenewalDealsByLeadIds(leadIds: string[]): Promise<RenewalDeal[]> {
  if (leadIds.length === 0) return [];
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("renewal_deals")
    .select("*")
    .in("lead_id", leadIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToDeal(r));
}

export async function createRenewalDeal(deal: Omit<RenewalDeal, "id" | "created_at">): Promise<RenewalDeal> {
  const supabase = getSupabase();
  const id = `RD${Date.now()}`;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("renewal_deals")
    .insert({
      id,
      lead_id: deal.lead_id,
      plan_name: deal.plan_name,
      subscription_type: deal.subscription_type,
      status: deal.status,
      connected_on: deal.connected_on ?? null,
      next_follow_up: deal.next_follow_up ?? null,
      committed_date: deal.committed_date ?? null,
      original_price: deal.original_price ?? null,
      discount: deal.discount ?? null,
      amount_paid: deal.amount_paid ?? null,
      duration_months: deal.duration_months ?? null,
      add_ons: deal.add_ons ?? null,
      ops_coordinator: deal.ops_coordinator ?? null,
      created_at: now,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToDeal(data);
}

export async function getRenewalDealById(dealId: string): Promise<RenewalDeal | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("renewal_deals").select("*").eq("id", dealId).single();
  if (error && error.code !== "PGRST116") throw error;
  return data ? rowToDeal(data) : null;
}

export async function updateRenewalDeal(id: string, updates: Partial<RenewalDeal>): Promise<RenewalDeal | null> {
  const supabase = getSupabase();
  const payload: Record<string, unknown> = {};
  if (updates.status != null) payload.status = updates.status;
  if (updates.next_follow_up !== undefined) payload.next_follow_up = updates.next_follow_up ?? null;
  if (updates.committed_date !== undefined) payload.committed_date = updates.committed_date ?? null;
  if (updates.original_price !== undefined) payload.original_price = updates.original_price ?? null;
  if (updates.discount !== undefined) payload.discount = updates.discount ?? null;
  if (updates.amount_paid !== undefined) payload.amount_paid = updates.amount_paid ?? null;
  if (updates.rejection_reason !== undefined) payload.rejection_reason = updates.rejection_reason ?? null;
  if (Object.keys(payload).length === 0) return getRenewalDealById(id);
  const { data, error } = await supabase
    .from("renewal_deals")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data ? rowToDeal(data) : null;
}

export async function recordRenewalPayment(dealId: string, amount: number): Promise<RenewalDeal | null> {
  const supabase = getSupabase();
  const { data: existing } = await supabase.from("renewal_deals").select("*").eq("id", dealId).single();
  if (!existing) return null;
  const paid = (existing.amount_paid ?? 0) + amount;
  const orig = existing.original_price ?? 0;
  const disc = existing.discount ?? 0;
  const selling = Math.max(0, orig - disc);
  const status = paid >= selling ? "PAID" : "PARTLY_PAID";
  const { data, error } = await supabase
    .from("renewal_deals")
    .update({ amount_paid: paid, status })
    .eq("id", dealId)
    .select()
    .single();
  if (error) throw error;
  return data ? rowToDeal(data) : null;
}
