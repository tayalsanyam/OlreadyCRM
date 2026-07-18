import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import {
  fetchPipelineHealthByStatus,
  fetchPipelineHealthExcluding,
} from "@/lib/pipeline-health-query";
import { normalizeLeadFull } from "@/lib/db-mappers";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import type { PipelineHealthLead, Region } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toDbTier(tier: string): string {
  return tier.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
}

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { session } = auth;
  if (
    !["regionalRm", "commissionRm", "admin", "owner"].includes(session.role)
  ) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  let region = searchParams.get("region") as Region | null;
  const tiers = searchParams.getAll("tier");
  const eventFrom = searchParams.get("eventFrom");
  const eventTo = searchParams.get("eventTo");

  if (session.role === "regionalRm") {
    const allowed =
      session.regions?.length
        ? session.regions
        : session.region
          ? [session.region]
          : [];
    if (region && allowed.length && !allowed.includes(region)) {
      region = null;
    }
  }

  if (USE_MOCK) {
    const data = mockStore.getPipelineHealth({
      region: region ?? undefined,
      tier: tiers[0] ?? undefined,
      tiers: tiers.length ? tiers : undefined,
      eventFrom: eventFrom ?? undefined,
      eventTo: eventTo ?? undefined,
      session,
    });
    return NextResponse.json({ data, error: null });
  }

  const tierDbList = tiers.length > 0 ? tiers.map(toDbTier) : null;

  try {
    let rows: PipelineHealthLead[];

    if (session.role === "commissionRm") {
      rows = await fetchPipelineHealthByStatus({
        dbStatus: "commission_rm",
        region,
        assignedRmId: null,
        tierDbList,
        eventFrom,
        eventTo,
      });
    } else if (session.role === "regionalRm") {
      rows = await fetchPipelineHealthByStatus({
        dbStatus: "assigned",
        region,
        assignedRmId: session.userId,
        tierDbList,
        eventFrom,
        eventTo,
      });
    } else {
      rows = await fetchPipelineHealthExcluding({
        excludeStatuses: [
          "booked",
          "archived",
          "missed",
          "pending_verification",
        ],
        region,
        assignedRmId: null,
        tierDbList,
        eventFrom,
        eventTo,
        limit: 1000,
      });
    }

    return NextResponse.json({
      data: rows.map((r) => {
        const lead = normalizeLeadFull(r);
        return {
          ...lead,
          muasOfferedCount: Number(r.muasOfferedCount ?? 0),
          bucket: r.bucket,
        } as PipelineHealthLead;
      }),
      error: null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Pipeline health query failed";
    console.error("pipeline-health:", message);
    return NextResponse.json({ data: null, error: message }, { status: 500 });
  }
}
