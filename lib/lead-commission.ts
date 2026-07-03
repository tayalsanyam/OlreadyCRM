import { sql } from "@/db/index";
import { leadTracksCommissionSync } from "@/lib/lead-tracks-commission";

export { leadTracksCommissionSync };

/** Commission-scoped leads: shifted to commission RM or in commission queue. */
export async function leadTracksCommission(leadId: string): Promise<boolean> {
  const [row] = await sql<{ shiftedAt: string | null; status: string }[]>`
    SELECT shifted_at AS "shiftedAt", status::text AS status
    FROM bride_leads
    WHERE id = ${leadId}::uuid
  `;
  if (!row) return false;
  return leadTracksCommissionSync({
    shiftedAt: row.shiftedAt,
    status: row.status,
  });
}
