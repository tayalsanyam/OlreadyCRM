import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAdmin } from "@/lib/auth";
import { getLeads } from "@/lib/leads";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!requireAdmin(session)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const filters: Record<string, string | string[] | undefined> = {};
  const statuses = searchParams.get("statuses");
  if (statuses) filters.statuses = statuses.split(",").map((s) => s.trim()).filter(Boolean);
  const bdm = searchParams.get("bdm");
  if (bdm) filters.bdm = bdm;
  const search = searchParams.get("search");
  if (search) filters.search = search;
  const datePreset = searchParams.get("datePreset");
  if (datePreset) filters.datePreset = datePreset;
  const dateFrom = searchParams.get("dateFrom");
  if (dateFrom) filters.dateFrom = dateFrom;
  const dateTo = searchParams.get("dateTo");
  if (dateTo) filters.dateTo = dateTo;

  const leads = await getLeads(filters);
  const headers = [
    "id", "name", "city", "company", "email", "phone", "insta_id",
    "bdm", "plan", "status", "source", "remarks", "connected_on",
    "next_follow_up", "committed_date", "original_price", "discount",
    "amount_paid", "amount_balance", "payment_status", "payment_mode",
    "if_part", "created_at", "last_modified",
  ];
  const rows = leads.map((l) =>
    headers.map((h) => {
      const v = (l as unknown as Record<string, unknown>)[h];
      if (v === undefined || v === null) return "";
      if (typeof v === "boolean") return v ? "TRUE" : "";
      return String(v);
    })
  );
  const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=leads-export.csv",
    },
  });
}
