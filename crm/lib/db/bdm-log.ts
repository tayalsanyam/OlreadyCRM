import { getSupabase } from "../supabase";
import type { BDMLogEntry } from "../types";

export async function getBDMLogs(filters?: { bdm?: string; dateFrom?: string; dateTo?: string }): Promise<BDMLogEntry[]> {
  const supabase = getSupabase();
  let q = supabase.from("bdm_log").select("*").order("date", { ascending: false });
  if (filters?.bdm) q = q.eq("bdm", filters.bdm);
  if (filters?.dateFrom) q = q.gte("date", filters.dateFrom);
  if (filters?.dateTo) q = q.lte("date", filters.dateTo);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String(r.id),
    bdm: String(r.bdm),
    date: String(r.date),
    total_calls: Number(r.total_calls) || 0,
    connected_calls: Number(r.connected_calls) || 0,
    non_answered_calls: Number(r.non_answered_calls) || 0,
    talk_time: Number(r.talk_time) || 0,
  }));
}

export async function addBDMLog(entry: Omit<BDMLogEntry, "id">): Promise<BDMLogEntry> {
  const supabase = getSupabase();
  const id = `B${Date.now()}`;
  const { data, error } = await supabase
    .from("bdm_log")
    .insert({
      id,
      bdm: entry.bdm,
      date: entry.date,
      total_calls: entry.total_calls ?? 0,
      connected_calls: entry.connected_calls ?? 0,
      non_answered_calls: entry.non_answered_calls ?? 0,
      talk_time: entry.talk_time ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    bdm: data.bdm,
    date: data.date,
    total_calls: data.total_calls ?? 0,
    connected_calls: data.connected_calls ?? 0,
    non_answered_calls: data.non_answered_calls ?? 0,
    talk_time: data.talk_time ?? 0,
  };
}
