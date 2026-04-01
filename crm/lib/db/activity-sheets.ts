import { getSheetsClient, getSpreadsheetId, SHEET_NAMES, ensureSheetExists } from "../sheets";

const ACTIVITY_HEADERS = ["id", "lead_id", "date", "time", "action", "user", "notes", "status", "remarks", "next_connect"];

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
  await ensureSheetExists(SHEET_NAMES.ACTIVITY, ACTIVITY_HEADERS);
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  const activityId = `A${Date.now()}`;
  const date = new Date().toISOString().split("T")[0];
  const time = getTimeIST();
  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: `${SHEET_NAMES.ACTIVITY}!A:J`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        activityId, leadId, date, time, action, user,
        notes ?? "", opts?.status ?? "", opts?.remarks ?? "", opts?.next_connect ?? "",
      ]],
    },
  });
}

export async function getActivityLog(filters?: { lead_id?: string; dateFrom?: string; dateTo?: string }): Promise<ActivityEntry[]> {
  await ensureSheetExists(SHEET_NAMES.ACTIVITY, ACTIVITY_HEADERS);
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${SHEET_NAMES.ACTIVITY}!A2:J`,
  });
  const rows = (res.data.values ?? []) as unknown[][];
  let entries = rows
    .filter((r) => Array.isArray(r) && r[0] && r[1])
    .map((r) => ({
      id: String(r[0]),
      lead_id: String(r[1]),
      date: String(r[2]),
      time: String(r[3]),
      action: String(r[4] ?? ""),
      user: r[5] ? String(r[5]) : undefined,
      notes: r[6] ? String(r[6]) : undefined,
      status: r[7] ? String(r[7]) : undefined,
      remarks: r[8] ? String(r[8]) : undefined,
      next_connect: r[9] ? String(r[9]) : undefined,
    }));
  if (filters?.lead_id) entries = entries.filter((e) => e.lead_id === filters.lead_id);
  if (filters?.dateFrom) entries = entries.filter((e) => e.date >= filters.dateFrom!);
  if (filters?.dateTo) entries = entries.filter((e) => e.date <= filters.dateTo!);
  entries.sort((a, b) => {
    const d = `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
    return d ? -d : 0;
  });
  return entries;
}
