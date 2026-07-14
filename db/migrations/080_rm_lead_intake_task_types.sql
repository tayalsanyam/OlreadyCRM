-- RM lead intake task types (separate migration: enum values must commit before use)

ALTER TYPE rm.task_type ADD VALUE IF NOT EXISTS 'bride_confirmation';
ALTER TYPE rm.task_type ADD VALUE IF NOT EXISTS 'share_profiles';
ALTER TYPE rm.task_type ADD VALUE IF NOT EXISTS 'lead_progress_follow_up';
