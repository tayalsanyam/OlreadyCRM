ALTER TABLE sales.pipeline
  ADD COLUMN IF NOT EXISTS priority_tag TEXT
  CHECK (priority_tag IN ('hot', 'follow_up', 'nurturing', 'cold'));

CREATE INDEX IF NOT EXISTS idx_sales_pipeline_priority_tag
  ON sales.pipeline(priority_tag);
