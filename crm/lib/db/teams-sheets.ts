import { getSheetsClient, getSpreadsheetId, SHEET_NAMES, ensureSheetExists } from "../sheets";
import type { Team } from "../types";

const TEAM_HEADERS = ["team_id", "team_name", "bdm"];

export async function getTeams(): Promise<Team[]> {
  await ensureSheetExists(SHEET_NAMES.TEAMS, TEAM_HEADERS);
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${SHEET_NAMES.TEAMS}!A2:C`,
    });
    const rows = (res.data.values ?? []) as unknown[][];
    return rows
      .filter((r) => r?.[0])
      .map((r) => ({
        team_id: String(r[0]),
        team_name: String(r[1] ?? ""),
        bdm: String(r[2] ?? ""),
      }));
  } catch {
    return [];
  }
}

export async function getBdmsForTeam(teamId: string): Promise<string[]> {
  const teams = await getTeams();
  return teams.filter((t) => t.team_id === teamId).map((t) => t.bdm);
}

export async function saveTeams(teams: Team[]): Promise<void> {
  await ensureSheetExists(SHEET_NAMES.TEAMS, TEAM_HEADERS);
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  const values = [TEAM_HEADERS, ...teams.map((t) => [t.team_id, t.team_name, t.bdm])];
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${SHEET_NAMES.TEAMS}!A1:C${values.length}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}
