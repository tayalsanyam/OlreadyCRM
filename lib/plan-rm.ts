import { sql, type TransactionSql } from "@/db/index";
import type { Region } from "@/lib/types";

export type PlanRmOption = {
  id: string;
  name: string;
  region: string;
};

function staffCoversDealRegion(
  staffRegion: string,
  staffRegions: string[] | null | undefined,
  dealRegions: string[],
): boolean {
  if (!dealRegions.length) return true;
  const covered = new Set<string>(
    (staffRegions?.length ? staffRegions : [staffRegion]).map((r) => r.toLowerCase()),
  );
  return dealRegions.some((r) => covered.has(String(r).toLowerCase()));
}

/** Active regional RMs whose region coverage overlaps the deal regions. */
export async function fetchPlanRmOptionsForRegions(
  tx: TransactionSql,
  dealRegions: Region[] | string[],
): Promise<PlanRmOption[]> {
  const regions = dealRegions.map((r) => String(r).toLowerCase());
  type StaffRow = PlanRmOption & { regions: string[] | null };
  const rows = await tx<StaffRow[]>`
    SELECT id, name, region::text AS region, regions::text[] AS regions
    FROM staff
    WHERE role = 'regional_rm' AND active = true
    ORDER BY name
  `;
  return rows
    .filter((r: StaffRow) => staffCoversDealRegion(r.region, r.regions, regions))
    .map((r: StaffRow) => ({ id: r.id, name: r.name, region: r.region }));
}

/** Ensure plan RM is an active regional RM covering the deal regions. */
export async function assertValidPlanRm(
  tx: TransactionSql,
  planRmId: string,
  dealRegions: Region[] | string[],
): Promise<PlanRmOption> {
  const [row] = await tx<(PlanRmOption & { regions: string[] | null; active: boolean; role: string })[]>`
    SELECT id, name, region::text AS region, regions::text[] AS regions, active, role::text AS role
    FROM staff
    WHERE id = ${planRmId}::uuid
    LIMIT 1
  `;
  if (!row) throw new Error("Selected Plan RM was not found");
  if (row.role !== "regional_rm" || !row.active) {
    throw new Error("Plan RM must be an active regional RM");
  }
  const regions = dealRegions.map((r) => String(r).toLowerCase());
  if (regions.length && !staffCoversDealRegion(row.region, row.regions, regions)) {
    throw new Error("Selected Plan RM does not cover this deal's regions");
  }
  return { id: row.id, name: row.name, region: row.region };
}

export async function muaIsPlanRm(muaId: string, staffId: string): Promise<boolean> {
  const [row] = await sql<{ ok: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM muas WHERE id = ${muaId}::uuid AND plan_rm_id = ${staffId}::uuid
    ) AS ok
  `;
  return row?.ok ?? false;
}
