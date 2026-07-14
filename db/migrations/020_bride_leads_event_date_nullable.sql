-- Pending leads may be created before ceremony date is known
ALTER TABLE bride_leads
  ALTER COLUMN event_date DROP NOT NULL;

CREATE OR REPLACE FUNCTION rm.compute_urgency_band(p_event_date DATE)
RETURNS rm.urgency_band AS $$
DECLARE
  d INT;
  cfg rm.sla_config%ROWTYPE;
BEGIN
  IF p_event_date IS NULL THEN
    RETURN 'long_shelf';
  END IF;
  SELECT * INTO cfg FROM rm.sla_config WHERE id = 1;
  d := p_event_date - CURRENT_DATE;
  IF d <= cfg.critical_max_days THEN RETURN 'critical';
  ELSIF d <= cfg.hot_max_days THEN RETURN 'hot';
  ELSIF d <= cfg.active_max_days THEN RETURN 'active';
  ELSE RETURN 'long_shelf';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;
