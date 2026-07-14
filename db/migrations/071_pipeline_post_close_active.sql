-- Closed-won pipelines stay in the sales list until activation completes.
UPDATE sales.pipeline
SET status = 'active'
WHERE stage = 'Deal Closed'
  AND status = 'closed';
