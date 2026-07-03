import type { TransactionSql } from "@/db/index";
import { normalizePhone } from "@/lib/phone";

export type LeadMatch = {
  leadId: string;
  displayId: string;
  brideName: string;
  phone: string | null;
  confidence: number;
  flags: string[];
};

export async function matchLeadByPhone(
  tx: TransactionSql,
  phone: string | null | undefined,
  muaId?: string | null
): Promise<LeadMatch[]> {
  if (!phone?.trim()) return [];

  const normalized = normalizePhone(phone);
  if (normalized.length < 10) return [];

  const rows = await tx<
    {
      leadId: string;
      displayId: string;
      brideName: string;
      phone: string | null;
    }[]
  >`
    SELECT DISTINCT ON (bl.id)
      bl.id AS "leadId",
      bl.display_id AS "displayId",
      bl.bride_name AS "brideName",
      bl.phone
    FROM bride_leads bl
    LEFT JOIN mua_pushes mp ON mp.lead_id = bl.id
    WHERE RIGHT(REGEXP_REPLACE(COALESCE(bl.phone, ''), '\\D', '', 'g'), 10) = ${normalized}
      AND (${muaId ?? null}::uuid IS NULL OR mp.mua_id = ${muaId ?? null}::uuid)
    ORDER BY bl.id, mp.created_at DESC NULLS LAST
    LIMIT 5
  `;

  return rows.map((r: { leadId: string; displayId: string; brideName: string; phone: string | null }) => ({
    ...r,
    confidence: 0.95,
    flags: [],
  }));
}
