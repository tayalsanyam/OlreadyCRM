-- Backfill muas.sales_closed_by from latest Deal Closed pipeline (imports predate stage-close flow).
UPDATE rm.muas m
SET
  sales_closed_by = p.sales_closed_by,
  updated_at = NOW()
FROM (
  SELECT DISTINCT ON (mua_id) mua_id, sales_closed_by
  FROM sales.pipeline
  WHERE stage = 'Deal Closed'
    AND sales_closed_by IS NOT NULL
  ORDER BY mua_id, updated_at DESC
) p
WHERE m.id = p.mua_id
  AND m.sales_closed_by IS NULL;
