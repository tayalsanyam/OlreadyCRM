-- plan_rm_id must reference regional_rm (set at plan activation).
-- Repair rows that incorrectly point at commission_rm staff (e.g. "Sheetal Commission" → Sheetal).

UPDATE rm.muas m
SET plan_rm_id = sub.regional_id
FROM (
  SELECT
    m2.id AS mua_id,
    (
      SELECT rr.id
      FROM rm.staff cr
      JOIN rm.staff rr ON rr.role = 'regional_rm'::rm.user_role
        AND rr.active = true
        AND lower(trim(split_part(cr.name, ' ', 1))) = lower(trim(split_part(rr.name, ' ', 1)))
      WHERE cr.id = m2.plan_rm_id
        AND cr.role = 'commission_rm'::rm.user_role
      ORDER BY rr.name
      LIMIT 1
    ) AS regional_id
  FROM rm.muas m2
  WHERE m2.plan_rm_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM rm.staff cr
      WHERE cr.id = m2.plan_rm_id AND cr.role = 'commission_rm'::rm.user_role
    )
) sub
WHERE m.id = sub.mua_id
  AND sub.regional_id IS NOT NULL;
