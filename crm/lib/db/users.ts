import bcrypt from "bcryptjs";
import { getSupabase } from "../supabase";
import type { User } from "../types";

export async function getUsers(): Promise<User[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("users").select("*").order("username");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    username: r.username,
    password_hash: r.password_hash,
    role: r.role,
    assigned_bdm: r.assigned_bdm ?? undefined,
    team_id: r.team_id ?? undefined,
    email: r.email ?? undefined,
  }));
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .ilike("username", username)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  if (!data) return null;
  return {
    id: data.id,
    username: data.username,
    password_hash: data.password_hash,
    role: data.role,
    assigned_bdm: data.assigned_bdm ?? undefined,
    team_id: data.team_id ?? undefined,
    email: data.email ?? undefined,
  };
}

export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.password_hash);
}

export async function   createUser(
  username: string,
  password: string,
  role: User["role"],
  assigned_bdm?: string,
  team_id?: string,
  email?: string
): Promise<User> {
  const hash = await bcrypt.hash(password, 10);
  const userId = `U${Date.now()}`;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("users")
    .insert({
      id: userId,
      username,
      password_hash: hash,
      role,
      assigned_bdm: assigned_bdm ?? null,
      team_id: team_id ?? null,
      email: email ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    username: data.username,
    password_hash: data.password_hash,
    role: data.role,
    assigned_bdm: data.assigned_bdm ?? undefined,
    team_id: data.team_id ?? undefined,
  };
}

export async function getUserById(id: string): Promise<User | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("users").select("*").eq("id", id).single();
  if (error && error.code !== "PGRST116") throw error;
  if (!data) return null;
  return {
    id: data.id,
    username: data.username,
    password_hash: data.password_hash,
    role: data.role,
    assigned_bdm: data.assigned_bdm ?? undefined,
    team_id: data.team_id ?? undefined,
    email: data.email ?? undefined,
  };
}

export async function updateUser(
  id: string,
  updates: Partial<Pick<User, "username" | "role" | "assigned_bdm" | "team_id" | "email">> & { password?: string }
): Promise<void> {
  const supabase = getSupabase();
  const { password, ...rest } = updates;
  const payload: Record<string, unknown> = { ...rest };
  if (password) {
    const bcrypt = await import("bcryptjs");
    payload.password_hash = await bcrypt.hash(password, 10);
  }
  const { error } = await supabase.from("users").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteUser(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("users").delete().eq("id", id);
  if (error) throw error;
}
