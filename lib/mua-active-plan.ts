/** MUA currently on an active plan (tier set and not past expiry). */
export function isMuaOnActivePlan(m: {
  planTier?: string | null;
  planExpiry?: string | null;
}): boolean {
  if (!m.planTier) return false;
  if (!m.planExpiry) return true;
  const today = new Date().toISOString().slice(0, 10);
  return m.planExpiry.slice(0, 10) >= today;
}

/** Not on an active plan — includes never-planned and expired-plan MUAs. */
export function isMuaNotOnPlan(m: {
  planTier?: string | null;
  planExpiry?: string | null;
}): boolean {
  return !isMuaOnActivePlan(m);
}

/** SQL predicate on a `muas` row alias (for sql.unsafe). */
export function muaNotOnPlanSql(alias = "m"): string {
  return `(
    ${alias}.plan_tier IS NULL
    OR (${alias}.plan_expiry IS NOT NULL AND ${alias}.plan_expiry < CURRENT_DATE)
  )`;
}

export function muaOnActivePlanSql(alias = "m"): string {
  return `(
    ${alias}.plan_tier IS NOT NULL
    AND (${alias}.plan_expiry IS NULL OR ${alias}.plan_expiry >= CURRENT_DATE)
  )`;
}
