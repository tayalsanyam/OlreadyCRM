-- Who marked the lead as not answering / not interested / archived exit
ALTER TABLE bride_leads
  ADD COLUMN IF NOT EXISTS exit_marked_by_role TEXT;

COMMENT ON COLUMN bride_leads.exit_marked_by_role IS
  'regional_rm | commission_rm | lead_uploader | admin | owner — role that last set exit/NI';

-- Lead uploader paths
UPDATE bride_leads
SET exit_marked_by_role = 'lead_uploader'
WHERE exit_marked_by_role IS NULL
  AND (
    handover_reason ILIKE '%uploader verification%'
    OR handover_reason ILIKE '%from not answering review%'
    OR uploader_confirmation IS NOT NULL
  );

-- Regional RM NI shift (commission_rm + NI handover)
UPDATE bride_leads
SET exit_marked_by_role = 'regional_rm'
WHERE exit_marked_by_role IS NULL
  AND status = 'commission_rm'
  AND handover_reason ILIKE '%not interested%';

-- Not answering from comms actor (hostile_flagged)
UPDATE bride_leads bl
SET exit_marked_by_role = sub.role
FROM (
  SELECT DISTINCT ON (c.lead_id)
    c.lead_id,
    st.role::text AS role
  FROM comms c
  JOIN staff st ON st.id = c.actor_id
  WHERE c.entry_type = 'hostile_flagged'
  ORDER BY c.lead_id, c.created_at DESC
) sub
WHERE bl.id = sub.lead_id
  AND bl.exit_marked_by_role IS NULL
  AND bl.hostile_note IS NOT NULL
  AND TRIM(bl.hostile_note) <> '';
