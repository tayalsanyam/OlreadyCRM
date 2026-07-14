-- Numeric budget tier limits (INR); labels in budget_tier_ranges are derived for display.

ALTER TABLE rm.sla_config
  ADD COLUMN IF NOT EXISTS budget_tier_limits JSONB NOT NULL DEFAULT '{
    "tier1": { "min": 0, "max": 25000 },
    "tier2": { "min": 25001, "max": 50000 },
    "tier3": { "min": 50001, "max": 100000 },
    "tier4": { "min": 100001, "max": null }
  }'::jsonb;

UPDATE rm.sla_config
SET budget_tier_ranges = '{
  "tier1": "₹0 – ₹25,000",
  "tier2": "₹25,001 – ₹50,000",
  "tier3": "₹50,001 – ₹1,00,000",
  "tier4": "₹1,00,001+"
}'::jsonb
WHERE id = 1;
