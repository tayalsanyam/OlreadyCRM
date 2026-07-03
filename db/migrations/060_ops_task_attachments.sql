-- File attachments on team (ops) tasks

CREATE TABLE IF NOT EXISTS rm.ops_task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES rm.ops_tasks(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES rm.staff(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_task_attachments_task
  ON rm.ops_task_attachments(task_id, created_at DESC);
