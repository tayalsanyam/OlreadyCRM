import { NextResponse } from "next/server";
import { sql } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import {
  resolvePushCeremonyRegions,
  uniqueRegions,
} from "@/lib/ceremony-region";
import { fetchAvailableMuas } from "@/lib/mua-available";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import type { Region } from "@/lib/types";

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get("leadId");
  const commission = searchParams.get("commission") === "true";
  const eventIds = (searchParams.get("eventIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!leadId) {
    return NextResponse.json({ data: null, error: "leadId required" }, { status: 400 });
  }

  const rmRegion =
    auth.session.role === "regionalRm" ? auth.session.region ?? "north" : null;

  let ceremonyRegions: Region[] = [];

  if (USE_MOCK) {
    if (eventIds.length > 0) {
      ceremonyRegions = mockStore.getCeremonyRegionsForEvents(leadId, eventIds);
    } else {
      const openIds = mockStore
        .getLeadEvents(leadId)
        .filter((e) => e.status === "open")
        .map((e) => e.id);
      ceremonyRegions = mockStore.getCeremonyRegionsForEvents(leadId, openIds);
    }
  } else {
    ceremonyRegions = await resolvePushCeremonyRegions(sql, leadId, eventIds);
  }

  if (
    !commission &&
    uniqueRegions(ceremonyRegions).length > 1
  ) {
    return NextResponse.json(
      {
        data: null,
        error: "Selected ceremonies are in different regions — push one region at a time",
      },
      { status: 400 },
    );
  }

  const regionScope = commission
    ? { rmRegion: null, ceremonyRegions: [] as Region[] }
    : {
        rmRegion: ceremonyRegions.length ? null : rmRegion,
        ceremonyRegions,
      };

  if (USE_MOCK) {
    return NextResponse.json({
      data: mockStore.getAvailableMuas(leadId, commission, regionScope),
      error: null,
    });
  }

  const data = await fetchAvailableMuas(leadId, commission, regionScope);
  return NextResponse.json({ data, error: null });
}
