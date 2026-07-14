import { NextResponse } from "next/server";
import { withTransaction, appendComm, insertAuditLog, sql } from "@/db/index";
import { requireSession } from "@/lib/api-auth";
import { resolveRegionFromLocation } from "@/lib/ceremony-region";
import { COMM } from "@/lib/comm-types";
import { reconcileLeadLifecycle } from "@/lib/lead-lifecycle";
import { canAccessLead, getLeadForAccess } from "@/lib/lead-access";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import type { CityRegion, Region } from "@/lib/types";

const REGIONS: Region[] = ["north", "east", "west", "south"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    ceremonyType: string;
    eventDate?: string;
    eventLocation?: string | null;
    region?: Region | null;
    budgetAmount?: number | null;
    description?: string | null;
  };

  const ceremonyType = body.ceremonyType?.trim();
  if (!ceremonyType) {
    return NextResponse.json({ data: null, error: "ceremonyType required" }, { status: 400 });
  }

  const eventDate = body.eventDate?.trim();
  if (!eventDate) {
    return NextResponse.json({ data: null, error: "Ceremony date is required" }, { status: 400 });
  }

  const eventLocation = body.eventLocation?.trim() ?? "";
  if (!eventLocation) {
    return NextResponse.json(
      { data: null, error: "Ceremony location is required" },
      { status: 400 }
    );
  }

  const { session } = auth;

  if (USE_MOCK) {
    try {
      mockStore.addEvent(id, {
        ceremonyType,
        eventDate,
        eventLocation,
        region: body.region ?? null,
        budgetAmount: body.budgetAmount ?? null,
        description: body.description ?? null,
      });
      return NextResponse.json({ data: { ok: true }, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not add ceremony";
      return NextResponse.json({ data: null, error: message }, { status: 400 });
    }
  }

  const lead = await getLeadForAccess(id);
  if (!lead || !canAccessLead(session, lead)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  const [duplicate] = await sql<{ id: string }[]>`
    SELECT id FROM lead_events
    WHERE lead_id = ${id}::uuid
      AND lower(trim(ceremony_type)) = lower(trim(${ceremonyType}))
    LIMIT 1
  `;
  if (duplicate) {
    return NextResponse.json(
      { data: null, error: "This ceremony is already on the lead" },
      { status: 400 }
    );
  }

  const cityRows = await sql<CityRegion[]>`
    SELECT city, region::text AS region FROM city_regions ORDER BY city
  `;

  let region: Region | null = body.region ?? null;
  if (region && !REGIONS.includes(region)) {
    return NextResponse.json({ data: null, error: "Invalid region" }, { status: 400 });
  }
  if (!region) {
    region = resolveRegionFromLocation(eventLocation, cityRows);
  }
  if (!region) {
    return NextResponse.json(
      {
        data: null,
        error: "Could not determine region — pick a region or use a listed city",
      },
      { status: 400 }
    );
  }

  const budgetAmount = body.budgetAmount ?? null;
  if (budgetAmount != null && (budgetAmount < 0 || !Number.isFinite(budgetAmount))) {
    return NextResponse.json({ data: null, error: "Invalid budget" }, { status: 400 });
  }

  await withTransaction(async (tx) => {
    await tx`
      INSERT INTO lead_events (
        lead_id,
        ceremony_type,
        event_date,
        event_location,
        region,
        status,
        budget_amount,
        description
      )
      VALUES (
        ${id}::uuid,
        ${ceremonyType},
        ${eventDate}::date,
        ${eventLocation},
        ${region}::region,
        'open',
        ${budgetAmount},
        ${body.description?.trim() || null}
      )
    `;
    await appendComm(tx, {
      leadId: id,
      entryType: COMM.note,
      description: `Ceremony added: ${ceremonyType} (${eventDate}, ${eventLocation})`,
      actorId: session.userId,
    });
    await insertAuditLog(tx, {
      tableName: "lead_events",
      recordId: id,
      action: "add_event",
      actorId: session.userId,
      changes: body,
    });
    await reconcileLeadLifecycle(tx, id);
  });

  return NextResponse.json({ data: { ok: true }, error: null });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSession();
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    eventId: string;
    status: "not_needed";
  };

  const { session } = auth;

  if (USE_MOCK) {
    mockStore.markEventNotNeeded(body.eventId);
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  const lead = await getLeadForAccess(id);
  if (!lead || !canAccessLead(session, lead)) {
    return NextResponse.json({ data: null, error: "Forbidden" }, { status: 403 });
  }

  await withTransaction(async (tx) => {
    await tx`
      UPDATE lead_events SET status = 'not_needed', updated_at = NOW()
      WHERE id = ${body.eventId}::uuid AND lead_id = ${id}::uuid
    `;
    await appendComm(tx, {
      leadId: id,
      entryType: COMM.note,
      description: `Event marked not needed`,
      actorId: session.userId,
    });
    await reconcileLeadLifecycle(tx, id);
  });

  return NextResponse.json({ data: { ok: true }, error: null });
}
