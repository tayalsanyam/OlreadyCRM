import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getSheetsClient, getSpreadsheetId } from "@/lib/sheets";
import { getUsers } from "@/lib/users";

export async function GET() {
  try {
    if (isSupabaseConfigured()) {
      const users = await getUsers();
      const hasAdmin = users.some((u) => u.role === "admin");
      return NextResponse.json({ ok: true, hasAdmin, userCount: users.length, db: "supabase" });
    }
    getSheetsClient();
    getSpreadsheetId();
    const users = await getUsers();
    const hasAdmin = users.some((u) => u.role === "admin");
    return NextResponse.json({ ok: true, hasAdmin, userCount: users.length, db: "sheets" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
