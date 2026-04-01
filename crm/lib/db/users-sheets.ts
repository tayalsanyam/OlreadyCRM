import bcrypt from "bcryptjs";
import { getSheetsClient, getSpreadsheetId, SHEET_NAMES, ensureSheetExists } from "../sheets";
import type { User } from "../types";

const USER_HEADERS = ["id", "username", "password_hash", "role", "assigned_bdm", "team_id", "email"];

function rowToUser(row: unknown[]): User {
  return {
    id: String(row[0] ?? ""),
    username: String(row[1] ?? ""),
    password_hash: String(row[2] ?? ""),
    role: (row[3] as User["role"]) ?? "bdm",
    assigned_bdm: row[4] ? String(row[4]) : undefined,
    team_id: row[5] ? String(row[5]) : undefined,
    email: row[6] ? String(row[6]) : undefined,
  };
}

export async function getUsers(): Promise<User[]> {
  await ensureSheetExists(SHEET_NAMES.USERS, USER_HEADERS);
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${SHEET_NAMES.USERS}!A2:G`,
  });
  const rows = (res.data.values ?? []) as unknown[][];
  return rows.filter((r) => r?.[1]).map(rowToUser);
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const users = await getUsers();
  return users.find((u) => u.username.toLowerCase() === username.toLowerCase()) ?? null;
}

export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.password_hash);
}

export async function createUser(
  username: string,
  password: string,
  role: User["role"],
  assigned_bdm?: string,
  team_id?: string,
  email?: string
): Promise<User> {
  const hash = await bcrypt.hash(password, 10);
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const userId = `U${Date.now()}`;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${SHEET_NAMES.USERS}!A:G`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[userId, username, hash, role, assigned_bdm ?? "", team_id ?? "", email ?? ""]],
    },
  });
  return { id: userId, username, password_hash: hash, role, assigned_bdm, team_id, email };
}

export async function getUserById(id: string): Promise<User | null> {
  const users = await getUsers();
  return users.find((u) => u.id === id) ?? null;
}

export async function updateUser(
  id: string,
  updates: Partial<Pick<User, "username" | "role" | "assigned_bdm" | "team_id" | "email">> & { password?: string }
): Promise<void> {
  const users = await getUsers();
  const user = users.find((u) => u.id === id);
  if (!user) throw new Error("User not found");
  const password_hash = updates.password ? await bcrypt.hash(updates.password, 10) : user.password_hash;
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${SHEET_NAMES.USERS}!A2:A`,
  });
  const ids = ((res.data.values ?? []) as unknown[][]).flat();
  const rowIdx = ids.findIndex((x) => String(x) === id);
  if (rowIdx < 0) throw new Error("User not found");
  const rowNum = rowIdx + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${SHEET_NAMES.USERS}!A${rowNum}:G${rowNum}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        user.id,
        updates.username ?? user.username,
        password_hash,
        updates.role ?? user.role,
        updates.assigned_bdm ?? user.assigned_bdm ?? "",
        updates.team_id ?? user.team_id ?? "",
        updates.email ?? user.email ?? "",
      ]],
    },
  });
}

export async function deleteUser(id: string): Promise<void> {
  const meta = await getSheetsClient().spreadsheets.get({ spreadsheetId: getSpreadsheetId() });
  const userSheet = meta.data.sheets?.find((s) => s.properties?.title === SHEET_NAMES.USERS);
  const sheetId = userSheet?.properties?.sheetId ?? 0;
  const users = await getUsers();
  const rowIdx = users.findIndex((u) => u.id === id);
  if (rowIdx < 0) throw new Error("User not found");
  const sheets = getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const rowNum = rowIdx + 2;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowNum - 1, endIndex: rowNum } } }],
    },
  });
}
