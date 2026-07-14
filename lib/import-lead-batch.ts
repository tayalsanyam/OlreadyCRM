import { sql, withTransaction, appendComm, type TransactionSql } from "@/db/index";
import { COMM } from "@/lib/comm-types";
import { loadBudgetTierConfig } from "@/lib/budget-tier-db";
import { resolveBudgetTierFromAmount, type BudgetTierConfigBundle } from "@/lib/budget-tier";
import { toDbTier } from "@/lib/db-mappers";
import {
  findBlockingLeadsByPhones,
  findPendingLeadsByPhones,
  type PendingLeadByPhone,
} from "@/lib/lead-phone-duplicate";
import {
  loadCityRegionCatalog,
  resolveLeadRegionFromCatalog,
} from "@/lib/lead-region-intake";
import { refreshLeadPhase } from "@/lib/lead-phase";
import { normalizePhone } from "@/lib/phone";
import type { BudgetTier, CityRegion, Region } from "@/lib/types";

export interface ImportLeadPayload {
  brideName: string;
  phone: string;
  email?: string | null;
  eventDate?: string | null;
  city: string;
  region?: Region | null;
  eventLocation?: string | null;
  budgetAmount?: number | null;
  budgetTier?: BudgetTier;
  source?: string | null;
  ceremonies?: string[];
}

export type ImportLeadBatchResult = {
  imported: number;
  merged: number;
  skipped: number;
  errors: string[];
  notices: string[];
};

const IMPORT_CACHE_TTL_MS = 5 * 60 * 1000;

type ImportCache = {
  cityCatalog: CityRegion[];
  tierConfig: BudgetTierConfigBundle;
  loadedAt: number;
};

let importCache: ImportCache | null = null;

async function getImportCache(): Promise<ImportCache> {
  const now = Date.now();
  if (importCache && now - importCache.loadedAt < IMPORT_CACHE_TTL_MS) {
    return importCache;
  }
  const [cityCatalog, tierConfig] = await Promise.all([
    loadCityRegionCatalog(sql),
    loadBudgetTierConfig(sql),
  ]);
  importCache = { cityCatalog, tierConfig, loadedAt: now };
  return importCache;
}

async function nextLeadDisplayNumber(db: TransactionSql): Promise<number> {
  const [row] = await db<{ displayId: string }[]>`
    SELECT display_id AS "displayId"
    FROM bride_leads
    WHERE display_id LIKE 'LD-%'
    ORDER BY display_id DESC
    LIMIT 1
  `;
  if (!row?.displayId) return 1;
  const match = row.displayId.match(/^LD-(\d+)$/);
  return (match ? Number.parseInt(match[1], 10) : 0) + 1;
}

async function mergeImportRowIntoPendingLead(
  tx: TransactionSql,
  leadId: string,
  row: ImportLeadPayload,
  tierConfig: BudgetTierConfigBundle,
  leadRegion: Region | null,
): Promise<void> {
  const ceremonies = row.ceremonies?.length ? row.ceremonies : ["Wedding"];
  const amount = row.budgetAmount ?? 0;
  const tierKey =
    amount > 0
      ? resolveBudgetTierFromAmount(amount, tierConfig.limits)
      : (row.budgetTier ?? "tier1");
  const tier = toDbTier(tierKey);
  const eventDate = row.eventDate?.trim() || null;

  await tx`
    UPDATE bride_leads SET
      bride_name = ${row.brideName},
      phone = ${row.phone},
      email = COALESCE(${row.email ?? null}, email),
      city = ${row.city},
      region = COALESCE(${leadRegion}::region, region),
      event_location = COALESCE(${row.eventLocation ?? null}, event_location),
      event_date = COALESCE(${eventDate}::date, event_date),
      budget_amount = COALESCE(${row.budgetAmount ?? null}, budget_amount),
      budget_tier = ${tier}::budget_tier,
      source = COALESCE(${row.source ?? "Import"}, source),
      updated_at = NOW()
    WHERE id = ${leadId}::uuid
  `;

  const existingEvents = await tx<{ id: string; ceremonyType: string }[]>`
    SELECT id, ceremony_type AS "ceremonyType"
    FROM lead_events
    WHERE lead_id = ${leadId}::uuid
  `;

  for (const ceremony of ceremonies) {
    const match = existingEvents.find(
      (e: { id: string; ceremonyType: string }) => e.ceremonyType === ceremony
    );
    if (match) {
      await tx`
        UPDATE lead_events SET
          event_date = COALESCE(${eventDate}::date, event_date),
          updated_at = NOW()
        WHERE id = ${match.id}::uuid
      `;
    } else {
      await tx`
        INSERT INTO lead_events (lead_id, ceremony_type, event_date, status)
        VALUES (${leadId}::uuid, ${ceremony}, ${eventDate}::date, 'open')
      `;
    }
  }

  for (const ev of existingEvents) {
    if (!ceremonies.includes(ev.ceremonyType)) {
      await tx`DELETE FROM lead_events WHERE id = ${ev.id}::uuid`;
    }
  }
}

export async function importLeadRows(
  rows: ImportLeadPayload[],
  actor: { id: string; name: string },
): Promise<ImportLeadBatchResult> {
  let imported = 0;
  let merged = 0;
  let skipped = 0;
  const errors: string[] = [];
  const notices: string[] = [];

  const { cityCatalog, tierConfig } = await getImportCache();
  const regionCache = new Map<string, Region | null>();
  const blockingByPhone = await findBlockingLeadsByPhones(
    sql,
    rows.map((r) => r.phone),
  );
  const pendingByPhone = await findPendingLeadsByPhones(
    sql,
    rows.map((r) => r.phone),
  );
  const seenPhones = new Set<string>();
  let displayNum = await nextLeadDisplayNumber(sql);

  function resolveRegion(
    city: string,
    explicit: Region | null | undefined,
  ): Region | null {
    if (explicit) return explicit;
    const key = city.trim().toLowerCase();
    if (!key) return null;
    if (!regionCache.has(key)) {
      regionCache.set(key, resolveLeadRegionFromCatalog(city, cityCatalog));
    }
    return regionCache.get(key) ?? null;
  }

  for (const row of rows) {
    const phoneKey = normalizePhone(row.phone);
    if (!phoneKey) {
      skipped++;
      errors.push(`Invalid phone for ${row.brideName}`);
      continue;
    }

    if (seenPhones.has(phoneKey)) {
      skipped++;
      errors.push(`Duplicate phone in file: ${row.phone}`);
      continue;
    }
    seenPhones.add(phoneKey);

    const blocking = blockingByPhone.get(phoneKey);
    if (blocking) {
      skipped++;
      errors.push(
        `Active lead exists for ${row.phone} (${blocking.displayId} — ${blocking.brideName})`,
      );
      continue;
    }

    const leadRegion = resolveRegion(row.city, row.region);
    const existingPending = pendingByPhone.get(phoneKey);

    if (existingPending) {
      try {
        await withTransaction(async (tx) => {
          await mergeImportRowIntoPendingLead(
            tx,
            existingPending.id,
            row,
            tierConfig,
            leadRegion,
          );
        });
        merged++;
        notices.push(
          `Merged into existing pending lead ${existingPending.displayId} (${row.phone})`,
        );
      } catch (e) {
        skipped++;
        errors.push(
          e instanceof Error
            ? `Merge failed for ${row.phone}: ${e.message}`
            : `Merge failed for ${row.phone}`,
        );
      }
      continue;
    }

    const displayId = `LD-${String(displayNum++).padStart(5, "0")}`;
    const ceremonies = row.ceremonies?.length ? row.ceremonies : ["Wedding"];
    const amount = row.budgetAmount ?? 0;
    const tierKey =
      amount > 0
        ? resolveBudgetTierFromAmount(amount, tierConfig.limits)
        : (row.budgetTier ?? "tier1");
    const tier = toDbTier(tierKey);
    const eventDate = row.eventDate?.trim() || null;

    try {
      let created: PendingLeadByPhone | null = null;
      await withTransaction(async (tx) => {
        const [lead] = await tx<{ id: string }[]>`
          INSERT INTO bride_leads (
            display_id, bride_name, phone, email, city, region,
            event_location, event_date, budget_amount, budget_tier, source,
            status, verified, lead_phase
          ) VALUES (
            ${displayId},
            ${row.brideName},
            ${row.phone},
            ${row.email ?? null},
            ${row.city},
            ${leadRegion}::region,
            ${row.eventLocation ?? null},
            ${eventDate}::date,
            ${row.budgetAmount ?? null},
            ${tier}::budget_tier,
            ${row.source ?? "Import"},
            'pending_verification',
            false,
            'pending_verification'
          )
          RETURNING id
        `;

        if (!lead) {
          throw new Error(`Insert failed for ${row.phone}`);
        }

        created = {
          id: lead.id,
          displayId,
          brideName: row.brideName,
          status: "pending_verification",
        };

        for (const ceremony of ceremonies) {
          await tx`
            INSERT INTO lead_events (lead_id, ceremony_type, event_date, status)
            VALUES (${lead.id}::uuid, ${ceremony}, ${eventDate}::date, 'open')
          `;
        }

        await appendComm(tx, {
          leadId: lead.id,
          entryType: COMM.leadCreated,
          description: `Lead imported by ${actor.name} — pending verification`,
          actorId: actor.id,
        });
        await refreshLeadPhase(tx, lead.id);
      });
      if (created) {
        pendingByPhone.set(phoneKey, created);
      }
      imported++;
    } catch (e) {
      skipped++;
      const msg =
        e instanceof Error &&
        "code" in e &&
        (e as { code: string }).code === "23505"
          ? `Duplicate display_id or unique field for ${row.phone}`
          : e instanceof Error
            ? e.message
            : "Insert failed";
      errors.push(msg);
    }
  }

  return { imported, merged, skipped, errors, notices };
}
