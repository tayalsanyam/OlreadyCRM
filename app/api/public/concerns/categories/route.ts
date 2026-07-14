import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { fetchPublicSupportCategories } from "@/lib/ticket-category-registry";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raisedByType = searchParams.get("raisedByType") ?? "mua";

  if (!["mua", "bride", "other"].includes(raisedByType)) {
    return NextResponse.json({ data: null, error: "Invalid raisedByType" }, { status: 400 });
  }

  const categories = await fetchPublicSupportCategories(sql, raisedByType);
  return NextResponse.json({
    data: { categories },
    error: null,
  });
}
