-- RM MUA push notification email templates (admin-editable at Care Email Templates)

INSERT INTO support.ticket_templates (category, name, subject_template, body_template, approval_tier, requires_admin_approval)
SELECT v.category, v.name, v.subject_template, v.body_template, v.approval_tier::smallint, v.requires_admin_approval
FROM (VALUES
  (
    'rm_mua_push',
    'RM Push — Privy bride share',
    '{{mua_name}} - Privy - Bride Push',
    $t$Dear {{mua_name}},

We are sharing a bride profile with you:

Name: {{bride_name}}
City: {{city}}
Budget: {{budget_line}}

Events:
{{events_block}}{{makeup_details}}

{{disclaimer}}$t$,
    0,
    false
  ),
  (
    'rm_mua_push',
    'RM Push — Recommended bride',
    '{{mua_name}} - {{plan_name}} - Recommended Bride',
    $t$Dear {{mua_name}},

We have a recommended bride for you:

Name: {{bride_name}}
City: {{city}}
Budget: {{budget_line}}

Events:
{{events_block}}{{makeup_details}}

{{disclaimer}}$t$,
    0,
    false
  )
) AS v(category, name, subject_template, body_template, approval_tier, requires_admin_approval)
WHERE NOT EXISTS (
  SELECT 1 FROM support.ticket_templates t
  WHERE t.name = v.name AND COALESCE(t.category, '') = COALESCE(v.category, '')
);
