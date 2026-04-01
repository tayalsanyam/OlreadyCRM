import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

export function getSheetsClient() {
  let creds = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!creds && process.env.GOOGLE_SERVICE_ACCOUNT_PATH) {
    try {
      const fs = require("fs");
      const path = require("path");
      const p = path.resolve(process.cwd(), process.env.GOOGLE_SERVICE_ACCOUNT_PATH);
      creds = fs.readFileSync(p, "utf8");
    } catch (e) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_PATH: " + String(e));
    }
  }
  if (!creds) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SERVICE_ACCOUNT_PATH required");
  let key: object;
  try {
    key = typeof creds === "string" ? JSON.parse(creds) : creds;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY must be valid JSON");
  }
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: SCOPES,
  });
  return google.sheets({ version: "v4", auth });
}

export function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error("GOOGLE_SPREADSHEET_ID required");
  return id;
}

export const SHEET_NAMES = {
  LEADS: "Leads",
  ACTIVITY: "Activity",
  CONFIG: "Config",
  BDM_LOG: "BDM_Log",
  USERS: "Users",
  BDMS: "BDMs",
  PLANS: "Plans",
  TASKS: "Tasks",
  TEAMS: "Teams",
} as const;

export async function ensureSheetExists(sheetName: string, headers: string[]): Promise<void> {
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
  const exists = meta?.data?.sheets?.some((s) => s?.properties?.title === sheetName);
  if (exists) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    },
  });
  const col = String.fromCharCode(64 + Math.min(headers.length, 26));
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${sheetName}!A1:${col}1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [headers] },
  });
}
