import { NextRequest, NextResponse } from "next/server";
import { createUser } from "@/lib/users";
import { isSupabaseConfigured } from "@/lib/supabase";
import { ensureSheetExists, SHEET_NAMES } from "@/lib/sheets";

const LEADS_HEADERS = [
  "id", "name", "city", "company", "email", "phone", "insta_id",
  "bdm", "plan", "status", "source", "remarks", "connected_on",
  "next_follow_up", "committed_date", "original_price", "discount",
  "amount_paid", "amount_balance", "payment_status", "payment_mode",
  "if_part", "created_at", "last_modified",
];

export async function POST(request: NextRequest) {
  try {
    const { createAdmin, username, password } = await request.json();
    if (!createAdmin || !username || !password)
      return NextResponse.json({ error: "createAdmin, username, password required" }, { status: 400 });

    if (!isSupabaseConfigured()) {
      await ensureSheetExists(SHEET_NAMES.LEADS, LEADS_HEADERS);
      await ensureSheetExists(SHEET_NAMES.USERS, ["id", "username", "password_hash", "role", "assigned_bdm", "team_id"]);
      await ensureSheetExists(SHEET_NAMES.BDMS, ["bdm", "target"]);
      await ensureSheetExists(SHEET_NAMES.PLANS, ["plan", "price"]);
      await ensureSheetExists(SHEET_NAMES.TASKS, ["id", "title", "due", "assignee", "done", "lead_id"]);
      await ensureSheetExists(SHEET_NAMES.ACTIVITY, ["id", "lead_id", "date", "time", "action", "user", "notes", "status", "remarks", "next_connect"]);
      await ensureSheetExists(SHEET_NAMES.BDM_LOG, ["id", "bdm", "date", "total_calls", "connected_calls", "non_answered_calls", "talk_time"]);
      await ensureSheetExists(SHEET_NAMES.TEAMS, ["team_id", "team_name", "bdm"]);
    }

    await createUser(username, password, "admin");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Setup error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
