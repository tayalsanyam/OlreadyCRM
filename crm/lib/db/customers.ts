import { getSupabase } from "../supabase";

export interface Customer {
  id: string;
  lead_id: string;
  name: string;
  city: string;
  phone?: string;
  email?: string;
  ops_coordinator?: string;
  created_at: string;
}

function rowToCustomer(r: Record<string, unknown>): Customer {
  const str = (v: unknown) => (v != null ? String(v).trim() : undefined);
  return {
    id: String(r.id ?? ""),
    lead_id: String(r.lead_id ?? ""),
    name: String(r.name ?? ""),
    city: String(r.city ?? ""),
    phone: str(r.phone),
    email: str(r.email),
    ops_coordinator: str(r.ops_coordinator),
    created_at: String(r.created_at ?? ""),
  };
}

export async function getCustomerByLeadId(leadId: string): Promise<Customer | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("customers").select("*").eq("lead_id", leadId).single();
  if (error && error.code !== "PGRST116") throw error;
  if (!data) return null;
  return rowToCustomer(data);
}

export async function createCustomer(customer: Omit<Customer, "id" | "created_at">): Promise<Customer> {
  const supabase = getSupabase();
  const id = `C${Date.now()}`;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      id,
      lead_id: customer.lead_id,
      name: customer.name,
      city: customer.city,
      phone: customer.phone ?? null,
      email: customer.email ?? null,
      ops_coordinator: customer.ops_coordinator ?? null,
      created_at: now,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToCustomer(data);
}

export async function getCustomersByLeadIds(leadIds: string[]): Promise<Customer[]> {
  if (leadIds.length === 0) return [];
  const supabase = getSupabase();
  const { data, error } = await supabase.from("customers").select("*").in("lead_id", leadIds);
  if (error) throw error;
  return (data ?? []).map((r) => rowToCustomer(r));
}

export async function getCustomers(filters?: { ops_coordinator?: string; city?: string }): Promise<Customer[]> {
  const supabase = getSupabase();
  let q = supabase.from("customers").select("*").order("created_at", { ascending: false });
  if (filters?.ops_coordinator) q = q.eq("ops_coordinator", filters.ops_coordinator);
  if (filters?.city) q = q.ilike("city", `%${filters.city}%`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => rowToCustomer(r));
}
