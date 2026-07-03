-- Admin assignment, completion notes, and follow-up chain for support inquiries

ALTER TABLE support.support_inquiries
  ADD COLUMN IF NOT EXISTS completion_notes TEXT,
  ADD COLUMN IF NOT EXISTS completion_outcome TEXT,
  ADD COLUMN IF NOT EXISTS parent_inquiry_id UUID REFERENCES support.support_inquiries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES rm.staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_support_inquiries_parent
  ON support.support_inquiries(parent_inquiry_id);

CREATE INDEX IF NOT EXISTS idx_support_inquiries_assignee
  ON support.support_inquiries(assigned_to, status);
