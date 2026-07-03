/**
 * One active sales pipeline per MUA for list display and filters.
 * Prefers a pipeline that already has a salesperson; otherwise the latest updated row.
 */
export const CANONICAL_ACTIVE_PIPELINE_ORDER =
  "ORDER BY (sp.assigned_to IS NOT NULL) DESC, sp.updated_at DESC LIMIT 1";

export const CANONICAL_ACTIVE_PIPELINE_WHERE = `
  sp.mua_id = m.id
  AND sp.status = 'active'
  AND sp.stage <> 'Rejected'
`;
