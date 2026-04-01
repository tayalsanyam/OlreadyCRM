import { getSheetsClient, getSpreadsheetId, SHEET_NAMES, ensureSheetExists } from "../sheets";

const BDMS_HEADERS = ["bdm", "target"];
const PLANS_HEADERS = ["plan", "price", "active"];
const DEFAULT_TARGET = 100000;

export async function getBDMs(): Promise<string[]> {
  await ensureSheetExists(SHEET_NAMES.BDMS, BDMS_HEADERS);
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${SHEET_NAMES.BDMS}!A2:A`,
    });
    const rows = (res.data.values ?? []) as unknown[][];
    return rows.map((r) => String(r[0] ?? "").trim()).filter(Boolean);
  } catch {
    return ["GAURAV", "GURKIRAN", "HARSHA", "VISHAL", "SIMRAN", "TRISHNA"];
  }
}

export async function getBDMTargets(): Promise<Record<string, number>> {
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${SHEET_NAMES.BDMS}!A2:B`,
    });
    const rows = (res.data.values ?? []) as unknown[][];
    const out: Record<string, number> = {};
    for (const r of rows) {
      const name = String(r[0] ?? "").trim();
      if (!name) continue;
      const t = Number(r[1]);
      out[name] = !isNaN(t) && t > 0 ? t : DEFAULT_TARGET;
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveBDMTargets(targets: Record<string, number>): Promise<void> {
  const bdms = await getBDMs();
  const values = [BDMS_HEADERS, ...bdms.map((b) => [b, targets[b] ?? DEFAULT_TARGET])];
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${SHEET_NAMES.BDMS}!A1:B${values.length}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

export async function getPlans(): Promise<{ name: string; price: number; active: boolean }[]> {
  await ensureSheetExists(SHEET_NAMES.PLANS, PLANS_HEADERS);
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${SHEET_NAMES.PLANS}!A2:C`,
    });
    const rows = (res.data.values ?? []) as unknown[][];
    return rows
      .filter((r) => r?.[0])
      .map((r) => ({
        name: String(r[0] ?? "").trim(),
        price: Number(r[1] ?? 0) || 0,
        active: r[2] !== false && r[2] !== "FALSE" && r[2] !== "0",
      }))
      .filter((p) => p.name);
  } catch {
    return [
      { name: "Prime 7k", price: 7000, active: true },
      { name: "Pro 14k", price: 14000, active: true },
      { name: "Phoenix 18k", price: 18000, active: true },
    ];
  }
}

export async function saveBDMs(bdms: string[]): Promise<void> {
  const current = await getBDMs();
  const newSet = new Set(bdms.map((b) => b.trim()).filter(Boolean));
  const removed = current.filter((b) => !newSet.has(b));

  for (const bdm of removed) {
    const ranges = [
      { range: `${SHEET_NAMES.LEADS}!A2:X`, col: 7 },
      { range: `${SHEET_NAMES.TASKS}!A2:F`, col: 3 },
      { range: `${SHEET_NAMES.TEAMS}!A2:C`, col: 2 },
      { range: `${SHEET_NAMES.BDM_LOG}!A2:G`, col: 1 },
      { range: `${SHEET_NAMES.USERS}!A2:G`, col: 4 },
    ];
    for (const { range: r, col } of ranges) {
      await replaceInSheet(r, col, bdm, "");
    }
  }

  const targets = await getBDMTargets();
  const values = [BDMS_HEADERS, ...bdms.map((b) => [b.trim(), targets[b.trim()] ?? DEFAULT_TARGET]).filter(([b]) => b)];
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${SHEET_NAMES.BDMS}!A1:B${values.length}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

export async function savePlans(plans: { name: string; price: number; active?: boolean }[]): Promise<void> {
  const values = [PLANS_HEADERS, ...plans.filter((p) => p.name?.trim()).map((p) => [p.name, p.price, (p.active ?? true) ? "TRUE" : "FALSE"])];
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${SHEET_NAMES.PLANS}!A1:C${values.length}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

async function replaceInSheet(
  range: string,
  colIndex: number,
  oldVal: string,
  newVal: string
): Promise<void> {
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range });
  const rows = (res.data.values ?? []) as unknown[][];
  if (rows.length === 0) return;
  for (const row of rows) {
    if (String(row[colIndex] ?? "").trim() === oldVal) row[colIndex] = newVal;
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });
}

export async function renameBDM(oldName: string, newName: string): Promise<void> {
  const trimmedOld = oldName.trim();
  const trimmedNew = newName.trim();
  if (!trimmedOld || !trimmedNew) throw new Error("Old and new BDM names required");
  if (trimmedOld === trimmedNew) throw new Error("New name must differ from current name");

  const existing = await getBDMs();
  if (existing.includes(trimmedNew) && trimmedNew !== trimmedOld) {
    throw new Error(`BDM "${trimmedNew}" already exists`);
  }

  const ranges = [
    { range: `${SHEET_NAMES.BDMS}!A2:B`, col: 0 },
    { range: `${SHEET_NAMES.LEADS}!A2:X`, col: 7 },
    { range: `${SHEET_NAMES.TASKS}!A2:F`, col: 3 },
    { range: `${SHEET_NAMES.TEAMS}!A2:C`, col: 2 },
    { range: `${SHEET_NAMES.BDM_LOG}!A2:G`, col: 1 },
    { range: `${SHEET_NAMES.USERS}!A2:G`, col: 4 },
  ];
  for (const { range: r, col } of ranges) {
    await replaceInSheet(r, col, trimmedOld, trimmedNew);
  }
}
