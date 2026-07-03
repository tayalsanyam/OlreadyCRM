-- Remove roster "lapsed" and rename sales pipeline segment lapsed -> re_engage.

ALTER TABLE sales.pipeline DROP CONSTRAINT IF EXISTS pipeline_mua_type_check;

UPDATE sales.pipeline
SET mua_type = 're_engage', updated_at = NOW()
WHERE mua_type = 'lapsed';

UPDATE sales.pipeline_junk
SET mua_type = 're_engage'
WHERE mua_type = 'lapsed';

ALTER TABLE sales.pipeline
  ADD CONSTRAINT pipeline_mua_type_check
  CHECK (mua_type IN ('candidate', 'renewal', 're_engage'));

UPDATE rm.muas
SET status = 'active', updated_at = NOW()
WHERE status = 'lapsed';
