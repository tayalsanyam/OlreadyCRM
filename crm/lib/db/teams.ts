import { getSupabase } from "../supabase";
import type { Team } from "../types";

export async function getTeams(): Promise<Team[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("teams").select("team_id, team_name, bdm").order("team_id");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    team_id: r.team_id,
    team_name: r.team_name,
    bdm: r.bdm,
  }));
}

export async function getBdmsForTeam(teamId: string): Promise<string[]> {
  const teams = await getTeams();
  return teams.filter((t) => t.team_id === teamId).map((t) => t.bdm);
}

export async function saveTeams(teams: Team[]): Promise<void> {
  const supabase = getSupabase();
  const { error: delErr } = await supabase.from("teams").delete().neq("id", 0);
  if (delErr) throw delErr;
  if (teams.length === 0) return;
  const rows = teams.map((t) => ({ team_id: t.team_id, team_name: t.team_name, bdm: t.bdm }));
  const { error: insErr } = await supabase.from("teams").insert(rows);
  if (insErr) throw insErr;
}
