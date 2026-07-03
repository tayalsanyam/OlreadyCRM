-- Per-category visibility on the public /support submit form (independent of care intake).
ALTER TABLE support.category_config
  ADD COLUMN IF NOT EXISTS show_on_public_support BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN support.category_config.show_on_public_support IS
  'When true and active, category appears on the public /support submit concern form.';
