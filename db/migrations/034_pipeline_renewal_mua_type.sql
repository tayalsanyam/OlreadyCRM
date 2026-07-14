-- Allow renewal segment on sales.pipeline

ALTER TABLE sales.pipeline DROP CONSTRAINT IF EXISTS pipeline_mua_type_check;
ALTER TABLE sales.pipeline
  ADD CONSTRAINT pipeline_mua_type_check
  CHECK (mua_type IN ('candidate', 'renewal', 'lapsed'));
