-- Restore deal price when a partial payment overwrote quoted_amount.
UPDATE sales.onboarding o
SET quoted_amount = sub.amount
FROM (
  SELECT
    o2.pipeline_id,
    (elem->>'amount')::numeric AS amount
  FROM sales.onboarding o2
  CROSS JOIN LATERAL jsonb_array_elements(o2.plans_shared) elem
  WHERE o2.plan IS NOT NULL
    AND jsonb_typeof(o2.plans_shared) = 'array'
    AND elem->>'plan' = o2.plan
    AND (elem->>'amount')::numeric > 0
) sub
WHERE o.pipeline_id = sub.pipeline_id
  AND (o.quoted_amount IS NULL OR o.quoted_amount < sub.amount);

-- Re-open deals that were closed with balance still due.
UPDATE sales.pipeline p
SET stage = 'Part Payment', updated_at = NOW()
WHERE p.stage = 'Deal Closed'
  AND EXISTS (
    SELECT 1
    FROM sales.onboarding o
    WHERE o.pipeline_id = p.id
      AND o.quoted_amount > 0
      AND (
        SELECT COALESCE(SUM(pr.amount), 0)
        FROM sales.payment_records pr
        WHERE pr.pipeline_id = p.id
      ) + 0.009 < o.quoted_amount
  );
