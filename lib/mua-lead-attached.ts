import type { TransactionSql } from "@/db/index";
import { sql } from "@/db/index";
import type { SessionUser } from "@/lib/types";

type Db = typeof sql | TransactionSql;

/** True when MUA has an in-flight push on a lead currently owned by this RM. */
export async function muaAttachedToStaffLead(
  db: Db,
  params: { muaId: string; staffId: string }
): Promise<boolean> {
  const [row] = await db<{ ok: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM mua_pushes mp
      JOIN bride_leads bl ON bl.id = mp.lead_id
      WHERE mp.mua_id = ${params.muaId}::uuid
        AND bl.assigned_rm_id = ${params.staffId}::uuid
        AND bl.status IN ('assigned'::lead_status, 'commission_rm'::lead_status)
        AND mp.status NOT IN ('closed', 'booked')
    ) AS ok
  `;
  return row?.ok ?? false;
}

export async function regionalRmCanAccessMua(
  db: Db,
  session: SessionUser,
  params: {
    muaId: string;
    inRegion: boolean;
    isPlanRm: boolean;
  }
): Promise<boolean> {
  if (session.role !== "regionalRm") return false;
  if (params.inRegion || params.isPlanRm) return true;
  return muaAttachedToStaffLead(db, {
    muaId: params.muaId,
    staffId: session.userId,
  });
}
