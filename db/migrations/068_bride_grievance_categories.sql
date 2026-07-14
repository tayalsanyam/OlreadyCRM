-- Bride / public-form grievance categories (SLA + urgency defaults)
INSERT INTO support.category_config (category, default_urgency, default_approval_tier, requires_ledger, sla_hours)
VALUES
  ('too_many_calls', 'high', 1, false, 24),
  ('artist_not_responding', 'medium', 1, false, 48),
  ('no_contact_from_muas', 'medium', 1, false, 48),
  ('rm_unresponsive', 'high', 1, false, 24),
  ('wrong_details_shared', 'medium', 1, false, 48),
  ('business_collaboration', 'low', 0, false, 72)
ON CONFLICT (category) DO NOTHING;
