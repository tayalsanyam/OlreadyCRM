import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAdmin } from "@/lib/auth";
import { getActivityLog } from "@/lib/activity";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!requireAdmin(session)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const filters: { dateFrom?: string; dateTo?: string } = {};
  if (dateFrom) filters.dateFrom = dateFrom;
  if (dateTo) filters.dateTo = dateTo;

  const logs = await getActivityLog(Object.keys(filters).length ? filters : undefined);
  const headers = ["id", "lead_id", "date", "time", "action", "user", "notes", "status", "remarks", "next_connect"];
  const rows = logs.map((l) =>
    headers.map((h) => {
      const v = (l as unknown as Record<string, unknown>)[h];
      if (v === undefined || v === null) return "";
      return String(v).replace(/"/g, '""');
    })
  );
  const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=activity-log-export.csv",
    },
  });
}
