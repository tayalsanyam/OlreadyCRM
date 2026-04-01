import { getSheetsClient, getSpreadsheetId, SHEET_NAMES, ensureSheetExists } from "../sheets";
import type { Task } from "../types";

const TASK_HEADERS = ["id", "title", "due", "assignee", "done", "lead_id", "renewal_deal_id"];

function rowToTask(row: unknown[]): Task {
  return {
    id: String(row[0] ?? ""),
    title: String(row[1] ?? ""),
    due: String(row[2] ?? ""),
    assignee: String(row[3] ?? ""),
    done: row[4] === true || row[4] === "TRUE" || row[4] === "1",
    lead_id: row[5] ? String(row[5]) : undefined,
    renewal_deal_id: row[6] ? String(row[6]) : undefined,
  };
}

export async function getTasks(filters?: {
  assignee?: string;
  assignees?: string[];
  done?: boolean;
  lead_id?: string;
}): Promise<Task[]> {
  await ensureSheetExists(SHEET_NAMES.TASKS, TASK_HEADERS);
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${SHEET_NAMES.TASKS}!A2:G`,
  });
  const rows = (res.data.values ?? []) as unknown[][];
  let tasks = rows
    .filter((r) => Array.isArray(r) && r[0])
    .map(rowToTask);
  if (filters?.assignee) tasks = tasks.filter((t) => t.assignee === filters.assignee);
  if (filters?.assignees?.length)
    tasks = tasks.filter((t) => filters.assignees!.includes(t.assignee));
  if (filters?.done !== undefined) tasks = tasks.filter((t) => t.done === filters.done);
  if (filters?.lead_id) tasks = tasks.filter((t) => t.lead_id === filters.lead_id);
  return tasks;
}

export async function createTask(task: Omit<Task, "id">): Promise<Task> {
  const newTask: Task = { ...task, id: `T${Date.now()}` };
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: `${SHEET_NAMES.TASKS}!A:G`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[newTask.id, newTask.title, newTask.due, newTask.assignee, newTask.done ? "TRUE" : "", newTask.lead_id ?? "", newTask.renewal_deal_id ?? ""]],
    },
  });
  return newTask;
}

export async function updateTask(taskId: string, updates: Partial<Task>): Promise<Task | null> {
  const sheets = getSheetsClient();
  const id = getSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${SHEET_NAMES.TASKS}!A2:G`,
  });
  const rows = (res.data.values ?? []) as unknown[][];
  const rowIdx = rows.findIndex((r) => Array.isArray(r) && String(r[0]) === taskId);
  if (rowIdx < 0) return null;
  const row = rows[rowIdx];
  if (!row) return null;
  const existing = rowToTask(row);
  const merged = { ...existing, ...updates };
  const rowNum = rowIdx + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${SHEET_NAMES.TASKS}!A${rowNum}:G${rowNum}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[merged.id, merged.title, merged.due, merged.assignee, merged.done ? "TRUE" : "", merged.lead_id ?? "", merged.renewal_deal_id ?? ""]],
    },
  });
  return merged;
}
