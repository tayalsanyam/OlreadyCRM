-- Team-viewable portfolio / work samples on MUA roster profiles

CREATE TABLE IF NOT EXISTS rm.mua_portfolio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mua_id UUID NOT NULL REFERENCES rm.muas(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  media_url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES rm.staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mua_portfolio_items_mua
  ON rm.mua_portfolio_items(mua_id, sort_order, created_at DESC);
