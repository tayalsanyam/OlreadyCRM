/** Active (non-cancelled) booking SQL predicate for a given table alias. */
export function activeBookingSql(alias: string): string {
  return `NOT COALESCE(${alias}.cancelled, false)`;
}

/** Booking credited to staff s — regional RM via assignment, commission RM via winning push. */
export function rmStaffBookingCreditSql(opts?: {
  staffAlias?: string;
  bookingAlias?: string;
  leadAlias?: string;
}): string {
  const s = opts?.staffAlias ?? "s";
  const b = opts?.bookingAlias ?? "b";
  const bl = opts?.leadAlias ?? "bl";
  return `(
    (${s}.role = 'regional_rm' AND ${bl}.assigned_rm_id = ${s}.id)
    OR (
      ${s}.role = 'commission_rm'
      AND ${rmStaffCommissionCreditSql(opts)}
    )
  )`;
}

/** Commission collected on a booking credited to commission RM s (winning push only). */
export function rmStaffCommissionCreditSql(opts?: {
  staffAlias?: string;
  bookingAlias?: string;
}): string {
  const s = opts?.staffAlias ?? "s";
  const b = opts?.bookingAlias ?? "b";
  return `EXISTS (
    SELECT 1 FROM mua_pushes mp_rm
    WHERE mp_rm.id = ${b}.push_id AND mp_rm.pushed_by = ${s}.id
  )`;
}
