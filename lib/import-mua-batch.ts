import type { TransactionSql } from "@/db/index";
import { generateMuaDisplayId, insertAuditLog } from "@/db/index";
import { applyAdminPlanToMua } from "@/lib/admin-apply-plan";
import { PLAN_TIER_TO_LABEL } from "@/lib/admin-plan-assign-shared";
import { toDbPlanTier } from "@/lib/db-mappers";
import { isCompletePlanDetails, type SalesPlanDetailsInput } from "@/lib/sales-plan-details";
import type { ImportMuaRowPayload, MuaImportProfile } from "@/lib/mua-import";
import { normalizeMuaSource } from "@/lib/mua-source";
import { syncMuaRegions } from "@/lib/mua-regions-db";
import { createUnassignedSalesPipeline } from "@/lib/sales-pipeline-bootstrap";
import type { PlanTier, Region } from "@/lib/types";

export type ImportMuaBatchResult = {
  imported: number;
  skipped: number;
  errors: string[];
  duplicates: Array<{ name: string; phone: string; reason: string }>;
};

function planDetailsFromRow(row: ImportMuaRowPayload): SalesPlanDetailsInput {
  const label = row.planTier ? PLAN_TIER_TO_LABEL[row.planTier] : "";
  return {
    plan: label,
    leadCap: row.leadCap ?? null,
    leadBudget: row.leadBudget ?? "",
    states: row.planStates ?? [],
    regions: (row.planRegions ?? []) as string[],
    cities: row.planCities ?? [],
    socialMedia: row.instagram ?? "",
    durationStart: new Date().toISOString().slice(0, 10),
    durationEnd: row.planExpiry ?? "",
  };
}

async function applyImportedMuaPlan(
  tx: TransactionSql,
  muaId: string,
  actorId: string,
  row: ImportMuaRowPayload,
  profile?: MuaImportProfile,
): Promise<void> {
  if (row.planTier && row.planExpiry) {
    const details = planDetailsFromRow(row);
    if (isCompletePlanDetails(details)) {
      await applyAdminPlanToMua(tx, muaId, actorId, {
        planTier: row.planTier,
        planExpiry: row.planExpiry,
        city: row.city,
        instagram: row.instagram ?? null,
        leadCap: row.leadCap ?? null,
        leadBudget: row.leadBudget ?? null,
        states: row.planStates ?? [],
        regions: (row.planRegions ?? []) as Region[],
        cities: row.planCities ?? [],
        note: "Imported with full plan",
      });
      return;
    }

    const dbTier = toDbPlanTier(row.planTier);
    await tx`
      UPDATE muas
      SET plan_tier = ${dbTier}::plan_tier, plan_expiry = ${row.planExpiry}::date
      WHERE id = ${muaId}::uuid
    `;
    await tx`
      INSERT INTO mua_plan_history (mua_id, plan_tier, assigned_by, expiry_at, notes)
      VALUES (
        ${muaId}::uuid,
        ${dbTier}::plan_tier,
        ${actorId}::uuid,
        ${row.planExpiry}::date,
        'Imported with plan (partial details)'
      )
    `;
    return;
  }

  if (profile === "roster") {
    await tx`
      INSERT INTO mua_plan_history (mua_id, assigned_by, expiry_at, notes)
      VALUES (
        ${muaId}::uuid,
        ${actorId}::uuid,
        (CURRENT_DATE - INTERVAL '1 day')::date,
        'Imported as roster / former customer'
      )
    `;
  }
}

export async function importMuaRows(
  tx: TransactionSql,
  rows: ImportMuaRowPayload[],
  actorId: string,
  opts?: { profile?: MuaImportProfile },
): Promise<ImportMuaBatchResult> {
  const profile = opts?.profile;
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const duplicates: ImportMuaBatchResult["duplicates"] = [];

  for (const row of rows) {
    try {
      if (!row.regions?.length) {
        skipped++;
        errors.push(`${row.name}: missing region(s)`);
        continue;
      }

      const phone = row.phone?.trim() || null;
      const instagram = row.instagram?.trim() || null;

      if (phone) {
        const [dupPhone] = await tx<{ id: string }[]>`
          SELECT id FROM muas WHERE phone = ${phone} LIMIT 1
        `;
        if (dupPhone) {
          duplicates.push({ name: row.name, phone, reason: "Duplicate phone" });
          skipped++;
          continue;
        }
      }
      if (instagram) {
        const [dupIg] = await tx<{ id: string }[]>`
          SELECT id FROM muas WHERE instagram = ${instagram} LIMIT 1
        `;
        if (dupIg) {
          duplicates.push({ name: row.name, phone: phone ?? "", reason: "Duplicate Instagram" });
          skipped++;
          continue;
        }
      }

      const displayId = await generateMuaDisplayId(tx);
      const source = normalizeMuaSource(row.source);

      const [mua] = await tx<{ id: string }[]>`
        INSERT INTO muas (
          display_id, name, phone, city, source, instagram, whatsapp, bio, email, status
        )
        VALUES (
          ${displayId},
          ${row.name},
          ${phone},
          ${row.city},
          ${source},
          ${instagram},
          ${row.whatsapp ?? null},
          ${row.bio?.trim() || null},
          ${row.email?.trim() || null},
          'active'
        )
        RETURNING id
      `;

      if (!mua) {
        skipped++;
        continue;
      }

      await syncMuaRegions(tx, mua.id, row.regions);

      await applyImportedMuaPlan(tx, mua.id, actorId, row, profile);

      await createUnassignedSalesPipeline(tx, {
        muaId: mua.id,
        actorId,
        muaName: row.name,
      });

      await insertAuditLog(tx, {
        tableName: "muas",
        recordId: mua.id,
        action: "import",
        actorId,
        changes: row as unknown as Record<string, unknown>,
      });
      imported++;
    } catch (e) {
      skipped++;
      errors.push(`${row.name}: ${e instanceof Error ? e.message : "Insert failed"}`);
    }
  }

  return { imported, skipped, errors, duplicates };
}
