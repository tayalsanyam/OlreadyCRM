-- Stage-aligned general email templates + retire legacy duplicate "other" seeds

INSERT INTO support.ticket_templates (category, name, subject_template, body_template, approval_tier, requires_admin_approval)
SELECT v.category, v.name, v.subject_template, v.body_template, v.approval_tier::smallint, v.requires_admin_approval
FROM (VALUES
  (NULL, 'General — Initial reply', 'Update on your concern — {{ticket_number}}', $t$Dear {{party_name}},

Thank you for your patience regarding ticket {{ticket_number}}. We have reviewed your concern and wanted to share an update.

{{resolution}}

{{next_steps}}

Please reply to this email if you have questions or additional information.

Team Olready
+91 86998 89901$t$, 0, false),
  (NULL, 'General — Resolution proposed', 'Proposed resolution — {{ticket_number}}', $t$Dear {{party_name}},

Following our review of ticket {{ticket_number}}, we would like to propose the following resolution:

{{resolution}}

{{next_steps}}

Please let us know if you accept this resolution or if you would like to discuss further.

Team Olready
+91 86998 89901$t$, 1, true),
  (NULL, 'General — Awaiting your response', 'Waiting for your reply — {{ticket_number}}', $t$Dear {{party_name}},

We are waiting for your response on ticket {{ticket_number}} before we can proceed.

{{next_steps}}

Please reply to this email at your earliest convenience.

Team Olready
+91 86998 89901$t$, 0, false)
) AS v(category, name, subject_template, body_template, approval_tier, requires_admin_approval)
WHERE NOT EXISTS (
  SELECT 1 FROM support.ticket_templates t
  WHERE t.name = v.name AND COALESCE(t.category, '') = COALESCE(v.category, '')
);

-- Legacy 043 seeds duplicated newer General templates — hide from draft picker
UPDATE support.ticket_templates
SET active = false, updated_at = NOW()
WHERE category = 'other'
  AND name IN ('Acknowledgement', 'Request more information', 'Request proof')
  AND name NOT LIKE 'General —%'
  AND name NOT LIKE 'Bride —%'
  AND name NOT LIKE 'MUA —%';
