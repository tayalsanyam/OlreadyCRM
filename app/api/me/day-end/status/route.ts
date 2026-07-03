import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { apiErrorResponse } from "@/lib/api-error-response";
import { withTransaction } from "@/db/index";
import { getDayEndStatus } from "@/lib/day-end-queries";

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  try {
    const data = await withTransaction((tx) => getDayEndStatus(tx, auth.session));
    return NextResponse.json({ data, error: null });
  } catch (error) {
    return apiErrorResponse(error, "Failed to load day end status");
  }
}
