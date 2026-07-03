-- Seed care email templates (samples for MUA, Bride, and general)
INSERT INTO support.ticket_templates (category, name, subject_template, body_template, approval_tier, requires_admin_approval)
SELECT v.category, v.name, v.subject_template, v.body_template, v.approval_tier::smallint, v.requires_admin_approval
FROM (VALUES
  (NULL, 'General — Acknowledgement', 'We received your concern — {{ticket_number}}', $t$Dear {{party_name}},

Thank you for reaching out to Team Olready. We have received your concern (reference {{ticket_number}}) and our care team is reviewing it.

We will get back to you shortly from care@olready.in.

Team Olready
+91 86998 89901$t$, 0, false),
  (NULL, 'General — Issue resolved', 'Your concern is resolved — {{ticket_number}}', $t$Dear {{party_name}},

Thank you for your patience regarding ticket {{ticket_number}}.

{{resolution}}

{{next_steps}}

If anything remains unclear, reply to this email and we will help.

Team Olready
+91 86998 89901$t$, 1, true),
  (NULL, 'General — Request more information', 'Additional information needed — {{ticket_number}}', $t$Dear {{party_name}},

To proceed with your concern ({{ticket_number}}), we need a few more details:

{{next_steps}}

Please reply to this email with the information so we can complete our review.

Team Olready
+91 86998 89901$t$, 0, false),
  (NULL, 'General — Request proof', 'Proof requested — {{ticket_number}}', $t$Dear {{party_name}},

For ticket {{ticket_number}}, please share the requested proof or screenshots so we can complete our review.

{{next_steps}}

Team Olready
+91 86998 89901$t$, 0, false),
  (NULL, 'General — Follow-up check-in', 'Following up on your concern — {{ticket_number}}', $t$Dear {{party_name}},

We are following up on ticket {{ticket_number}}.

{{next_steps}}

Please let us know if the issue is resolved or if you need further assistance.

Team Olready
+91 86998 89901$t$, 0, false),
  ('too_many_calls', 'Bride — Too many calls apology', 'Update on your call concern — {{ticket_number}}', $t$Dear {{bride_name}},

Thank you for telling us about the repeated calls on ticket {{ticket_number}}. We understand this can be frustrating during wedding planning.

We have noted your feedback and {{next_steps}}

Team Olready
+91 86998 89901$t$, 1, true),
  ('artist_not_responding', 'Bride — Artist not responding', 'Update on artist contact — {{ticket_number}}', $t$Dear {{bride_name}},

Regarding ticket {{ticket_number}} about the artist not responding:

{{resolution}}

{{next_steps}}

We are here to help you find a suitable next step.

Team Olready
+91 86998 89901$t$, 1, false),
  ('no_contact_from_muas', 'Bride — No MUA contact', 'Artist outreach update — {{ticket_number}}', $t$Dear {{bride_name}},

We are looking into ticket {{ticket_number}} where you did not receive contact from artists after your enquiry.

{{next_steps}}

Team Olready
+91 86998 89901$t$, 1, false),
  ('rm_unresponsive', 'Bride — RM unresponsive', 'RM follow-up on your concern — {{ticket_number}}', $t$Dear {{bride_name}},

Thank you for raising ticket {{ticket_number}} about your relationship manager.

We have escalated this internally and {{next_steps}}

Team Olready
+91 86998 89901$t$, 2, true),
  ('wrong_details_shared', 'Bride — Wrong details shared', 'Correction on shared details — {{ticket_number}}', $t$Dear {{bride_name}},

We apologise for any incorrect information shared regarding ticket {{ticket_number}}.

{{resolution}}

{{next_steps}}

Team Olready
+91 86998 89901$t$, 1, true),
  ('other', 'Bride — Acknowledgement', 'We received your concern — {{ticket_number}}', $t$Dear {{bride_name}},

Thank you for contacting Team Olready Care. We have received your message (reference {{ticket_number}}) and a care specialist will review it shortly.

{{next_steps}}

Team Olready
+91 86998 89901$t$, 0, false),
  ('other', 'Bride — Issue resolved', 'Your concern is resolved — {{ticket_number}}', $t$Dear {{bride_name}},

We are pleased to confirm that ticket {{ticket_number}} has been addressed.

{{resolution}}

{{next_steps}}

We hope your wedding planning goes smoothly.

Team Olready
+91 86998 89901$t$, 1, true),
  ('lead_reversal', 'MUA — Reversal under review', 'Lead reversal under review — {{ticket_number}}', $t$Dear {{mua_name}},

Your lead reversal request ({{ticket_number}}) is under review. We will share our decision after verifying your plan and lead records.

{{next_steps}}

Team Olready
+91 86998 89901$t$, 1, false),
  ('lead_reversal', 'MUA — Reversal approved', 'Lead reversal approved — {{ticket_number}}', $t$Dear {{mua_name}},

Following our review of ticket {{ticket_number}}:

{{resolution}}

{{next_steps}}

Team Olready
+91 86998 89901$t$, 2, true),
  ('lead_reversal', 'MUA — Reversal rejected', 'Lead reversal decision — {{ticket_number}}', $t$Dear {{mua_name}},

Following our review of ticket {{ticket_number}}:

{{resolution}}

{{next_steps}}

If you have additional evidence, reply to this email and we can re-open the review.

Team Olready
+91 86998 89901$t$, 2, true),
  ('lead_quality', 'MUA — Lead quality investigating', 'Lead quality review — {{ticket_number}}', $t$Dear {{mua_name}},

We are reviewing the lead quality concerns raised in ticket {{ticket_number}}.

{{next_steps}}

Team Olready
+91 86998 89901$t$, 1, false),
  ('lead_quality', 'MUA — Lead quality resolved', 'Lead quality update — {{ticket_number}}', $t$Dear {{mua_name}},

Regarding ticket {{ticket_number}}:

{{resolution}}

{{next_steps}}

Team Olready
+91 86998 89901$t$, 1, true),
  ('did_not_get_business', 'MUA — Did not get business', 'Business conversion review — {{ticket_number}}', $t$Dear {{mua_name}},

We are reviewing ticket {{ticket_number}} regarding leads that did not convert to bookings.

{{next_steps}}

Team Olready
+91 86998 89901$t$, 1, false),
  ('plan_extension', 'MUA — Plan extension', 'Plan extension request — {{ticket_number}}', $t$Dear {{mua_name}},

We have received your plan extension request ({{ticket_number}}).

{{next_steps}}

Our team will confirm eligibility and share options shortly.

Team Olready
+91 86998 89901$t$, 1, true),
  ('invoice_contract', 'MUA — Invoice / payment', 'Billing query — {{ticket_number}}', $t$Dear {{mua_name}},

Regarding your billing or invoice query on ticket {{ticket_number}}:

{{resolution}}

{{next_steps}}

Team Olready
+91 86998 89901$t$, 0, false),
  ('rm_relationship', 'MUA — RM relationship', 'RM concern — {{ticket_number}}', $t$Dear {{mua_name}},

We have noted your feedback about your relationship manager on ticket {{ticket_number}}.

{{next_steps}}

A senior coordinator will follow up with you.

Team Olready
+91 86998 89901$t$, 2, true),
  ('sales_promise', 'MUA — Sales promise', 'Sales promise review — {{ticket_number}}', $t$Dear {{mua_name}},

We are investigating the sales commitment mentioned in ticket {{ticket_number}}.

{{resolution}}

{{next_steps}}

Team Olready
+91 86998 89901$t$, 2, true),
  ('profile_query', 'MUA — Profile / plan query', 'Profile & plan query — {{ticket_number}}', $t$Dear {{mua_name}},

Thank you for your profile or plan question ({{ticket_number}}).

{{resolution}}

{{next_steps}}

Team Olready
+91 86998 89901$t$, 0, false)
) AS v(category, name, subject_template, body_template, approval_tier, requires_admin_approval)
WHERE NOT EXISTS (
  SELECT 1 FROM support.ticket_templates t
  WHERE t.name = v.name AND COALESCE(t.category, '') = COALESCE(v.category, '')
);

-- Refresh legacy templates with phone sign-off if missing
UPDATE support.ticket_templates
SET body_template = body_template || E'
+91 86998 89901',
    updated_at = NOW()
WHERE body_template LIKE '%Team Olready%'
  AND body_template NOT LIKE '%86998%';
