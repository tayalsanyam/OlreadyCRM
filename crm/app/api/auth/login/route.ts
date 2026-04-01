import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserByUsername, verifyPassword } from "@/lib/users";

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    if (!username || !password)
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    const user = await getUserByUsername(username);
    if (!user) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    const ok = await verifyPassword(user, password);
    if (!ok) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    const session = await getSession();
    session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      assigned_bdm: user.assigned_bdm,
      team_id: user.team_id,
    };
    await session.save();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Login error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
