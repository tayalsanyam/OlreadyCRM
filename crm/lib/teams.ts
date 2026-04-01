import { isSupabaseConfigured } from "./supabase";
import * as dbTeams from "./db/teams";
import * as sheetTeams from "./db/teams-sheets";
import type { Team } from "./types";

const useSupabase = () => isSupabaseConfigured();

export async function getTeams(): Promise<Team[]> {
  return useSupabase() ? dbTeams.getTeams() : sheetTeams.getTeams();
}

export async function getBdmsForTeam(teamId: string): Promise<string[]> {
  return useSupabase() ? dbTeams.getBdmsForTeam(teamId) : sheetTeams.getBdmsForTeam(teamId);
}

export async function saveTeams(teams: Team[]): Promise<void> {
  return useSupabase() ? dbTeams.saveTeams(teams) : sheetTeams.saveTeams(teams);
}
