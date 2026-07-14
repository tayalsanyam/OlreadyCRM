-- Introduce Onboarding stage between payment close and final Deal Closed.

-- Active deals still in checklist/training work belong on Onboarding, not Deal Closed.
UPDATE sales.pipeline p
SET stage = 'Onboarding', updated_at = NOW()
WHERE p.stage = 'Deal Closed'
  AND p.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM sales.training t
    WHERE t.pipeline_id = p.id
      AND t.complete = true
  );
