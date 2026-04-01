import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAdmin } from "@/lib/auth";
import { deleteUser, getUsers, updateUser } from "@/lib/users";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!requireAdmin(session)) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const { id } = await params;
  if (session.user.id === id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }
  const users = await getUsers();
  const admins = users.filter((u) => u.role === "admin");
  const target = users.find((u) => u.id === id);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.role === "admin" && admins.length <= 1) {
    return NextResponse.json({ error: "Cannot delete the last admin" }, { status: 400 });
  }
  try {
    await deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!requireAdmin(session)) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const { id } = await params;
  const body = await request.json();
  const updates: Parameters<typeof updateUser>[1] = {};
  if (body.username != null) updates.username = body.username;
  if (body.role != null) updates.role = body.role;
  if (body.assigned_bdm != null) updates.assigned_bdm = body.assigned_bdm;
  if (body.team_id != null) updates.team_id = body.team_id;
  if (body.email != null) updates.email = body.email;
  if (body.password) updates.password = body.password;
  try {
    await updateUser(id, updates);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}
