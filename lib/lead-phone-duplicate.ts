import { sql, type Sql } from "@/db/index";
import { normalizePhone } from "@/lib/phone";

/** Statuses where the same phone may be used for a new lead record. */
export const PHONE_REENTRY_STATUSES = ["archived", "missed", "expired"] as const;

/** Pending verification is not an active duplicate — import / re-enquiry may continue. */
export const PHONE_NON_BLOCKING_STATUSES = [
  ...PHONE_REENTRY_STATUSES,
  "pending_verification",
] as const;

export type BlockingLeadByPhone = {
  id: string;
  displayId: string;
  brideName: string;
  status: string;
};

export type PendingLeadByPhone = BlockingLeadByPhone;

/** Pending verification lead on the same phone (for import merge). */
export async function findPendingLeadByPhone(
  db: Sql,
  phone: string,
): Promise<PendingLeadByPhone | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const [row] = await db<PendingLeadByPhone[]>`
    SELECT id, display_id AS "displayId", bride_name AS "brideName", status::text AS status
    FROM bride_leads
    WHERE status = 'pending_verification'
      AND verified = false
      AND right(regexp_replace(phone, '\\D', '', 'g'), 10) = ${normalized}
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  return row ?? null;
}

/** Bulk lookup of pending leads by phone (import merge). */
export async function findPendingLeadsByPhones(
  db: Sql,
  phones: string[],
): Promise<Map<string, PendingLeadByPhone>> {
  const normalized = [
    ...new Set(phones.map(normalizePhone).filter((p) => p.length === 10)),
  ];
  if (!normalized.length) return new Map();

  const rows = await db<(PendingLeadByPhone & { phoneKey: string })[]>`
    SELECT DISTINCT ON (right(regexp_replace(phone, '\\D', '', 'g'), 10))
      right(regexp_replace(phone, '\\D', '', 'g'), 10) AS "phoneKey",
      id,
      display_id AS "displayId",
      bride_name AS "brideName",
      status::text AS status
    FROM bride_leads
    WHERE status = 'pending_verification'
      AND verified = false
      AND right(regexp_replace(phone, '\\D', '', 'g'), 10) = ANY(${sql.array(normalized)}::text[])
    ORDER BY right(regexp_replace(phone, '\\D', '', 'g'), 10), updated_at DESC
  `;

  return new Map(rows.map((row) => [row.phoneKey, row]));
}

/** Find an open lead that blocks creating another with the same phone. */
export async function findBlockingLeadByPhone(
  db: Sql,
  phone: string
): Promise<BlockingLeadByPhone | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const [row] = await db<BlockingLeadByPhone[]>`
    SELECT id, display_id AS "displayId", bride_name AS "brideName", status::text AS status
    FROM bride_leads
    WHERE status::text NOT IN ('archived', 'missed', 'expired', 'pending_verification')
      AND right(regexp_replace(phone, '\\D', '', 'g'), 10) = ${normalized}
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  return row ?? null;
}

/** One query for all phones in a bulk import chunk. */
export async function findBlockingLeadsByPhones(
  db: Sql,
  phones: string[],
): Promise<Map<string, BlockingLeadByPhone>> {
  const normalized = [
    ...new Set(phones.map(normalizePhone).filter((p) => p.length === 10)),
  ];
  if (!normalized.length) return new Map();

  const rows = await db<(BlockingLeadByPhone & { phoneKey: string })[]>`
    SELECT DISTINCT ON (right(regexp_replace(phone, '\\D', '', 'g'), 10))
      right(regexp_replace(phone, '\\D', '', 'g'), 10) AS "phoneKey",
      id,
      display_id AS "displayId",
      bride_name AS "brideName",
      status::text AS status
    FROM bride_leads
    WHERE status::text NOT IN ('archived', 'missed', 'expired', 'pending_verification')
      AND right(regexp_replace(phone, '\\D', '', 'g'), 10) = ANY(${sql.array(normalized)}::text[])
    ORDER BY right(regexp_replace(phone, '\\D', '', 'g'), 10), updated_at DESC
  `;

  return new Map(rows.map((row) => [row.phoneKey, row]));
}

export function blockingLeadPhoneMessage(lead: BlockingLeadByPhone): string {
  return `An active lead with this phone already exists (${lead.displayId} — ${lead.brideName}). Re-open the existing lead or wait until it is archived.`;
}
