import { sql } from "@/db/index";
import { REGION_CITIES } from "@/lib/mua-region";
import type { Region, SessionUser } from "@/lib/types";

export async function muaInRegion(
  muaId: string,
  region: Region
): Promise<boolean> {
  const cities = REGION_CITIES[region] ?? [];
  const [row] = await sql<{ ok: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM muas m
      WHERE m.id = ${muaId}::uuid
        AND (
          EXISTS (
            SELECT 1 FROM mua_regions mr
            WHERE mr.mua_id = m.id AND mr.region = ${region}::region
          )
          OR (
            NOT EXISTS (SELECT 1 FROM mua_regions mr WHERE mr.mua_id = m.id)
            AND (
              m.city = ANY(${cities})
              OR EXISTS (
                SELECT 1 FROM mua_pushes mp
                JOIN bride_leads bl ON bl.id = mp.lead_id
                WHERE mp.mua_id = m.id AND bl.region = ${region}::region
              )
            )
          )
        )
    ) AS ok
  `;
  return row?.ok ?? false;
}

export function canAccessMuaByRole(
  session: SessionUser,
  muaRegionOk: boolean
): boolean {
  if (session.role === "admin" || session.role === "owner") return true;
  if (session.role === "commissionRm") return true;
  if (session.role === "feedbackRm") return true;
  if (session.role === "careAgent") return true;
  if (session.role === "regionalRm") return muaRegionOk;
  return false;
}
