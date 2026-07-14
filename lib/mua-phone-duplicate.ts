import type { Sql } from "@/db/index";
import { normalizePhone } from "@/lib/phone";

export type ExistingMuaByPhone = {
  id: string;
  displayId: string;
  name: string;
};

/** Find an MUA that already uses this phone (last 10 digits). */
export async function findExistingMuaByPhone(
  db: Sql,
  phone: string,
): Promise<ExistingMuaByPhone | null> {
  const normalized = normalizePhone(phone);
  if (normalized.length !== 10) return null;

  const [row] = await db<ExistingMuaByPhone[]>`
    SELECT id, display_id AS "displayId", name
    FROM muas
    WHERE right(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 10) = ${normalized}
    LIMIT 1
  `;
  return row ?? null;
}

export function existingMuaPhoneMessage(mua: ExistingMuaByPhone): string {
  return `An MUA with this phone already exists (${mua.displayId} — ${mua.name}).`;
}
