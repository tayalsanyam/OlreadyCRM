export type TicketEmailTemplateSample = {
  category: string | null;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  approvalTier: number;
  requiresAdminApproval: boolean;
};

const SIGNOFF = "Team Olready\n+91 86998 89901";

/** Default sample templates — seeded into support.ticket_templates. */
export const TICKET_EMAIL_TEMPLATE_SAMPLES: TicketEmailTemplateSample[] = [
  // —— General (all tickets) ——
  {
    category: null,
    name: "General — Acknowledgement",
    subjectTemplate: "We received your concern — {{ticket_number}}",
    bodyTemplate: `Dear {{party_name}},

Thank you for reaching out to Team Olready. We have received your concern (reference {{ticket_number}}) and our care team is reviewing it.

We will get back to you shortly from care@olready.in.

${SIGNOFF}`,
    approvalTier: 0,
    requiresAdminApproval: false,
  },
  {
    category: null,
    name: "General — Issue resolved",
    subjectTemplate: "Your concern is resolved — {{ticket_number}}",
    bodyTemplate: `Dear {{party_name}},

Thank you for your patience regarding ticket {{ticket_number}}.

{{resolution}}

{{next_steps}}

If anything remains unclear, reply to this email and we will help.

${SIGNOFF}`,
    approvalTier: 1,
    requiresAdminApproval: true,
  },
  {
    category: null,
    name: "General — Request more information",
    subjectTemplate: "Additional information needed — {{ticket_number}}",
    bodyTemplate: `Dear {{party_name}},

To proceed with your concern ({{ticket_number}}), we need a few more details:

{{next_steps}}

Please reply to this email with the information so we can complete our review.

${SIGNOFF}`,
    approvalTier: 0,
    requiresAdminApproval: false,
  },
  {
    category: null,
    name: "General — Request proof",
    subjectTemplate: "Proof requested — {{ticket_number}}",
    bodyTemplate: `Dear {{party_name}},

For ticket {{ticket_number}}, please share the requested proof or screenshots so we can complete our review.

{{next_steps}}

${SIGNOFF}`,
    approvalTier: 0,
    requiresAdminApproval: false,
  },
  {
    category: null,
    name: "General — Follow-up check-in",
    subjectTemplate: "Following up on your concern — {{ticket_number}}",
    bodyTemplate: `Dear {{party_name}},

We are following up on ticket {{ticket_number}}.

{{next_steps}}

Please let us know if the issue is resolved or if you need further assistance.

${SIGNOFF}`,
    approvalTier: 0,
    requiresAdminApproval: false,
  },
  {
    category: null,
    name: "General — Initial reply",
    subjectTemplate: "Update on your concern — {{ticket_number}}",
    bodyTemplate: `Dear {{party_name}},

Thank you for your patience regarding ticket {{ticket_number}}. We have reviewed your concern and wanted to share an update.

{{resolution}}

{{next_steps}}

Please reply to this email if you have questions or additional information.

${SIGNOFF}`,
    approvalTier: 0,
    requiresAdminApproval: false,
  },
  {
    category: null,
    name: "General — Resolution proposed",
    subjectTemplate: "Proposed resolution — {{ticket_number}}",
    bodyTemplate: `Dear {{party_name}},

Following our review of ticket {{ticket_number}}, we would like to propose the following resolution:

{{resolution}}

{{next_steps}}

Please let us know if you accept this resolution or if you would like to discuss further.

${SIGNOFF}`,
    approvalTier: 1,
    requiresAdminApproval: true,
  },
  {
    category: null,
    name: "General — Awaiting your response",
    subjectTemplate: "Waiting for your reply — {{ticket_number}}",
    bodyTemplate: `Dear {{party_name}},

We are waiting for your response on ticket {{ticket_number}} before we can proceed.

{{next_steps}}

Please reply to this email at your earliest convenience.

${SIGNOFF}`,
    approvalTier: 0,
    requiresAdminApproval: false,
  },
  // —— Bride / lead tickets ——
  {
    category: "too_many_calls",
    name: "Bride — Too many calls apology",
    subjectTemplate: "Update on your call concern — {{ticket_number}}",
    bodyTemplate: `Dear {{bride_name}},

Thank you for telling us about the repeated calls on ticket {{ticket_number}}. We understand this can be frustrating during wedding planning.

We have noted your feedback and {{next_steps}}

${SIGNOFF}`,
    approvalTier: 1,
    requiresAdminApproval: true,
  },
  {
    category: "artist_not_responding",
    name: "Bride — Artist not responding",
    subjectTemplate: "Update on artist contact — {{ticket_number}}",
    bodyTemplate: `Dear {{bride_name}},

Regarding ticket {{ticket_number}} about the artist not responding:

{{resolution}}

{{next_steps}}

We are here to help you find a suitable next step.

${SIGNOFF}`,
    approvalTier: 1,
    requiresAdminApproval: false,
  },
  {
    category: "no_contact_from_muas",
    name: "Bride — No MUA contact",
    subjectTemplate: "Artist outreach update — {{ticket_number}}",
    bodyTemplate: `Dear {{bride_name}},

We are looking into ticket {{ticket_number}} where you did not receive contact from artists after your enquiry.

{{next_steps}}

${SIGNOFF}`,
    approvalTier: 1,
    requiresAdminApproval: false,
  },
  {
    category: "rm_unresponsive",
    name: "Bride — RM unresponsive",
    subjectTemplate: "RM follow-up on your concern — {{ticket_number}}",
    bodyTemplate: `Dear {{bride_name}},

Thank you for raising ticket {{ticket_number}} about your relationship manager.

We have escalated this internally and {{next_steps}}

${SIGNOFF}`,
    approvalTier: 2,
    requiresAdminApproval: true,
  },
  {
    category: "wrong_details_shared",
    name: "Bride — Wrong details shared",
    subjectTemplate: "Correction on shared details — {{ticket_number}}",
    bodyTemplate: `Dear {{bride_name}},

We apologise for any incorrect information shared regarding ticket {{ticket_number}}.

{{resolution}}

{{next_steps}}

${SIGNOFF}`,
    approvalTier: 1,
    requiresAdminApproval: true,
  },
  {
    category: "other",
    name: "Bride — Acknowledgement",
    subjectTemplate: "We received your concern — {{ticket_number}}",
    bodyTemplate: `Dear {{bride_name}},

Thank you for contacting Team Olready Care. We have received your message (reference {{ticket_number}}) and a care specialist will review it shortly.

{{next_steps}}

${SIGNOFF}`,
    approvalTier: 0,
    requiresAdminApproval: false,
  },
  {
    category: "other",
    name: "Bride — Issue resolved",
    subjectTemplate: "Your concern is resolved — {{ticket_number}}",
    bodyTemplate: `Dear {{bride_name}},

We are pleased to confirm that ticket {{ticket_number}} has been addressed.

{{resolution}}

{{next_steps}}

We hope your wedding planning goes smoothly.

${SIGNOFF}`,
    approvalTier: 1,
    requiresAdminApproval: true,
  },
  // —— MUA tickets ——
  {
    category: "lead_reversal",
    name: "MUA — Reversal under review",
    subjectTemplate: "Lead reversal under review — {{ticket_number}}",
    bodyTemplate: `Dear {{mua_name}},

Your lead reversal request ({{ticket_number}}) is under review. We will share our decision after verifying your plan and lead records.

{{next_steps}}

${SIGNOFF}`,
    approvalTier: 1,
    requiresAdminApproval: false,
  },
  {
    category: "lead_reversal",
    name: "MUA — Reversal approved",
    subjectTemplate: "Lead reversal approved — {{ticket_number}}",
    bodyTemplate: `Dear {{mua_name}},

Following our review of ticket {{ticket_number}}:

{{resolution}}

{{next_steps}}

${SIGNOFF}`,
    approvalTier: 2,
    requiresAdminApproval: true,
  },
  {
    category: "lead_reversal",
    name: "MUA — Reversal rejected",
    subjectTemplate: "Lead reversal decision — {{ticket_number}}",
    bodyTemplate: `Dear {{mua_name}},

Following our review of ticket {{ticket_number}}:

{{resolution}}

{{next_steps}}

If you have additional evidence, reply to this email and we can re-open the review.

${SIGNOFF}`,
    approvalTier: 2,
    requiresAdminApproval: true,
  },
  {
    category: "lead_quality",
    name: "MUA — Lead quality investigating",
    subjectTemplate: "Lead quality review — {{ticket_number}}",
    bodyTemplate: `Dear {{mua_name}},

We are reviewing the lead quality concerns raised in ticket {{ticket_number}}.

{{next_steps}}

${SIGNOFF}`,
    approvalTier: 1,
    requiresAdminApproval: false,
  },
  {
    category: "lead_quality",
    name: "MUA — Lead quality resolved",
    subjectTemplate: "Lead quality update — {{ticket_number}}",
    bodyTemplate: `Dear {{mua_name}},

Regarding ticket {{ticket_number}}:

{{resolution}}

{{next_steps}}

${SIGNOFF}`,
    approvalTier: 1,
    requiresAdminApproval: true,
  },
  {
    category: "did_not_get_business",
    name: "MUA — Did not get business",
    subjectTemplate: "Business conversion review — {{ticket_number}}",
    bodyTemplate: `Dear {{mua_name}},

We are reviewing ticket {{ticket_number}} regarding leads that did not convert to bookings.

{{next_steps}}

${SIGNOFF}`,
    approvalTier: 1,
    requiresAdminApproval: false,
  },
  {
    category: "plan_extension",
    name: "MUA — Plan extension",
    subjectTemplate: "Plan extension request — {{ticket_number}}",
    bodyTemplate: `Dear {{mua_name}},

We have received your plan extension request ({{ticket_number}}).

{{next_steps}}

Our team will confirm eligibility and share options shortly.

${SIGNOFF}`,
    approvalTier: 1,
    requiresAdminApproval: true,
  },
  {
    category: "invoice_contract",
    name: "MUA — Invoice / payment",
    subjectTemplate: "Billing query — {{ticket_number}}",
    bodyTemplate: `Dear {{mua_name}},

Regarding your billing or invoice query on ticket {{ticket_number}}:

{{resolution}}

{{next_steps}}

${SIGNOFF}`,
    approvalTier: 0,
    requiresAdminApproval: false,
  },
  {
    category: "rm_relationship",
    name: "MUA — RM relationship",
    subjectTemplate: "RM concern — {{ticket_number}}",
    bodyTemplate: `Dear {{mua_name}},

We have noted your feedback about your relationship manager on ticket {{ticket_number}}.

{{next_steps}}

A senior coordinator will follow up with you.

${SIGNOFF}`,
    approvalTier: 2,
    requiresAdminApproval: true,
  },
  {
    category: "sales_promise",
    name: "MUA — Sales promise",
    subjectTemplate: "Sales promise review — {{ticket_number}}",
    bodyTemplate: `Dear {{mua_name}},

We are investigating the sales commitment mentioned in ticket {{ticket_number}}.

{{resolution}}

{{next_steps}}

${SIGNOFF}`,
    approvalTier: 2,
    requiresAdminApproval: true,
  },
  {
    category: "profile_query",
    name: "MUA — Profile / plan query",
    subjectTemplate: "Profile & plan query — {{ticket_number}}",
    bodyTemplate: `Dear {{mua_name}},

Thank you for your profile or plan question ({{ticket_number}}).

{{resolution}}

{{next_steps}}

${SIGNOFF}`,
    approvalTier: 0,
    requiresAdminApproval: false,
  },
  {
    category: "rm_mua_push",
    name: "RM Push — Privy bride share",
    subjectTemplate: "{{mua_name}} - Privy - Bride Push",
    bodyTemplate: `Dear {{mua_name}},

We are sharing a bride profile with you:

Name: {{bride_name}}
City: {{city}}
Budget: {{budget_line}}

Events:
{{events_block}}{{makeup_details}}

{{disclaimer}}`,
    approvalTier: 0,
    requiresAdminApproval: false,
  },
  {
    category: "rm_mua_push",
    name: "RM Push — Recommended bride",
    subjectTemplate: "{{mua_name}} - {{plan_name}} - Recommended Bride",
    bodyTemplate: `Dear {{mua_name}},

We have a recommended bride for you:

Name: {{bride_name}}
City: {{city}}
Budget: {{budget_line}}

Events:
{{events_block}}{{makeup_details}}

{{disclaimer}}`,
    approvalTier: 0,
    requiresAdminApproval: false,
  },
];

export const TICKET_EMAIL_TEMPLATE_CATEGORY_OPTIONS = [
  { value: "", label: "General (all categories)" },
  { value: "too_many_calls", label: "Bride — Too many calls" },
  { value: "artist_not_responding", label: "Bride — Artist not responding" },
  { value: "no_contact_from_muas", label: "Bride — No contact from MUAs" },
  { value: "rm_unresponsive", label: "Bride — RM unresponsive" },
  { value: "wrong_details_shared", label: "Bride — Wrong details shared" },
  { value: "lead_reversal", label: "MUA — Lead reversal" },
  { value: "lead_quality", label: "MUA — Lead quality" },
  { value: "did_not_get_business", label: "MUA — Did not get business" },
  { value: "plan_extension", label: "MUA — Plan extension" },
  { value: "invoice_contract", label: "MUA — Invoice / contract" },
  { value: "rm_relationship", label: "MUA — RM relationship" },
  { value: "sales_promise", label: "MUA — Sales promise" },
  { value: "profile_query", label: "MUA — Profile / plan query" },
  { value: "rm_mua_push", label: "RM — MUA push notification" },
  { value: "other", label: "Other" },
];
