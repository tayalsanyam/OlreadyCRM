import type { Sql, TransactionSql } from "@/db/index";
import { sql } from "@/db/index";
import { inferRegionFromCity, ALL_REGIONS } from "@/lib/mua-region";
import type { Region } from "@/lib/types";

export function normalizeMuaRegions(
  regions: Region[] | undefined,
  city: string
): Region[] {
  const unique = [...new Set(regions ?? [])].filter((r): r is Region =>
    ALL_REGIONS.includes(r as Region)
  );
  if (unique.length > 0) return unique;
  const inferred = inferRegionFromCity(city);
  return inferred ? [inferred] : [];
}

export async function syncMuaRegions(
  tx: TransactionSql,
  muaId: string,
  regions: Region[]
): Promise<void> {
  const list = [...new Set(regions)];
  await tx`DELETE FROM mua_regions WHERE mua_id = ${muaId}::uuid`;
  if (!list.length) return;
  for (const region of list) {
    await tx`
      INSERT INTO mua_regions (mua_id, region)
      VALUES (${muaId}::uuid, ${region}::region)
      ON CONFLICT DO NOTHING
    `;
  }
}

export async function fetchMuaRegions(muaId: string): Promise<Region[]> {
  const rows = await sql<{ region: Region }[]>`
    SELECT region::text AS region FROM mua_regions
    WHERE mua_id = ${muaId}::uuid
    ORDER BY region
  `;
  return rows.map((r) => r.region);
}

export async function fetchRegionsByMuaIds(
  muaIds: string[],
  db: Sql | TransactionSql = sql,
): Promise<Map<string, Region[]>> {
  const map = new Map<string, Region[]>();
  if (!muaIds.length) return map;
  const rows = await db<{ muaId: string; region: Region }[]>`
    SELECT mua_id AS "muaId", region::text AS region
    FROM mua_regions
    WHERE mua_id = ANY(${muaIds}::uuid[])
    ORDER BY region
  `;
  for (const row of rows) {
    const list = map.get(row.muaId) ?? [];
    list.push(row.region);
    map.set(row.muaId, list);
  }
  return map;
}
