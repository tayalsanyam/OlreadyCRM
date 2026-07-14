-- Close pending onboarding CRM tasks when training is already complete or deal is closed.

UPDATE rm.rm_tasks t
SET status = 'done', updated_at = NOW()
WHERE t.status = 'pending'
  AND t.task_type = 'sales_onboarding'
  AND t.title ~ '\[PIPE:[0-9a-f-]{36}\]'
  AND EXISTS (
    SELECT 1
    FROM sales.pipeline p
    WHERE p.id = substring(t.title from '\[PIPE:([0-9a-f-]{36})\]')::uuid
      AND (
        p.stage = 'Deal Closed'
        OR EXISTS (
          SELECT 1 FROM sales.training tr
          WHERE tr.pipeline_id = p.id AND tr.complete = true
        )
      )
  );
