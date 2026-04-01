import { isSupabaseConfigured } from "./supabase";
import * as dbTasks from "./db/tasks";
import * as sheetTasks from "./db/tasks-sheets";
import type { Task } from "./types";

const useSupabase = () => isSupabaseConfigured();

export async function getTasks(filters?: {
  assignee?: string;
  assignees?: string[];
  done?: boolean;
  lead_id?: string;
}): Promise<Task[]> {
  return useSupabase() ? dbTasks.getTasks(filters) : sheetTasks.getTasks(filters);
}

export async function createTask(task: Omit<Task, "id">): Promise<Task> {
  return useSupabase() ? dbTasks.createTask(task) : sheetTasks.createTask(task);
}

export async function updateTask(taskId: string, updates: Partial<Task>): Promise<Task | null> {
  return useSupabase() ? dbTasks.updateTask(taskId, updates) : sheetTasks.updateTask(taskId, updates);
}

export async function deleteTasksByLeadIds(leadIds: string[]): Promise<number> {
  return useSupabase() ? dbTasks.deleteTasksByLeadIds(leadIds) : 0;
}
