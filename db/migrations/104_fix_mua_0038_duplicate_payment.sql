-- MUA-0038: two × ₹14,998 receipts on a ₹15,000 Pro deal → keep one ₹15,000 payment.
DO $$
DECLARE
  v_pipeline_id uuid;
  v_count int;
  v_sum numeric;
BEGIN
  SELECT p.id INTO v_pipeline_id
  FROM sales.pipeline p
  JOIN muas m ON m.id = p.mua_id
  WHERE m.display_id = 'MUA-0038'
  LIMIT 1;

  IF v_pipeline_id IS NULL THEN
    RAISE NOTICE 'MUA-0038 pipeline not found — skipping';
    RETURN;
  END IF;

  SELECT COUNT(*)::int, COALESCE(SUM(amount), 0) INTO v_count, v_sum
  FROM sales.payment_records
  WHERE pipeline_id = v_pipeline_id;

  IF v_count <> 2 OR v_sum <> 29996 THEN
    RAISE NOTICE 'MUA-0038 payment state unexpected (count=%, sum=%) — skipping', v_count, v_sum;
    RETURN;
  END IF;

  UPDATE sales.payment_records
  SET amount = 15000.00
  WHERE pipeline_id = v_pipeline_id
    AND id = (
      SELECT id FROM sales.payment_records
      WHERE pipeline_id = v_pipeline_id
      ORDER BY created_at ASC
      LIMIT 1
    );

  DELETE FROM sales.payment_records
  WHERE pipeline_id = v_pipeline_id
    AND id = (
      SELECT id FROM sales.payment_records
      WHERE pipeline_id = v_pipeline_id
      ORDER BY created_at DESC
      LIMIT 1
    );
END $$;
