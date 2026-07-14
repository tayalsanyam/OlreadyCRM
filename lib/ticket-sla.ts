import type { TransactionSql } from "@/db/index";

/** Mark open tickets past sla_due_at as breached (idempotent). */
export async function refreshSlaBreaches(tx: TransactionSql): Promise<number> {
  const updated = await tx<{ count: number }[]>`
    WITH u AS (
      UPDATE support.tickets
      SET sla_breached = true, updated_at = NOW()
      WHERE status != 'closed'
        AND sla_due_at IS NOT NULL
        AND sla_due_at < NOW()
        AND sla_breached = false
      RETURNING id
    )
    SELECT COUNT(*)::int AS count FROM u
  `;
  return updated[0]?.count ?? 0;
}

export function isSlaBreached(
  slaDueAt: string | null,
  status: string,
  storedBreached: boolean
): boolean {
  if (status === "closed") return storedBreached;
  if (!slaDueAt) return storedBreached;
  return new Date(slaDueAt).getTime() < Date.now() || storedBreached;
}
