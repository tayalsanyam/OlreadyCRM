import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAdmin } from "@/lib/auth";
import { getUsers, createUser } from "@/lib/users";

export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!requireAdmin(session)) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const users = await getUsers();
  return NextResponse.json(
    users.map((u) => ({ ...u, password_hash: "[HIDDEN]", email: u.email ?? "" }))
  );
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!requireAdmin(session)) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const { username, password, role, assigned_bdm, team_id, email } = await request.json();
  if (!username || !password || !role)
    return NextResponse.json({ error: "username, password, role required" }, { status: 400 });
  const user = await createUser(username, password, role, assigned_bdm, team_id, email);
  return NextResponse.json(user);
}
