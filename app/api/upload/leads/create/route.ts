import { NextResponse } from "next/server";
import {
  withTransaction,
  appendComm,
  generateLeadDisplayId,
  sql,
} from "@/db/index";
import { requireRoles } from "@/lib/api-auth";
import { COMM } from "@/lib/comm-types";
import { USE_MOCK } from "@/lib/mock-data";
import { mockStore } from "@/lib/mock-store";
import type { Region } from "@/lib/types";
import { toDbTier } from "@/lib/db-mappers";
import { loadBudgetTierConfig } from "@/lib/budget-tier-db";
import { resolveLeadBudgetTier } from "@/lib/budget-tier";
import { findBlockingLeadByPhone, blockingLeadPhoneMessage } from "@/lib/lead-phone-duplicate";
import { resolveLeadEventDate } from "@/lib/lead-event-date";
import { resolveLeadRegionFromCity } from "@/lib/lead-region-intake";
import { refreshLeadPhase } from "@/lib/lead-phase";
import { FEEDBACK_REFERRAL_LEAD_SOURCE } from "@/lib/upload-referral-lead-url";

export async function POST(request: Request) {
  const auth = await requireRoles(["leadUploader", "admin", "owner"]);
  if ("error" in auth) {
    return NextResponse.json({ data: null, error: auth.error }, { status: auth.status });
  }

  const isUploader = auth.session.role === "leadUploader";

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
    feedbackReferralId?: string;
    groupSize?: number;
    groupNotes?: string;
    ceremonies?: Array<{
      name: string;
      budget: number | null;
      date?: string | null;
      description?: string | null;
    }> | string[];
  };

  if (
    !body.brideName?.trim() ||
    !body.phone?.trim() ||
    !body.city?.trim() ||
    (!isUploader && !body.region)
  ) {
    return NextResponse.json(
      { data: null, error: "Required fields missing" },
      { status: 400 }
    );
  }

  let leadRegion: Region | null = body.region ?? null;
  if (!leadRegion) {
    leadRegion = await resolveLeadRegionFromCity(sql, body.city!.trim());
  }

  const ceremonyRows = body.ceremonies?.length
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
  const { totalBudget, tier } = resolveLeadBudgetTier(ceremonyRows);

  if (USE_MOCK) {
    const lead = mockStore.createUploaderLead({
      ...body,
      brideName: body.brideName!,
      phone: body.phone!,
      city: body.city!,
      region: leadRegion,
      eventDate: leadEventDate,
      budgetAmount: totalBudget > 0 ? totalBudget : body.budgetAmount,
      budgetTier: tier,
      ceremonies: ceremonyRows.map((c) => c.name),
      actorId: auth.session.userId,
      actorName: auth.session.name,
    });
    return NextResponse.json({ data: { lead }, error: null });
  }

  const { session } = auth;
  let createdId = "";

  try {
  await withTransaction(async (tx) => {
    const tierConfig = await loadBudgetTierConfig(tx);
    const resolved = resolveLeadBudgetTier(ceremonyRows, tierConfig.limits);
    const budgetAmount =
      resolved.totalBudget > 0 ? resolved.totalBudget : body.budgetAmount ?? null;
    const budgetTier = resolved.totalBudget > 0 ? resolved.tier : "tier1";

    const blocking = await findBlockingLeadByPhone(tx, body.phone!.trim());
    if (blocking) {
      throw new Error(`DUPLICATE_PHONE:${blocking.displayId}`);
    }

    const displayId = await generateLeadDisplayId(tx);
    const leadSource =
      body.source?.trim() ||
      (body.feedbackReferralId ? FEEDBACK_REFERRAL_LEAD_SOURCE : null);
    const [lead] = await tx<{ id: string }[]>`
      INSERT INTO bride_leads (
        display_id, bride_name, phone, email, city, region,
        event_location, event_date, budget_amount, budget_tier, source,
        group_size, group_notes, status, verified, lead_phase
      ) VALUES (
        ${displayId},
        ${body.brideName!.trim()},
        ${body.phone!.trim()},
        ${body.email?.trim() || null},
        ${body.city!.trim()},
        ${leadRegion}::region,
        ${body.eventLocation?.trim() || null},
        ${leadEventDate ?? null}::date,
        ${budgetAmount},
        ${toDbTier(budgetTier)}::budget_tier,
        ${leadSource},
        ${body.groupSize ?? null},
        ${body.groupNotes?.trim() || null},
        'pending_verification',
        false,
        'pending_verification'
      )
      RETURNING id
    `;
    if (!lead) return;
    createdId = lead.id;

    for (const ceremony of ceremonyRows) {
      const evDate = ceremony.date ?? leadEventDate ?? null;
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
      description: body.feedbackReferralId
        ? `Lead added from feedback referral by ${session.name} — pending verification`
        : `Lead added by ${session.name} — pending verification`,
      actorId: session.userId,
    });
    await refreshLeadPhase(tx, createdId);
  });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.startsWith("DUPLICATE_PHONE")) {
      const blocking = await findBlockingLeadByPhone(sql, body.phone!.trim());
      return NextResponse.json(
        {
          data: null,
          error: blocking
            ? blockingLeadPhoneMessage(blocking)
            : "A lead with this phone already exists",
        },
        { status: 400 }
      );
    }
    throw e;
  }

  const [row] = await sql`SELECT * FROM leads_full WHERE id = ${createdId}::uuid`;
  return NextResponse.json({
    data: { lead: row ?? { id: createdId } },
    error: null,
  });
}
