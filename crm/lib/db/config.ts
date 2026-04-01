import { getSupabase } from "../supabase";

const DEFAULT_TARGET = 100000;

export async function getBDMs(): Promise<string[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("bdms").select("bdm").order("bdm");
  if (error) throw error;
  return (data ?? []).map((r) => r.bdm).filter(Boolean);
}

export async function getBDMTargets(): Promise<Record<string, number>> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("bdms").select("bdm, target");
  if (error) throw error;
  const out: Record<string, number> = {};
  for (const r of data ?? []) {
    out[r.bdm] = r.target > 0 ? r.target : DEFAULT_TARGET;
  }
  return out;
}

export async function saveBDMTargets(targets: Record<string, number>): Promise<void> {
  const supabase = getSupabase();
  for (const [bdm, target] of Object.entries(targets)) {
    const { error } = await supabase.from("bdms").upsert({ bdm, target }, { onConflict: "bdm" });
    if (error) throw error;
  }
}

export type Plan = { name: string; price: number; active: boolean };

export async function getPlans(): Promise<Plan[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("plans").select("plan, price, active").order("plan");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    name: r.plan,
    price: Number(r.price) || 0,
    active: r.active === true || r.active === "TRUE" || r.active === "1",
  }));
}

export async function saveBDMs(bdms: string[]): Promise<void> {
  const supabase = getSupabase();
  const current = await getBDMs();
  const newSet = new Set(bdms.map((b) => b.trim()).filter(Boolean));
  const removed = current.filter((b) => !newSet.has(b));

  for (const bdm of removed) {
    await supabase.from("leads").update({ bdm: "" }).eq("bdm", bdm);
    await supabase.from("tasks").update({ assignee: "" }).eq("assignee", bdm);
    await supabase.from("teams").update({ bdm: "" }).eq("bdm", bdm);
    await supabase.from("bdm_log").update({ bdm: "" }).eq("bdm", bdm);
    await supabase.from("users").update({ assigned_bdm: null }).eq("assigned_bdm", bdm);
    const { error } = await supabase.from("bdms").delete().eq("bdm", bdm);
    if (error) throw error;
  }

  const targets = await getBDMTargets();
  for (const bdm of bdms) {
    const trimmed = bdm.trim();
    if (!trimmed) continue;
    const { error } = await supabase.from("bdms").upsert({ bdm: trimmed, target: targets[trimmed] ?? DEFAULT_TARGET }, { onConflict: "bdm" });
    if (error) throw error;
  }
}

export async function renameBDM(oldName: string, newName: string): Promise<void> {
  const trimmedOld = oldName.trim();
  const trimmedNew = newName.trim();
  if (!trimmedOld || !trimmedNew) throw new Error("Old and new BDM names required");
  if (trimmedOld === trimmedNew) throw new Error("New name must differ from current name");

  const existing = await getBDMs();
  if (existing.includes(trimmedNew)) throw new Error(`BDM "${trimmedNew}" already exists`);

  const supabase = getSupabase();
  const { data: oldRow } = await supabase.from("bdms").select("target").eq("bdm", trimmedOld).single();
  const target = oldRow?.target ?? DEFAULT_TARGET;

  const { error: leadsErr } = await supabase.from("leads").update({ bdm: trimmedNew }).eq("bdm", trimmedOld);
  if (leadsErr) throw leadsErr;
  const { error: tasksErr } = await supabase.from("tasks").update({ assignee: trimmedNew }).eq("assignee", trimmedOld);
  if (tasksErr) throw tasksErr;
  const { error: teamsErr } = await supabase.from("teams").update({ bdm: trimmedNew }).eq("bdm", trimmedOld);
  if (teamsErr) throw teamsErr;
  const { error: logErr } = await supabase.from("bdm_log").update({ bdm: trimmedNew }).eq("bdm", trimmedOld);
  if (logErr) throw logErr;
  const { error: usersErr } = await supabase.from("users").update({ assigned_bdm: trimmedNew }).eq("assigned_bdm", trimmedOld);
  if (usersErr) throw usersErr;

  const { error: delErr } = await supabase.from("bdms").delete().eq("bdm", trimmedOld);
  if (delErr) throw delErr;
  const { error: insErr } = await supabase.from("bdms").insert({ bdm: trimmedNew, target });
  if (insErr) throw insErr;
}

export async function getOpsCoordinators(): Promise<string[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("ops_coordinators").select("name").order("name");
  if (error) throw error;
  return (data ?? []).map((r) => r.name).filter(Boolean);
}

export async function saveOpsCoordinators(names: string[]): Promise<void> {
  const supabase = getSupabase();
  const current = await getOpsCoordinators();
  const newSet = new Set(names.map((n) => n.trim()).filter(Boolean));
  const removed = current.filter((n) => !newSet.has(n));
  for (const name of removed) {
    const { error } = await supabase.from("ops_coordinators").delete().eq("name", name);
    if (error) throw error;
  }
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const { error } = await supabase.from("ops_coordinators").upsert({ name: trimmed }, { onConflict: "name" });
    if (error) throw error;
  }
}


export async function savePlans(plans: { name: string; price: number; active?: boolean }[]): Promise<void> {
  const supabase = getSupabase();
  for (const p of plans) {
    if (!p.name?.trim()) continue;
    const { error } = await supabase
      .from("plans")
      .upsert({ plan: p.name.trim(), price: p.price, active: p.active !== false }, { onConflict: "plan" });
    if (error) throw error;
  }
}
