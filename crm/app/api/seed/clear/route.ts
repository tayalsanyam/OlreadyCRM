import { NextResponse } from "next/server";
import { getSession, requireAdmin } from "@/lib/auth";
import { getLeads, deleteLeadsBySource } from "@/lib/leads";
import { deleteTasksByLeadIds } from "@/lib/tasks";
import { isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Remove seed data: leads with source=seed and their linked tasks.
 * Requires Supabase (Sheets not supported).
 */
export async function POST() {
  try {
    const session = await getSession();
    if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!requireAdmin(session)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Clear seed requires Supabase. Google Sheets mode not supported." },
        { status: 400 }
      );
    }

    const seedLeads = await getLeads({ source: "seed" });
    const leadIds = seedLeads.map((l) => l.id);
    if (leadIds.length === 0) {
      return NextResponse.json({ ok: true, cleared: 0, message: "No seed data found" });
    }

    await deleteTasksByLeadIds(leadIds);
    const cleared = await deleteLeadsBySource("seed");

    return NextResponse.json({ ok: true, cleared, message: `Removed ${cleared} sample leads` });
  } catch (e) {
    console.error("Clear seed error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
