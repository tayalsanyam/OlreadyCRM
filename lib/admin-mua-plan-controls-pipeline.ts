import type { TransactionSql } from "@/db/index";

export async function latestPipelineIdForMua(
  tx: TransactionSql,
  muaId: string,
): Promise<string | null> {
  const [row] = await tx<{ id: string }[]>`
    SELECT p.id
    FROM sales.pipeline p
    WHERE p.mua_id = ${muaId}::uuid
    ORDER BY
      CASE WHEN p.status = 'active' AND p.stage <> 'Rejected' THEN 0 ELSE 1 END,
      p.updated_at DESC NULLS LAST
    LIMIT 1
  `;
  return row?.id ?? null;
}
