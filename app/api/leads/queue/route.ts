import { NextResponse } from "next/server";
import type { PaginatedResult } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { apiErrorResponse } from "@/lib/api-error-response";
import { fetchQueuePage } from "@/lib/leads-queue-query";
import { reconcileDueLeads } from "@/lib/lead-lifecycle";
import { ensureLeadIntakeTasksForStaff } from "@/lib/lead-intake-tasks";
import { withTransaction } from "@/db/index";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import type { LeadFull } from "@/lib/types";
import { normalizeLeadFull, toDbStatus } from "@/lib/db-mappers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const region = searchParams.get("region");
  const rawStatus = searchParams.get("status") ?? "assigned";
  const status =
    rawStatus === "commission_rm" ? "commissionRm" : rawStatus;
  const dbStatus = toDbStatus(status);
  const tiers = searchParams.getAll("tier");
  const bands = searchParams.getAll("band");
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.max(1, Number(searchParams.get("pageSize") ?? "200"));
  const offset = (page - 1) * pageSize;
  const eventFrom = searchParams.get("eventFrom");
  const eventTo = searchParams.get("eventTo");
  const portal = searchParams.get("portal") as "on" | "off" | null;

  const { session } = auth;

  if (session.role === "leadUploader") {
    return NextResponse.json(
      { data: null, error: "Forbidden" },
      { status: 403 }
    );
  }

  if (USE_MOCK) {
    const leads = mockStore.getLeadsQueue(session, {
      status: status === "any" ? undefined : status,
      region: region ?? undefined,
      tiers: tiers.length ? tiers : undefined,
      bands: bands.length ? bands : undefined,
      eventFrom: eventFrom ?? undefined,
      eventTo: eventTo ?? undefined,
      portal: portal ?? undefined,
    });
    if (leads === null) {
      return NextResponse.json(
        { data: null, error: "Forbidden" },
        { status: 403 }
      );
    }
    const total = leads.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const data: PaginatedResult<LeadFull> = {
      data: leads.slice(offset, offset + pageSize),
      total,
      page,
      pageSize,
      totalPages,
    };
    return NextResponse.json({ data, error: null });
  }

  try {
    if (session.role === "commissionRm" && status !== "commissionRm") {
      return NextResponse.json(
        { data: null, error: "Forbidden" },
        { status: 403 }
      );
    }

    let queueRegion: string | null = region;
    let assignedRmId: string | null = null;
    let effectiveStatus = dbStatus;

    if (session.role === "regionalRm") {
      const allowed =
        session.regions?.length
          ? session.regions
          : session.region
            ? [session.region]
            : [];
      if (region && allowed.includes(region as (typeof allowed)[number])) {
        queueRegion = region;
      } else {
        queueRegion = allowed[0] ?? session.region ?? region ?? "north";
      }
      assignedRmId = session.userId;
      effectiveStatus = dbStatus;
    } else if (session.role === "commissionRm") {
      effectiveStatus = "commission_rm";
      assignedRmId = null;
    } else if (session.role === "admin" || session.role === "owner") {
      assignedRmId = null;
    } else {
      return NextResponse.json(
        { data: null, error: "Forbidden" },
        { status: 403 }
      );
    }

    const { rows, total } = await withTransaction(async (tx) => {
      await reconcileDueLeads(tx);
      if (session.role === "regionalRm" || session.role === "commissionRm") {
        await ensureLeadIntakeTasksForStaff(tx, session.userId);
      }
      return fetchQueuePage(tx, {
        dbStatus: effectiveStatus,
        region: queueRegion,
        assignedRmId,
        eventFrom,
        eventTo,
        portal,
        pageSize,
        offset,
        excludeNiByStaffId:
          session.role === "commissionRm" ? session.userId : null,
        commissionStaffId:
          session.role === "commissionRm" ? session.userId : null,
      });
    });

    let normalized = rows.map((r) => normalizeLeadFull(r));
    if (session.role === "regionalRm") {
      const allowed =
        session.regions?.length
          ? session.regions
          : session.region
            ? [session.region]
            : [];
      if (allowed.length) {
        normalized = normalized.filter((l) => l.region && allowed.includes(l.region));
      }
    }
    if (tiers.length) {
      normalized = normalized.filter((l) => tiers.includes(l.budgetTier));
    }
    if (bands.length) {
      normalized = normalized.filter((l) => bands.includes(l.urgencyBand));
    }

    const totalPages = Math.ceil(total / pageSize) || 1;

    return NextResponse.json({
      data: {
        data: normalized,
        total,
        page,
        pageSize,
        totalPages,
      },
      error: null,
    });
  } catch (e) {
    return apiErrorResponse(e, "Queue query failed");
  }
}
