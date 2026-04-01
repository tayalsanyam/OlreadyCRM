import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBDMLogs, addBDMLog } from "@/lib/bdm-log";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const bdm = searchParams.get("bdm");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const filters: { bdm?: string; dateFrom?: string; dateTo?: string } = {};
  if (bdm) filters.bdm = bdm;
  if (dateFrom) filters.dateFrom = dateFrom;
  if (dateTo) filters.dateTo = dateTo;
  if (session.user.role === "bdm" && session.user.assigned_bdm && !bdm)
    filters.bdm = session.user.assigned_bdm;

  const logs = await getBDMLogs(filters);
  return NextResponse.json(logs);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const entry = await addBDMLog({
    bdm: body.bdm ?? "",
    date: body.date ?? new Date().toISOString().slice(0, 10),
    total_calls: Number(body.total_calls) || 0,
    connected_calls: Number(body.connected_calls) || 0,
    non_answered_calls: Number(body.non_answered_calls) || 0,
    talk_time: Number(body.talk_time) || 0,
  });
  return NextResponse.json(entry);
}
