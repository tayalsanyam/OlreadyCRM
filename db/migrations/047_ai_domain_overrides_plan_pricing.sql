-- Editable AI domain prompts/guardrails + plan pricing fields for support RAG

CREATE TABLE IF NOT EXISTS sales.ai_domain_overrides (
  domain TEXT PRIMARY KEY CHECK (domain IN ('sales', 'support', 'grievance', 'rm')),
  system_prompt TEXT,
  guardrails JSONB,
  updated_by UUID REFERENCES rm.staff(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE rm.plan_tiers
  ADD COLUMN IF NOT EXISTS list_price_inr NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS plan_summary TEXT;
