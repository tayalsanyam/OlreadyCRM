-- Admin-editable WhatsApp template overrides and stage defaults
ALTER TABLE rm.sla_config
  ADD COLUMN IF NOT EXISTS whatsapp_config JSONB NOT NULL DEFAULT '{}'::jsonb;
