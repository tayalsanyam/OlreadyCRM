import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { searchBrideLeadsForOpsTask, searchMuasForOpsTask } from "@/lib/ops-task";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "mua";
  const q = searchParams.get("q") ?? "";

  const data = await withTransaction(async (tx) => {
    if (type === "bride") {
      return { brides: await searchBrideLeadsForOpsTask(tx, q) };
    }
    return { muas: await searchMuasForOpsTask(tx, q) };
  });

  return NextResponse.json({ data, error: null });
}
