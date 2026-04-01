import { getSupabase } from "../supabase";

export interface Subscription {
  id: string;
  lead_id: string;
  bdm: string;
  subscription_type: "initial" | "renewal" | "upgrade";
  plan_name: string;
  plan_start_date: string;
  plan_end_date: string;
  leads_count?: number;
  duration_months: number;
  price_paid: number;
  add_ons?: string;
  business_generated?: string;
  overall_experience?: string;
  ops_coordinator?: string;
  active: boolean;
  created_at: string;
}

function rowToSubscription(r: Record<string, unknown>): Subscription {
  const num = (v: unknown) => (v != null && v !== "" ? Number(v) : undefined);
  const str = (v: unknown) => (v != null ? String(v).trim() : undefined);
  const bool = (v: unknown) => v === true || v === "TRUE" || v === "1";
  return {
    id: String(r.id ?? ""),
    lead_id: String(r.lead_id ?? ""),
    bdm: String(r.bdm ?? ""),
    subscription_type: (r.subscription_type as Subscription["subscription_type"]) ?? "initial",
    plan_name: String(r.plan_name ?? ""),
    plan_start_date: String(r.plan_start_date ?? ""),
    plan_end_date: String(r.plan_end_date ?? ""),
    leads_count: num(r.leads_count),
    duration_months: num(r.duration_months) ?? 0,
    price_paid: num(r.price_paid) ?? 0,
    add_ons: str(r.add_ons),
    business_generated: str(r.business_generated),
    overall_experience: str(r.overall_experience),
    ops_coordinator: str(r.ops_coordinator),
    active: r.active === undefined ? true : bool(r.active),
    created_at: String(r.created_at ?? ""),
  };
}

export function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getSubscriptionById(subId: string): Promise<Subscription | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("subscriptions").select("*").eq("id", subId).single();
  if (error && error.code !== "PGRST116") throw error;
  return data ? rowToSubscription(data) : null;
}

export async function getSubscriptionsByLeadId(leadId: string): Promise<Subscription[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToSubscription(r));
}

export async function getSubscriptionsByLeadIds(leadIds: string[]): Promise<Subscription[]> {
  if (leadIds.length === 0) return [];
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .in("lead_id", leadIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToSubscription(r));
}

export async function createSubscription(sub: Omit<Subscription, "id" | "created_at">): Promise<Subscription> {
  const supabase = getSupabase();
  const id = `S${Date.now()}`;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      id,
      lead_id: sub.lead_id,
      bdm: sub.bdm,
      subscription_type: sub.subscription_type,
      plan_name: sub.plan_name,
      plan_start_date: sub.plan_start_date,
      plan_end_date: sub.plan_end_date,
      leads_count: sub.leads_count ?? null,
      duration_months: sub.duration_months,
      price_paid: sub.price_paid,
      add_ons: sub.add_ons ?? null,
      business_generated: sub.business_generated ?? null,
      overall_experience: sub.overall_experience ?? null,
      ops_coordinator: sub.ops_coordinator ?? null,
      active: sub.active ?? true,
      created_at: now,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToSubscription(data);
}

export async function updateSubscription(id: string, updates: { business_generated?: string; overall_experience?: string }): Promise<Subscription | null> {
  const supabase = getSupabase();
  const payload: Record<string, unknown> = {};
  if (updates.business_generated !== undefined) payload.business_generated = updates.business_generated ?? null;
  if (updates.overall_experience !== undefined) payload.overall_experience = updates.overall_experience ?? null;
  if (Object.keys(payload).length === 0) {
    const { data } = await supabase.from("subscriptions").select("*").eq("id", id).single();
    return data ? rowToSubscription(data) : null;
  }
  const { data, error } = await supabase
    .from("subscriptions")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data ? rowToSubscription(data) : null;
}
