import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { seedDemoData } from "@/lib/demo-seed";

export async function POST() {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  try {
    const result = await seedDemoData(sql);
    return NextResponse.json({ data: result, error: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Seed failed";
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
