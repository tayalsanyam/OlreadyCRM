import type { TransactionSql } from "@/db/index";
import { normalizePhone } from "@/lib/phone";

export type CallyzerStaffRow = { id: string; role: string; name: string };

export type CallyzerIdentity = {
  /** Normalized 10+ digit Callyzer line, or null for staff without a mapped line. */
  phone: string | null;
  staff: CallyzerStaffRow[];
  staffIds: string[];
  hasCommissionRm: boolean;
  hasRegionalRm: boolean;
  hasFeedbackRm: boolean;
};

export function normalizeCallyzerPhone(empNumber: string): string | null {
  const tail = normalizePhone(empNumber);
  return tail.length >= 10 ? tail : null;
}

/** Client/API validation message, or null when empty or valid. */
export function validateCallyzerNumberInput(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  if (normalizeCallyzerPhone(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length > 0 && digits.length < 10) {
    return `Callyzer number must be 10 digits (currently ${digits.length})`;
  }
  return "Callyzer number must be a valid 10-digit mobile";
}

function phoneTailLike(phone: string): string | null {
  const tail = normalizeCallyzerPhone(phone);
  if (!tail) return null;
  return `%${tail}`;
}

function buildIdentity(rows: CallyzerStaffRow[], phone: string | null): CallyzerIdentity {
  const staffIds = rows.map((r) => r.id);
  return {
    phone,
    staff: rows,
    staffIds,
    hasCommissionRm: rows.some((r) => r.role === "commission_rm"),
    hasRegionalRm: rows.some((r) => r.role === "regional_rm"),
    hasFeedbackRm: rows.some((r) => r.role === "feedback_rm"),
  };
}

/** All active staff accounts sharing the same Callyzer line (or a single-staff identity). */
export async function loadCallyzerIdentityByStaffId(
  tx: TransactionSql,
  staffId: string,
): Promise<CallyzerIdentity | null> {
  const [seed] = await tx<{ callyzerNumber: string | null }[]>`
    SELECT callyzer_number AS "callyzerNumber"
    FROM staff
    WHERE id = ${staffId}::uuid AND active = true
  `;
  if (!seed) return null;

  const phone = seed.callyzerNumber ? normalizeCallyzerPhone(seed.callyzerNumber) : null;
  if (!phone) {
    const [solo] = await tx<CallyzerStaffRow[]>`
      SELECT id, role::text AS role, name
      FROM staff
      WHERE id = ${staffId}::uuid AND active = true
    `;
    return solo ? buildIdentity([solo], null) : null;
  }

  return loadCallyzerIdentityByPhone(tx, phone);
}

/** Resolve identity from a Callyzer employee phone (org sync / webhook). */
export async function loadCallyzerIdentityByPhone(
  tx: TransactionSql,
  empNumber: string,
): Promise<CallyzerIdentity | null> {
  const tail = phoneTailLike(empNumber);
  if (!tail) return null;

  const rows = await tx<CallyzerStaffRow[]>`
    SELECT id, role::text AS role, name
    FROM staff
    WHERE active = true
      AND length(regexp_replace(COALESCE(callyzer_number, ''), '\D', '', 'g')) >= 10
      AND regexp_replace(callyzer_number, '\D', '', 'g') LIKE ${tail}
    ORDER BY
      CASE role::text
        WHEN 'regional_rm' THEN 0
        WHEN 'commission_rm' THEN 1
        ELSE 2
      END,
      updated_at DESC
  `;
  if (rows.length === 0) return null;
  const phone = normalizeCallyzerPhone(empNumber);
  return buildIdentity(rows, phone);
}

/** Staff IDs that should receive call credit for day-end / personal reports. */
export async function getCallyzerCreditStaffIds(
  tx: TransactionSql,
  staffId: string,
): Promise<string[]> {
  const identity = await loadCallyzerIdentityByStaffId(tx, staffId);
  return identity?.staffIds.length ? identity.staffIds : [staffId];
}

/** Expand report assignee filter so sibling role logins share one call pool. */
export async function expandCallyzerReportUserIds(
  tx: TransactionSql,
  userIds: string[],
): Promise<string[]> {
  if (userIds.length === 0) return userIds;
  const expanded = new Set<string>();
  for (const id of userIds) {
    const ids = await getCallyzerCreditStaffIds(tx, id);
    for (const sid of ids) expanded.add(sid);
  }
  return [...expanded];
}

export function callLogsStaffFilter(tx: TransactionSql, staffIds: string[]) {
  if (staffIds.length === 0) return tx`FALSE`;
  if (staffIds.length === 1) return tx`cl.staff_id = ${staffIds[0]!}::uuid`;
  return tx`cl.staff_id = ANY(${staffIds}::uuid[])`;
}

/** Actor row for ingest: prefer logged-in staff, else canonical line owner. */
export function pickIngestStaff(
  identity: CallyzerIdentity,
  preferredStaffId?: string,
): CallyzerStaffRow {
  if (preferredStaffId) {
    const hit = identity.staff.find((s) => s.id === preferredStaffId);
    if (hit) return hit;
  }
  return identity.staff[0]!;
}
