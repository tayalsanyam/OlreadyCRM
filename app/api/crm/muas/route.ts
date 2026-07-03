import { NextResponse } from "next/server";
import { withTransaction } from "@/db/index";
import { requireGrievanceAccess } from "@/lib/api-auth";
import { searchCareMuas } from "@/lib/care-mua-lookup";

export async function GET(request: Request) {
  const auth = await requireGrievanceAccess();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const q = new URL(request.url).searchParams.get("q") ?? "";

  const rows = await withTransaction(async (tx) => searchCareMuas(tx, q, 100));

  return NextResponse.json({ data: rows, error: null });
}
