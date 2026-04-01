import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAdmin } from "@/lib/auth";
import { renameBDM } from "@/lib/config";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!requireAdmin(session)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await request.json();
  const oldName = body.oldName ?? body.old_name;
  const newName = body.newName ?? body.new_name;

  if (typeof oldName !== "string" || typeof newName !== "string") {
    return NextResponse.json({ error: "oldName and newName required" }, { status: 400 });
  }

  try {
    await renameBDM(oldName, newName);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Rename failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
