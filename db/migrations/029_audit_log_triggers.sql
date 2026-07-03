-- System-wide audit trail foundation (DB-level)

CREATE OR REPLACE FUNCTION rm.capture_audit_log()
RETURNS trigger AS $$
DECLARE
  actor_text TEXT;
  actor_uuid UUID;
  record_uuid UUID;
  old_row JSONB;
  new_row JSONB;
  diff JSONB;
BEGIN
  actor_text := current_setting('app.user_id', true);
  IF actor_text IS NOT NULL AND actor_text <> '' THEN
    BEGIN
      actor_uuid := actor_text::uuid;
    EXCEPTION WHEN OTHERS THEN
      actor_uuid := NULL;
    END;
  ELSE
    actor_uuid := NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    old_row := to_jsonb(OLD);
    BEGIN
      record_uuid := (old_row ->> 'id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN OLD;
    END;
    diff := jsonb_build_object('before', old_row);
  ELSIF TG_OP = 'INSERT' THEN
    new_row := to_jsonb(NEW);
    BEGIN
      record_uuid := (new_row ->> 'id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN NEW;
    END;
    diff := jsonb_build_object('after', new_row);
  ELSE
    old_row := to_jsonb(OLD);
    new_row := to_jsonb(NEW);
    BEGIN
      record_uuid := (new_row ->> 'id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN NEW;
    END;

    SELECT COALESCE(
      jsonb_object_agg(
        d.key,
        jsonb_build_object('old', d.old_value, 'new', d.new_value)
      ),
      '{}'::jsonb
    )
    INTO diff
    FROM (
      SELECT
        COALESCE(o.key, n.key) AS key,
        o.value AS old_value,
        n.value AS new_value
      FROM jsonb_each(old_row) o
      FULL OUTER JOIN jsonb_each(new_row) n ON n.key = o.key
      WHERE o.value IS DISTINCT FROM n.value
        AND COALESCE(o.key, n.key) <> 'updated_at'
    ) d;

    IF diff = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO rm.audit_log (table_name, record_id, action, actor_id, changes)
  VALUES (
    TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
    record_uuid,
    lower(TG_OP),
    actor_uuid,
    diff
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_rm_bride_leads ON rm.bride_leads;
CREATE TRIGGER trg_audit_rm_bride_leads
AFTER INSERT OR UPDATE OR DELETE ON rm.bride_leads
FOR EACH ROW EXECUTE FUNCTION rm.capture_audit_log();

DROP TRIGGER IF EXISTS trg_audit_rm_muas ON rm.muas;
CREATE TRIGGER trg_audit_rm_muas
AFTER INSERT OR UPDATE OR DELETE ON rm.muas
FOR EACH ROW EXECUTE FUNCTION rm.capture_audit_log();

DROP TRIGGER IF EXISTS trg_audit_sales_pipeline ON sales.pipeline;
CREATE TRIGGER trg_audit_sales_pipeline
AFTER INSERT OR UPDATE OR DELETE ON sales.pipeline
FOR EACH ROW EXECUTE FUNCTION rm.capture_audit_log();

DROP TRIGGER IF EXISTS trg_audit_sales_targets ON sales.targets;
CREATE TRIGGER trg_audit_sales_targets
AFTER INSERT OR UPDATE OR DELETE ON sales.targets
FOR EACH ROW EXECUTE FUNCTION rm.capture_audit_log();
