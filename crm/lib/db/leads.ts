import { getSupabase } from "../supabase";
import type { Lead } from "../types";

export function getSellingPrice(l: Lead): number {
  if (l.original_price != null && l.discount != null)
    return Math.max(0, l.original_price - l.discount);
  const planMatch = String(l.plan ?? "").match(/(\d+)\s*k/i);
  return planMatch ? parseInt(planMatch[1], 10) * 1000 : 0;
}

export function getBalance(l: Lead): number {
  const selling = getSellingPrice(l);
  const paid = l.amount_paid ?? 0;
  return Math.max(0, selling - paid);
}

function hasCoreDetails(l: Lead): boolean {
  return !!(l.name?.trim() && l.city?.trim() && (l.phone?.trim() || l.email?.trim()));
}

export interface LeadFilters {
  bdm?: string;
  status?: string;
  statuses?: string[];
  plan?: string;
  source?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  datePreset?: string;
  dateField?: "created_at" | "last_modified" | "next_follow_up" | "committed_date";
  teamBdms?: string[];
  activeFilter?: "active" | "inactive" | "all";
}

function rowToLead(r: Record<string, unknown>): Lead {
  const num = (v: unknown) => (v != null && v !== "" ? Number(v) : undefined);
  const str = (v: unknown) => (v != null ? String(v).trim() : undefined);
  const bool = (v: unknown) => v === true || v === "TRUE" || v === "1";
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    city: String(r.city ?? ""),
    company: str(r.company),
    email: str(r.email),
    phone: r.phone != null ? String(r.phone).replace(/\.0$/, "") : undefined,
    insta_id: str(r.insta_id),
    bdm: String(r.bdm ?? ""),
    plan: String(r.plan ?? ""),
    status: (r.status as Lead["status"]) ?? "UNTOUCHED",
    source: str(r.source),
    remarks: str(r.remarks),
    connected_on: str(r.connected_on),
    next_follow_up: str(r.next_follow_up),
    committed_date: str(r.committed_date),
    original_price: num(r.original_price),
    discount: num(r.discount),
    amount_paid: num(r.amount_paid),
    amount_balance: num(r.amount_balance),
    payment_status: str(r.payment_status),
    payment_mode: str(r.payment_mode),
    if_part: bool(r.if_part),
    active: r.active === undefined ? true : bool(r.active),
    created_at: String(r.created_at ?? ""),
    last_modified: str(r.last_modified),
  };
}

function getDateRange(preset: string): { from: string; to: string } | null {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate(), day = now.getDay();
  switch (preset) {
    case "mtd":
      return { from: `${y}-${pad(m + 1)}-01`, to: fmt(now) };
    case "pm": {
      const prev = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      return { from: fmt(prev), to: fmt(last) };
    }
    case "wtd": {
      const mon = day === 0 ? -6 : 1 - day;
      const monDate = new Date(now);
      monDate.setDate(d + mon);
      return { from: fmt(monDate), to: fmt(now) };
    }
    case "pw": {
      const mon = day === 0 ? -6 : 1 - day;
      const prevMon = new Date(now);
      prevMon.setDate(d + mon - 7);
      const prevSun = new Date(prevMon);
      prevSun.setDate(prevMon.getDate() + 6);
      return { from: fmt(prevMon), to: fmt(prevSun) };
    }
    default:
      return null;
  }
}

export async function getLeads(filters?: LeadFilters): Promise<Lead[]> {
  const supabase = getSupabase();
  let q = supabase.from("leads").select("*").order("last_modified", { ascending: false });

  const af = filters?.activeFilter ?? "active";
  if (af === "active") q = q.eq("active", true);
  else if (af === "inactive") q = q.eq("active", false);
  if (filters?.bdm)
    q = q.ilike("bdm", filters.bdm);
  if (filters?.teamBdms?.length)
    q = q.in("bdm", filters.teamBdms);
  if (filters?.status)
    q = q.eq("status", filters.status);
  if (filters?.statuses?.length)
    q = q.in("status", filters.statuses);
  if (filters?.plan)
    q = q.ilike("plan", `%${filters.plan}%`);
  if (filters?.source)
    q = q.ilike("source", `%${filters.source}%`);

  let dateFrom = filters?.dateFrom;
  let dateTo = filters?.dateTo;
  if (filters?.datePreset && !dateFrom && !dateTo) {
    const range = getDateRange(filters.datePreset);
    if (range) {
      dateFrom = range.from;
      dateTo = range.to;
    }
  }
  const dateField = filters?.dateField ?? "last_modified";
  if (dateFrom) q = q.gte(dateField, dateFrom);
  if (dateTo) q = q.lte(dateField, dateTo);

  const { data, error } = await q;
  if (error) throw error;

  let leads = (data ?? []).map((r) => rowToLead(r));

  if (filters?.search) {
    const qs = filters.search.toLowerCase();
    leads = leads.filter(
      (l) =>
        l.name?.toLowerCase().includes(qs) ||
        l.city?.toLowerCase().includes(qs) ||
        l.phone?.includes(qs) ||
        l.email?.toLowerCase().includes(qs) ||
        l.remarks?.toLowerCase().includes(qs)
    );
  }

  return leads;
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("leads").select("*").eq("id", id).single();
  if (error && error.code !== "PGRST116") throw error;
  if (!data) return null;
  return rowToLead(data);
}

export async function findDuplicatePhone(phone: string, excludeId?: string): Promise<Lead | null> {
  if (!phone?.trim()) return null;
  const supabase = getSupabase();
  let q = supabase.from("leads").select("*").eq("phone", phone.trim());
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q.limit(1);
  if (error) throw error;
  if (!data?.length) return null;
  return rowToLead(data[0]);
}

export async function createLead(lead: Omit<Lead, "id" | "created_at" | "last_modified">): Promise<Lead> {
  if (lead.phone?.trim()) {
    const dup = await findDuplicatePhone(lead.phone);
    if (dup) throw new Error(`Phone already exists for lead: ${dup.name}`);
  }

  const supabase = getSupabase();
  const now = new Date().toISOString();
  const id = `L${Date.now()}`;
  const status = lead.next_follow_up && hasCoreDetails(lead as Lead) ? "CONTACTED" : (lead.status ?? "UNTOUCHED");

  const insert: Record<string, unknown> = {
    id,
    name: lead.name ?? "",
    city: lead.city ?? "",
    company: lead.company ?? null,
    email: lead.email ?? null,
    phone: lead.phone ?? null,
    insta_id: lead.insta_id ?? null,
    bdm: lead.bdm ?? "",
    plan: lead.plan ?? "",
    status: status as string,
    source: lead.source ?? "manual",
    remarks: lead.remarks ?? null,
    connected_on: (lead.connected_on && String(lead.connected_on).trim()) ? String(lead.connected_on).trim().slice(0, 10) : null,
    next_follow_up: (lead.next_follow_up && String(lead.next_follow_up).trim()) ? String(lead.next_follow_up).trim().slice(0, 10) : null,
    committed_date: (lead.committed_date && String(lead.committed_date).trim()) ? String(lead.committed_date).trim().slice(0, 10) : null,
    original_price: lead.original_price ?? null,
    discount: lead.discount ?? null,
    amount_paid: 0,
    amount_balance: getSellingPrice({ ...lead, amount_paid: 0 } as Lead),
    payment_status: "PENDING",
    payment_mode: null,
    if_part: false,
    created_at: now,
    last_modified: now,
  };

  const { data, error } = await supabase.from("leads").insert(insert).select().single();
  if (error) throw error;
  return rowToLead(data);
}

export async function updateLead(leadId: string, updates: Partial<Lead>): Promise<Lead | null> {
  const existing = await getLeadById(leadId);
  if (!existing) return null;

  if (updates.phone?.trim() && updates.phone !== existing.phone) {
    const dup = await findDuplicatePhone(updates.phone, leadId);
    if (dup) throw new Error(`Phone already exists for lead: ${dup.name}`);
  }

  const supabase = getSupabase();
  let merged = { ...existing, ...updates, id: leadId };

  const hasNextFollowUp = updates.next_follow_up != null && String(updates.next_follow_up).trim();
  if (hasNextFollowUp && hasCoreDetails(merged) && merged.status === "UNTOUCHED") {
    merged = { ...merged, status: "CONTACTED" };
  }

  const payload: Record<string, unknown> = {
    name: merged.name,
    city: merged.city,
    company: merged.company ?? null,
    email: merged.email ?? null,
    phone: merged.phone ?? null,
    insta_id: merged.insta_id ?? null,
    bdm: merged.bdm,
    plan: merged.plan,
    status: merged.status,
    source: merged.source ?? null,
    remarks: merged.remarks ?? null,
    connected_on: (merged.connected_on && String(merged.connected_on).trim()) ? String(merged.connected_on).trim().slice(0, 10) : null,
    next_follow_up: (merged.next_follow_up && String(merged.next_follow_up).trim()) ? String(merged.next_follow_up).trim().slice(0, 10) : null,
    committed_date: (merged.committed_date && String(merged.committed_date).trim()) ? String(merged.committed_date).trim().slice(0, 10) : null,
    original_price: merged.original_price ?? null,
    discount: merged.discount ?? null,
    amount_paid: merged.amount_paid ?? null,
    amount_balance: merged.amount_balance ?? null,
    payment_status: merged.payment_status ?? null,
    payment_mode: merged.payment_mode ?? null,
    if_part: merged.if_part ?? false,
    lost_reason: merged.lost_reason ?? null,
    active: merged.active,
  };

  const { data, error } = await supabase.from("leads").update(payload).eq("id", leadId).select().single();
  if (error) throw error;
  return rowToLead(data);
}

export async function deleteLeadsBySource(source: string): Promise<number> {
  const supabase = getSupabase();
  const { data: leads } = await supabase.from("leads").select("id").eq("source", source);
  const ids = (leads ?? []).map((r) => r.id);
  if (ids.length === 0) return 0;
  const { error } = await supabase.from("leads").delete().in("id", ids);
  if (error) throw error;
  return ids.length;
}

export async function bulkUpdateLeads(
  ids: string[],
  updates: { active?: boolean; bdm?: string }
): Promise<number> {
  if (ids.length === 0) return 0;
  const supabase = getSupabase();
  const payload: Record<string, unknown> = {};
  if (updates.active !== undefined) payload.active = updates.active;
  if (updates.bdm !== undefined) payload.bdm = updates.bdm.trim();
  if (Object.keys(payload).length === 0) return 0;
  const { data, error } = await supabase.from("leads").update(payload).in("id", ids).select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

export async function recordPayment(
  leadId: string,
  amount: number,
  mode: string
): Promise<Lead | null> {
  const lead = await getLeadById(leadId);
  if (!lead) return null;
  const selling = getSellingPrice(lead);
  const prevPaid = lead.amount_paid ?? 0;
  const newPaid = prevPaid + amount;
  const balance = Math.max(0, selling - newPaid);
  const ifPart = balance > 0;
  const status = balance <= 0 ? "PAID" : (["CONFIRMED", "PARTLY_PAID"].includes(lead.status) ? "PARTLY_PAID" : lead.status);
  const paymentStatus = balance <= 0 ? "COMPLETE" : "PARTIAL";
  return updateLead(leadId, {
    amount_paid: newPaid,
    amount_balance: balance,
    if_part: ifPart,
    status: status as Lead["status"],
    payment_status: paymentStatus,
    payment_mode: mode,
  });
}
