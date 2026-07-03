/** Correlated subquery: latest MUA touch across RM calls, sales calls, and comms. */
export const MUA_LAST_CONTACT_SQL = `
  GREATEST(
    (SELECT MAX(cl.called_at) FROM call_logs cl WHERE cl.mua_id = m.id),
    (
      SELECT MAX(scl.called_at)
      FROM sales.call_logs scl
      JOIN sales.pipeline p ON p.id = scl.pipeline_id
      WHERE p.mua_id = m.id
    ),
    (
      SELECT MAX(c.created_at)
      FROM comms c
      WHERE c.mua_id = m.id
        AND c.entry_type IN ('call_logged', 'whatsapp_logged', 'callyzer_synced')
    ),
    (
      SELECT MAX(scl.created_at)
      FROM sales.comms_log scl
      JOIN sales.pipeline p ON p.id = scl.pipeline_id
      WHERE p.mua_id = m.id
    )
  )
`;

export const MUA_LAST_PUSH_SQL = `
  (SELECT MAX(mp.created_at) FROM mua_pushes mp WHERE mp.mua_id = m.id)
`;

export const MUA_SALES_RM_NAME_SQL = `
  (
    SELECT s.name
    FROM sales.pipeline sp
    LEFT JOIN staff s ON s.id = sp.assigned_to
    WHERE sp.mua_id = m.id
      AND sp.status = 'active'
      AND sp.stage <> 'Rejected'
    ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC
    LIMIT 1
  )
`;

/** Plan RM name — only when plan_rm_id is a regional_rm (set at plan activation). */
export const MUA_PLAN_RM_NAME_SQL = `
  (
    SELECT s.name
    FROM staff s
    WHERE s.id = m.plan_rm_id
      AND s.role = 'regional_rm'::user_role
  )
`;
