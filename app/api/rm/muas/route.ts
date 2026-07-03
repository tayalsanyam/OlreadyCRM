import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import { sessionStaffRegions } from "@/lib/mua-region";
import { fetchRmMuaRoster, type RmMuaRosterScope } from "@/lib/rm-mua-roster-query";
import type { Region } from "@/lib/types";

const VALID_REGIONS = new Set<Region>(["north", "east", "west", "south"]);

function resolveRosterRegions(
  allowed: Region[],
  regionParam: string | null,
): Region[] {
  if (
    regionParam &&
    VALID_REGIONS.has(regionParam as Region) &&
    allowed.includes(regionParam as Region)
  ) {
    return [regionParam as Region];
  }
  return allowed;
}

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { session } = auth;
  if (session.role !== "regionalRm") {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const allowedRegions = sessionStaffRegions(session);
  const { searchParams } = new URL(request.url);
  const scope = (searchParams.get("scope") === "my_plan" ? "my_plan" : "region") as RmMuaRosterScope;
  const regions =
    scope === "my_plan"
      ? allowedRegions
      : resolveRosterRegions(allowedRegions, searchParams.get("region"));

  if (USE_MOCK) {
    return NextResponse.json({
      data:
        scope === "my_plan"
          ? mockStore.getRmMyPlanMuas(session.userId)
          : mockStore.getRmMuasForRegions(regions),
      error: null,
    });
  }

  const data = await fetchRmMuaRoster({
    scope,
    regions,
    planRmStaffId: session.userId,
  });

  return NextResponse.json({ data, error: null });
}
