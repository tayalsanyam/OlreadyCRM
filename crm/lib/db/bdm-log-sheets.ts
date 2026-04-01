import { getSheetsClient, getSpreadsheetId, SHEET_NAMES, ensureSheetExists } from "../sheets";
import type { BDMLogEntry } from "../types";

const HEADERS = ["id", "bdm", "date", "total_calls", "connected_calls", "non_answered_calls", "talk_time"];

export async function getBDMLogs(filters?: { bdm?: string; dateFrom?: string; dateTo?: string }): Promise<BDMLogEntry[]> {
  await ensureSheetExists(SHEET_NAMES.BDM_LOG, HEADERS);
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${SHEET_NAMES.BDM_LOG}!A2:G`,
  });
  const rows = (res.data.values ?? []) as unknown[][];
  let entries = rows
    .filter((r) => Array.isArray(r) && r[0])
    .map((r) => ({
      id: String(r[0]),
      bdm: String(r[1]),
      date: String(r[2]),
      total_calls: Number(r[3]) || 0,
      connected_calls: Number(r[4]) || 0,
      non_answered_calls: Number(r[5]) || 0,
      talk_time: Number(r[6]) || 0,
    }));
  if (filters?.bdm) entries = entries.filter((e) => e.bdm === filters.bdm);
  if (filters?.dateFrom) entries = entries.filter((e) => e.date >= filters.dateFrom!);
  if (filters?.dateTo) entries = entries.filter((e) => e.date <= filters.dateTo!);
  return entries;
}

export async function addBDMLog(entry: Omit<BDMLogEntry, "id">): Promise<BDMLogEntry> {
  const newEntry: BDMLogEntry = { ...entry, id: `B${Date.now()}` };
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: `${SHEET_NAMES.BDM_LOG}!A:G`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        newEntry.id, newEntry.bdm, newEntry.date,
        newEntry.total_calls, newEntry.connected_calls, newEntry.non_answered_calls, newEntry.talk_time,
      ]],
    },
  });
  return newEntry;
}
