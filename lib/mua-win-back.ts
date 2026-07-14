/** Shared win-back cohort predicate for `muas m` queries (Manage MUAs, Sales re-engage reports). */
export const WIN_BACK_MUA_PREDICATE = `
  (
    m.status != 'inactive'
    AND (
      (m.plan_expiry IS NOT NULL AND m.plan_expiry < CURRENT_DATE)
      OR (
        m.plan_tier IS NULL
        AND EXISTS (SELECT 1 FROM mua_plan_history h WHERE h.mua_id = m.id)
      )
    )
  )
`;
