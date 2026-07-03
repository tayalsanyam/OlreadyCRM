import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-error-response";
import { requireRoles } from "@/lib/api-auth";
import { fetchAdminActivationOverview } from "@/lib/admin-activation-overview-query";
import { parseOverviewDateRange } from "@/lib/admin-overview-date-range";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";

export async function GET(req: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const range = parseOverviewDateRange(new URL(req.url).searchParams);

  if (USE_MOCK) {
    return NextResponse.json({ data: mockStore.getActivationOverview(range), error: null });
  }

  try {
    const data = await fetchAdminActivationOverview(range);
    return NextResponse.json({ data, error: null });
  } catch (error) {
    return apiErrorResponse(error, "Failed to load activation overview");
  }
}
