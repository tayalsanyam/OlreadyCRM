import { NextResponse } from "next/server";
import {
  sql,
  withTransaction,
  appendComm,
  generateLeadDisplayId,
} from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { COMM } from "@/lib/comm-types";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import type { Region } from "@/lib/types";
import { toDbTier } from "@/lib/db-mappers";
import { normalizeLeadFull } from "@/lib/db-mappers";
import { loadBudgetTierConfig } from "@/lib/budget-tier-db";
import { resolveLeadBudgetTier } from "@/lib/budget-tier";
import { resolveLeadEventDate } from "@/lib/lead-event-date";
import { refreshLeadPhase } from "@/lib/lead-phase";
import type { LeadFull } from "@/lib/types";

export async function POST(request: Request) {
  const auth = await requireRoles(["admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as {
    brideName?: string;
    phone?: string;
    email?: string;
    city?: string;
    region?: Region;
    eventLocation?: string;
    eventDate?: string;
    budgetAmount?: number;
    source?: string;
    groupSize?: number;
    groupNotes?: string;
    ceremonies?: Array<{
      name: string;
      budget: number | null;
      date?: string | null;
      description?: string | null;
    }> | string[];
    portalOnly?: boolean;
    portalPushed?: boolean;
    portalCap?: number | null;
  };

  if (
    !body.brideName?.trim() ||
    !body.phone?.trim() ||
    !body.city?.trim() ||
    !body.region
  ) {
    return NextResponse.json(
      { data: null, error: "Required fields missing" },
      { status: 400 }
    );
  }

  const ceremonyRows: Array<{
    name: string;
    budget: number | null;
    date: string | null;
    description: string | null;
  }> = body.ceremonies?.length
    ? body.ceremonies.map((c) =>
        typeof c === "string"
          ? { name: c, budget: null, date: null, description: null }
          : {
              name: c.name,
              budget: c.budget ?? null,
              date: c.date ?? null,
              description: c.description ?? null,
            }
      )
    : [{ name: "Wedding", budget: null, date: null, description: null }];

  const leadEventDate = resolveLeadEventDate(ceremonyRows, body.eventDate);
  if (!leadEventDate) {
    return NextResponse.json(
      { data: null, error: "At least one ceremony date is required" },
      { status: 400 }
    );
  }
  if (!body.eventLocation?.trim()) {
    return NextResponse.json(
      { data: null, error: "Event location is required" },
      { status: 400 }
    );
  }

  const { totalBudget, tier } = resolveLeadBudgetTier(ceremonyRows);
  if (totalBudget <= 0) {
    return NextResponse.json(
      {
        data: null,
        error: "Enter ceremony budgets — tier is set from total event budgets",
      },
      { status: 400 }
    );
  }

  if (USE_MOCK) {
    const lead = mockStore.createManualLead({
      ...body,
      brideName: body.brideName!,
      phone: body.phone!,
      city: body.city!,
      region: body.region!,
      eventDate: body.eventDate!,
      budgetAmount: totalBudget,
      budgetTier: tier,
      ceremonies: ceremonyRows,
      portalOnly: body.portalOnly,
      portalPushed: body.portalPushed,
      portalCap: body.portalCap,
      actorId: auth.session.userId,
      actorName: auth.session.name,
    });
    return NextResponse.json({ data: { lead }, error: null });
  }

  const { session } = auth;
  let createdId = "";
  let displayId = "";

  await withTransaction(async (tx) => {
    const tierConfig = await loadBudgetTierConfig(tx);
    const resolved = resolveLeadBudgetTier(ceremonyRows, tierConfig.limits);
    displayId = await generateLeadDisplayId(tx);
    const portalOnly = !!body.portalOnly;
    const portalPushed = !!body.portalPushed;
    const [lead] = await tx<{ id: string }[]>`
      INSERT INTO bride_leads (
        display_id, bride_name, phone, email, city, region,
        event_location, event_date, budget_amount, budget_tier, source,
        group_size, group_notes, status, verified, verified_at, verified_by,
        portal_only, portal_pushed, portal_cap, lead_phase
      ) VALUES (
        ${displayId},
        ${body.brideName!.trim()},
        ${body.phone!.trim()},
        ${body.email?.trim() || null},
        ${body.city!.trim()},
        ${body.region}::region,
        ${body.eventLocation?.trim() || null},
        ${leadEventDate}::date,
        ${resolved.totalBudget},
        ${toDbTier(resolved.tier)}::budget_tier,
        ${body.source?.trim() || null},
        ${body.groupSize ?? null},
        ${body.groupNotes?.trim() || null},
        'verified',
        true,
        NOW(),
        ${session.userId}::uuid,
        ${portalOnly},
        ${portalPushed},
        ${body.portalCap ?? null},
        'verified_pool'
      )
      RETURNING id
    `;
    if (!lead) return;
    createdId = lead.id;

    if (portalPushed) {
      await tx`
        UPDATE bride_leads SET portal_pushed_at = NOW() WHERE id = ${createdId}::uuid
      `;
    }

    for (const ceremony of ceremonyRows) {
      const evDate = ceremony.date ?? leadEventDate;
      await tx`
        INSERT INTO lead_events (
          lead_id, ceremony_type, event_date, status, budget_amount, description
        )
        VALUES (
          ${createdId}::uuid,
          ${ceremony.name},
          ${evDate}::date,
          'open',
          ${ceremony.budget},
          ${ceremony.description}
        )
      `;
    }

    await appendComm(tx, {
      leadId: createdId,
      entryType: COMM.leadCreated,
      description: `Lead manually added by ${session.name}`,
      actorId: session.userId,
    });

    await refreshLeadPhase(tx, createdId);
  });

  const [row] = await sql<LeadFull[]>`SELECT * FROM leads_full WHERE id = ${createdId}::uuid`;
  return NextResponse.json({
    data: {
      lead: row ? normalizeLeadFull(row) : { id: createdId, displayId },
    },
    error: null,
  });
}
