import { getSupabase } from "../supabase";
import type { Task } from "../types";

export async function getTasks(filters?: {
  assignee?: string;
  assignees?: string[];
  done?: boolean;
  lead_id?: string;
}): Promise<Task[]> {
  const supabase = getSupabase();
  let q = supabase.from("tasks").select("*").order("due", { ascending: true });
  if (filters?.assignee) q = q.eq("assignee", filters.assignee);
  if (filters?.assignees?.length) q = q.in("assignee", filters.assignees);
  if (filters?.done !== undefined) q = q.eq("done", filters.done);
  if (filters?.lead_id) q = q.eq("lead_id", filters.lead_id);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String(r.id),
    title: String(r.title),
    due: String(r.due),
    assignee: String(r.assignee),
    done: r.done === true || r.done === "TRUE" || r.done === "1",
    lead_id: r.lead_id ? String(r.lead_id) : undefined,
    renewal_deal_id: r.renewal_deal_id ? String(r.renewal_deal_id) : undefined,
  }));
}

export async function createTask(task: Omit<Task, "id">): Promise<Task> {
  const supabase = getSupabase();
  const id = `T${Date.now()}`;
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      id,
      title: task.title,
      due: task.due,
      assignee: task.assignee,
      done: task.done ?? false,
      lead_id: task.lead_id ?? null,
      renewal_deal_id: task.renewal_deal_id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    title: data.title,
    due: data.due,
    assignee: data.assignee,
    done: data.done ?? false,
    lead_id: data.lead_id ?? undefined,
    renewal_deal_id: data.renewal_deal_id ?? undefined,
  };
}

export async function deleteTasksByLeadIds(leadIds: string[]): Promise<number> {
  if (leadIds.length === 0) return 0;
  const supabase = getSupabase();
  const { error } = await supabase.from("tasks").delete().in("lead_id", leadIds);
  if (error) throw error;
  return leadIds.length; // estimate; activity cascades from leads
}

export async function updateTask(taskId: string, updates: Partial<Task>): Promise<Task | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", taskId)
    .select()
    .single();
  if (error && error.code !== "PGRST116") throw error;
  if (!data) return null;
  return {
    id: data.id,
    title: data.title,
    due: data.due,
    assignee: data.assignee,
    done: data.done ?? false,
    lead_id: data.lead_id ?? undefined,
    renewal_deal_id: data.renewal_deal_id ?? undefined,
  };
}
