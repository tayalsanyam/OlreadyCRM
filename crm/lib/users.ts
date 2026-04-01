import { isSupabaseConfigured } from "./supabase";
import * as dbUsers from "./db/users";
import * as sheetUsers from "./db/users-sheets";
import type { User } from "./types";

const useSupabase = () => isSupabaseConfigured();

export async function getUsers(): Promise<User[]> {
  return useSupabase() ? dbUsers.getUsers() : sheetUsers.getUsers();
}

export async function getUserByUsername(username: string): Promise<User | null> {
  return useSupabase() ? dbUsers.getUserByUsername(username) : sheetUsers.getUserByUsername(username);
}

export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return dbUsers.verifyPassword(user, password);
}

export async function createUser(
  username: string,
  password: string,
  role: User["role"],
  assigned_bdm?: string,
  team_id?: string,
  email?: string
): Promise<User> {
  return useSupabase()
    ? dbUsers.createUser(username, password, role, assigned_bdm, team_id, email)
    : sheetUsers.createUser(username, password, role, assigned_bdm, team_id, email);
}

export async function getUserById(id: string): Promise<User | null> {
  return useSupabase() ? dbUsers.getUserById(id) : sheetUsers.getUserById(id);
}

export async function updateUser(
  id: string,
  updates: Partial<Pick<User, "username" | "role" | "assigned_bdm" | "team_id" | "email">> & { password?: string }
): Promise<void> {
  return useSupabase() ? dbUsers.updateUser(id, updates) : sheetUsers.updateUser(id, updates);
}

export async function deleteUser(id: string): Promise<void> {
  return useSupabase() ? dbUsers.deleteUser(id) : sheetUsers.deleteUser(id);
}
