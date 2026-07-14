import type { TransactionSql } from "@/db/index";
import { sql } from "@/db/index";
import { normalizePhone } from "@/lib/phone";

export function normalizeEmpPhone(empNumber: string): string | null {
  const tail = normalizePhone(empNumber);
  return tail.length >= 10 ? tail : null;
}

export async function getCallyzerLastSyncedAt(
  empPhone: string,
): Promise<Date | null> {
  const key = normalizeEmpPhone(empPhone);
  if (!key) return null;

  const [row] = await sql<{ lastSyncedAt: string }[]>`
    SELECT last_synced_at AS "lastSyncedAt"
    FROM callyzer_sync_state
    WHERE emp_phone = ${key}
  `;
  return row?.lastSyncedAt ? new Date(row.lastSyncedAt) : null;
}

export async function setCallyzerLastSyncedAt(
  tx: TransactionSql,
  empPhone: string,
  syncedAt: Date,
): Promise<void> {
  const key = normalizeEmpPhone(empPhone);
  if (!key) return;

  await tx`
    INSERT INTO callyzer_sync_state (emp_phone, last_synced_at, updated_at)
    VALUES (${key}, ${syncedAt.toISOString()}, NOW())
    ON CONFLICT (emp_phone) DO UPDATE SET
      last_synced_at = EXCLUDED.last_synced_at,
      updated_at = NOW()
  `;
}
