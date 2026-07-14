import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { fetchRmSummary } from "@/lib/rm-summary-query";

export async function GET(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const rmId = searchParams.get("rmId");
  const region = searchParams.get("region");

  if (USE_MOCK) {
    return NextResponse.json({
      data: {
        summary: [
          {
            rmId: "u-kanika",
            rmName: "Kanika",
            region: "north",
            totalLeads: 10,
            notContacted: 2,
            contacted: 8,
            pendingConfirmation: 1,
            awaitingProfiles: 2,
            avgMuasOffered: 2.4,
            belowAverage: 3,
            booked: 2,
            shifted: 1,
          },
        ],
        leads: [],
      },
      error: null,
    });
  }

  const data = await fetchRmSummary({ region, rmId });

  return NextResponse.json({ data, error: null });
}
