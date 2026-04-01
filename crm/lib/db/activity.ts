import { getSupabase } from "../supabase";

function getTimeIST(): string {
  return new Date().toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export interface ActivityEntry {
  id: string;
  lead_id: string;
  date: string;
  time: string;
  action: string;
  user?: string;
  notes?: string;
  status?: string;
  remarks?: string;
  next_connect?: string;
}

export async function addActivity(
  leadId: string,
  action: string,
  user: string,
  notes?: string,
  opts?: { status?: string; remarks?: string; next_connect?: string }
): Promise<void> {
  const supabase = getSupabase();
  const id = `A${Date.now()}`;
  const date = new Date().toISOString().split("T")[0];
  const time = getTimeIST();
  const { error } = await supabase.from("activity").insert({
    id,
    lead_id: leadId,
    date,
    time,
    action,
    user,
    notes: notes ?? null,
    status: opts?.status ?? null,
    remarks: opts?.remarks ?? null,
    next_connect: opts?.next_connect ?? null,
  });
  if (error) throw error;
}

export async function getActivityLog(filters?: { lead_id?: string; dateFrom?: string; dateTo?: string }): Promise<ActivityEntry[]> {
  const supabase = getSupabase();
  let q = supabase.from("activity").select("*").order("date", { ascending: false }).order("time", { ascending: false });
  if (filters?.lead_id) q = q.eq("lead_id", filters.lead_id);
  if (filters?.dateFrom) q = q.gte("date", filters.dateFrom);
  if (filters?.dateTo) q = q.lte("date", filters.dateTo);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String(r.id),
    lead_id: String(r.lead_id),
    date: String(r.date),
    time: String(r.time ?? ""),
    action: String(r.action),
    user: r.user ? String(r.user) : undefined,
    notes: r.notes ? String(r.notes) : undefined,
    status: r.status ? String(r.status) : undefined,
    remarks: r.remarks ? String(r.remarks) : undefined,
    next_connect: r.next_connect ? String(r.next_connect) : undefined,
  }));
}
