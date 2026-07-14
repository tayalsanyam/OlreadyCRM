import type { TransactionSql } from "@/db/index";
import { normalizePhone } from "@/lib/phone";

export type MuaMatch = {
  muaId: string;
  muaName: string;
  phone: string | null;
  pipelineId: string | null;
  stage: string | null;
  assignedToName: string | null;
};

export async function matchMuaByPhone(
  tx: TransactionSql,
  phone: string | null | undefined
): Promise<MuaMatch[]> {
  if (!phone?.trim()) return [];

  const normalized = normalizePhone(phone);
  if (normalized.length < 10) return [];

  return tx<MuaMatch[]>`
    SELECT
      m.id AS "muaId",
      m.name AS "muaName",
      m.phone,
      p.id AS "pipelineId",
      p.stage,
      s.name AS "assignedToName"
    FROM muas m
    LEFT JOIN sales.pipeline p ON p.mua_id = m.id AND p.status = 'active'
    LEFT JOIN staff s ON s.id = p.assigned_to
    WHERE RIGHT(REGEXP_REPLACE(COALESCE(m.phone, ''), '\\D', '', 'g'), 10) = ${normalized}
    ORDER BY p.updated_at DESC NULLS LAST
    LIMIT 5
  `;
}

export async function matchMuaById(
  tx: TransactionSql,
  muaId: string
): Promise<MuaMatch | null> {
  const [row] = await tx<MuaMatch[]>`
    SELECT
      m.id AS "muaId",
      m.name AS "muaName",
      m.phone,
      p.id AS "pipelineId",
      p.stage,
      s.name AS "assignedToName"
    FROM muas m
    LEFT JOIN sales.pipeline p ON p.mua_id = m.id AND p.status = 'active'
    LEFT JOIN staff s ON s.id = p.assigned_to
    WHERE m.id = ${muaId}::uuid
    LIMIT 1
  `;
  return row ?? null;
}
