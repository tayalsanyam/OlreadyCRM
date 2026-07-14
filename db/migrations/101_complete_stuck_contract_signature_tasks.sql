-- Close contract-signature follow-ups left pending after plan activation.

UPDATE rm.rm_tasks t
SET status = 'done', updated_at = NOW()
WHERE t.status = 'pending'
  AND t.task_type = 'sales_follow_up'
  AND t.title LIKE 'Contract signature follow-up — %'
  AND t.title ~ '\[PIPE:[0-9a-f-]{36}\]'
  AND EXISTS (
    SELECT 1
    FROM sales.activation_log al
    WHERE al.pipeline_id = substring(t.title from '\[PIPE:([0-9a-f-]{36})\]')::uuid
      AND al.activated_at IS NOT NULL
  );
