import { sql, type TransactionSql } from "@/db/index";

export type MuaServiceOffering = {
  catalogId?: string | null;
  name: string;
  baseAmount?: number | null;
};

export type MuaServiceCatalogItem = {
  id: string;
  name: string;
  baseAmount: number | null;
  sortOrder: number;
  active: boolean;
};

export function normalizeServiceOfferings(raw: unknown): MuaServiceOffering[] {
  if (!Array.isArray(raw)) return [];
  const out: MuaServiceOffering[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    if (!name) continue;
    const baseRaw = o.baseAmount ?? o.base_amount;
    const baseAmount =
      baseRaw === null || baseRaw === undefined || baseRaw === ""
        ? null
        : Number(baseRaw);
    out.push({
      catalogId: o.catalogId ? String(o.catalogId) : o.catalog_id ? String(o.catalog_id) : null,
      name,
      baseAmount: Number.isFinite(baseAmount) ? baseAmount : null,
    });
  }
  return out;
}

export function serviceNamesFromOfferings(offerings: MuaServiceOffering[]): string[] {
  return [...new Set(offerings.map((o) => o.name).filter(Boolean))];
}

export async function listMuaServiceCatalog(
  tx: TransactionSql | typeof sql,
  opts: { activeOnly?: boolean } = {}
): Promise<MuaServiceCatalogItem[]> {
  const activeFilter = opts.activeOnly ? tx.unsafe("active = true") : tx.unsafe("TRUE");
  return tx<MuaServiceCatalogItem[]>`
    SELECT
      id,
      name,
      base_amount AS "baseAmount",
      sort_order AS "sortOrder",
      active
    FROM mua_service_catalog
    WHERE ${activeFilter}
    ORDER BY sort_order ASC, name ASC
  `;
}
