import type { TransactionSql } from "@/db/index";
import { appendComm, insertAuditLog } from "@/db/index";
import { toDbTier } from "@/lib/db-mappers";
import { COMM } from "@/lib/comm-types";
import {
  deriveLeadPrimaryRegion,
  leadEventLocationSummary,
  resolveRegionFromLocation,
  uniqueRegions,
} from "@/lib/ceremony-region";
import { loadBudgetTierConfig } from "@/lib/budget-tier-db";
import { resolveLeadBudgetTier, sumCeremonyBudgets } from "@/lib/budget-tier";
import { resolveLeadEventDate } from "@/lib/lead-event-date";
import { upsertMakeupLookProfile } from "@/lib/makeup-look-db";
import type { MakeupLookProfileInput } from "@/lib/makeup-look";
import type { BrideLead, CityRegion, Region } from "@/lib/types";

export type CeremonyInput = {
  name: string;
  budget: number | null;
  date?: string | null;
  description?: string | null;
  location?: string | null;
  region?: Region | null;
};

export type UploaderLeadDetailsPayload = Partial<BrideLead> & {
  ceremonies?: CeremonyInput[];
  assignmentRegion?: Region | null;
  makeupLook?: MakeupLookProfileInput;
  source?: string | null;
};

export async function applyUploaderLeadDetailsUpdate(
  tx: TransactionSql,
  params: {
    leadId: string;
    payload: UploaderLeadDetailsPayload;
    actorId: string;
    auditAction?: string;
  }
): Promise<void> {
  const { leadId: id, payload, actorId, auditAction = "uploader_edit" } = params;

  const ceremonies: CeremonyInput[] = payload.ceremonies?.length
    ? payload.ceremonies
    : [{ name: "Wedding", budget: null }];

  const leadEventDate = resolveLeadEventDate(
    ceremonies.map((c) => ({ date: c.date })),
    payload.eventDate
  );
  if (!leadEventDate || ceremonies.some((c) => !c.date?.trim())) {
    throw new Error("Each ceremony must have a date");
  }
  if (ceremonies.some((c) => !c.location?.trim())) {
    throw new Error("Each ceremony must have a location (city / venue)");
  }

  const ceremonyTotal = sumCeremonyBudgets(ceremonies);
  if (ceremonyTotal <= 0) {
    throw new Error("Enter a budget for each ceremony — tier is set from total event budgets");
  }

  const tierConfig = await loadBudgetTierConfig(tx);
  const cityRows = await tx<CityRegion[]>`
    SELECT city, region::text AS region FROM city_regions ORDER BY city
  `;
  const [existingLead] = await tx<{ region: string }[]>`
    SELECT region::text AS region FROM bride_leads WHERE id = ${id}::uuid
  `;
  const uploadFallbackRegion =
    (payload.assignmentRegion ??
      payload.region ??
      (existingLead?.region as Region | undefined)) ??
    null;

  const resolvedCeremonies = ceremonies.map((c) => {
    const location = c.location?.trim() ?? "";
    const region =
      c.region ??
      resolveRegionFromLocation(location, cityRows) ??
      (payload.region as Region | undefined) ??
      null;
    return { ...c, location, region };
  });

  if (resolvedCeremonies.some((c) => !c.region)) {
    throw new Error(
      "Could not determine region for each ceremony — pick a listed city or set region manually"
    );
  }

  const regionSet = uniqueRegions(resolvedCeremonies.map((c) => c.region));
  if (regionSet.length > 1 && !payload.assignmentRegion) {
    throw new Error(
      "Ceremonies span multiple regions — select the main region for RM assignment"
    );
  }

  const { region: leadRegion } = deriveLeadPrimaryRegion({
    ceremonies: resolvedCeremonies.map((c) => ({
      name: c.name,
      date: c.date,
      location: c.location,
      region: c.region,
    })),
    assignmentRegion: payload.assignmentRegion ?? null,
    fallbackRegion: uploadFallbackRegion,
  });

  const leadLocationSummary = leadEventLocationSummary(
    resolvedCeremonies.map((c) => ({
      name: c.name,
      location: c.location,
    }))
  );

  if (payload.brideName) {
    await tx`UPDATE bride_leads SET bride_name = ${payload.brideName} WHERE id = ${id}::uuid`;
  }
  if (payload.phone) {
    await tx`UPDATE bride_leads SET phone = ${payload.phone} WHERE id = ${id}::uuid`;
  }
  if (payload.email !== undefined) {
    await tx`UPDATE bride_leads SET email = ${payload.email} WHERE id = ${id}::uuid`;
  }
  if (payload.city) {
    await tx`UPDATE bride_leads SET city = ${payload.city} WHERE id = ${id}::uuid`;
  }
  await tx`
    UPDATE bride_leads SET
      region = ${leadRegion}::region,
      event_location = ${leadLocationSummary || payload.eventLocation?.trim() || null},
      event_date = ${leadEventDate}::date,
      updated_at = NOW()
    WHERE id = ${id}::uuid
  `;

  const { totalBudget, tier } = resolveLeadBudgetTier(resolvedCeremonies, tierConfig.limits);
  if (totalBudget > 0) {
    await tx`
      UPDATE bride_leads SET
        budget_amount = ${totalBudget},
        budget_tier = ${toDbTier(tier)}::budget_tier
      WHERE id = ${id}::uuid
    `;
  }

  if (payload.source !== undefined) {
    await tx`UPDATE bride_leads SET source = ${payload.source} WHERE id = ${id}::uuid`;
  }

  const ceremonyNames = ceremonies.map((c) => c.name);
  const existingEvents = await tx<{ id: string; ceremonyType: string }[]>`
    SELECT id, ceremony_type FROM lead_events WHERE lead_id = ${id}::uuid
  `;

  for (const c of resolvedCeremonies) {
    const match = existingEvents.find((e: { id: string; ceremonyType: string }) => e.ceremonyType === c.name);
    const ceremonyDate = c.date ?? leadEventDate;
    if (match) {
      await tx`
        UPDATE lead_events SET
          budget_amount = ${c.budget},
          event_date = ${ceremonyDate}::date,
          event_location = ${c.location},
          region = ${c.region}::region,
          description = ${c.description ?? null},
          updated_at = NOW()
        WHERE id = ${match.id}::uuid
      `;
    } else {
      await tx`
        INSERT INTO lead_events (
          lead_id, ceremony_type, event_date, event_location, region,
          status, budget_amount, description
        )
        VALUES (
          ${id}::uuid,
          ${c.name},
          ${ceremonyDate}::date,
          ${c.location},
          ${c.region}::region,
          'open',
          ${c.budget},
          ${c.description ?? null}
        )
      `;
    }
  }

  for (const ev of existingEvents) {
    if (!ceremonyNames.includes(ev.ceremonyType)) {
      await tx`DELETE FROM lead_events WHERE id = ${ev.id}::uuid`;
    }
  }

  if (payload.makeupLook) {
    await upsertMakeupLookProfile(tx, id, payload.makeupLook);
  }

  await appendComm(tx, {
    leadId: id,
    entryType: COMM.note,
    description: "Lead details updated by uploader",
    actorId,
  });

  await insertAuditLog(tx, {
    tableName: "bride_leads",
    recordId: id,
    action: auditAction,
    actorId,
    changes: { ceremonies: ceremonyNames },
  });
}
