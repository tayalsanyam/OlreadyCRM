-- Admin-created team tasks (assign to any employee, optional MUA/bride refs)

CREATE TABLE IF NOT EXISTS rm.ops_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  status rm.task_status NOT NULL DEFAULT 'pending',
  assigned_to UUID NOT NULL REFERENCES rm.staff(id),
  assigned_by UUID NOT NULL REFERENCES rm.staff(id),
  created_by UUID NOT NULL REFERENCES rm.staff(id),
  mua_id UUID REFERENCES rm.muas(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES rm.bride_leads(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  completion_notes TEXT,
  completion_outcome TEXT,
  end_rate TEXT,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES rm.staff(id) ON DELETE SET NULL,
  parent_task_id UUID REFERENCES rm.ops_tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_tasks_assignee
  ON rm.ops_tasks(assigned_to, status, due_at);

CREATE INDEX IF NOT EXISTS idx_ops_tasks_parent
  ON rm.ops_tasks(parent_task_id);

CREATE INDEX IF NOT EXISTS idx_ops_tasks_mua
  ON rm.ops_tasks(mua_id) WHERE mua_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ops_tasks_lead
  ON rm.ops_tasks(lead_id) WHERE lead_id IS NOT NULL;
