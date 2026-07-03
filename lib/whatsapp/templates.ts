import type { MuaPushStage, PipelineStage } from "@/lib/types";

export type WhatsAppTemplatePool = "sales" | "rmMua" | "rmBride" | "care" | "feedback";

export const WHATSAPP_TEMPLATE_POOLS: WhatsAppTemplatePool[] = [
  "sales",
  "rmMua",
  "rmBride",
  "care",
  "feedback",
];

export type WhatsAppTemplate = {
  id: string;
  label: string;
  pool: WhatsAppTemplatePool;
  body: string;
  /** Optional image URL — user attaches manually in WhatsApp (wa.me cannot send media). */
  imageUrl?: string | null;
  /** Saved by staff — editable in admin. */
  saved?: boolean;
  createdBy?: string;
  createdByName?: string;
  createdAt?: string;
};

const FOOTER = "\n\nTeam Olready\n8699889901";

export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: "sales-first-outreach",
    label: "Untouched — first outreach",
    pool: "sales",
    body: `Hi,

We're reaching out from *Olready.in — Your Smart Beauty Club*.

Olready has been in the beauty-booking space for *11+ years*, helping connect makeup artists with genuine bridal & event enquiries.

We'd love to show you *Olready LIVE* in a quick 15-minute demo.

In the demo, you'll see:
✨ How enquiries come in
✨ Our 3-stage lead verification
✨ Filters by city, budget, event date & event type
✨ How artists access relevant leads
✨ RM coordination on selected plans

No pressure — just see if Olready can help you grow.${FOOTER}`,
  },
  {
    id: "sales-after-first-call",
    label: "After first call — push demo",
    pool: "sales",
    body: `Hi {muaName},

It was lovely speaking with you.

As discussed, before we talk about any plan, we'd love to first show you *Olready LIVE*.

It's a quick 15-minute walkthrough where you'll see how bridal/event leads come into the system, how we verify them, and how artists can filter and access enquiries that match their city, budget and event type.

Once you see the flow, you'll be able to decide if Olready is the right growth partner for you.

Can we schedule your demo today or tomorrow?${FOOTER}`,
  },
  {
    id: "sales-not-connected-1",
    label: "Not connected — first attempt",
    pool: "sales",
    body: `Hi {muaName},

We tried reaching you from *Olready.in* regarding growth opportunities for makeup artists.

Olready helps MUAs access genuine bridal and event enquiries through a verified lead system.

We'd love to show you the platform in a quick 15-minute live demo before discussing anything further.

Please let us know a good time to connect.${FOOTER}`,
  },
  {
    id: "sales-not-connected-2",
    label: "Not connected — second attempt",
    pool: "sales",
    body: `Hi {muaName},

Just checking in again from *Olready.in*.

We wanted to show you how Olready helps makeup artists discover genuine bridal/event enquiries, filter leads by city, budget and event date, and engage with customers through the platform.

It's only a 15-minute demo and can help you understand if this is useful for your business.

Can we connect today?${FOOTER}`,
  },
  {
    id: "sales-callback-scheduled",
    label: "Call back scheduled",
    pool: "sales",
    body: `Hi {muaName},

As discussed, we'll connect with you at {scheduledTime}.

We'll quickly walk you through how *Olready LIVE* works for makeup artists — how leads come in, how they are verified, and how you can access relevant bridal/event enquiries.

Looking forward to speaking with you.${FOOTER}`,
  },
  {
    id: "sales-demo-reminder",
    label: "Demo / call reminder",
    pool: "sales",
    body: `Hi {muaName},

This is a quick reminder for your *Olready LIVE demo* scheduled at {scheduledTime}.

In the demo, we'll show you how genuine bridal and event enquiries come into Olready, how they are verified, and how artists can filter and access leads as per city, budget and event date.

See you soon.${FOOTER}`,
  },
  {
    id: "sales-follow-up",
    label: "Follow up — no response",
    pool: "sales",
    body: `Hi {muaName},

Just following up from *Olready.in*.

We believe Olready can be useful for artists who want more visibility and access to genuine bridal/event enquiries.

Before discussing any plan, we only want to show you the live product so you can understand the system properly.

Can we schedule a quick 15-minute demo?${FOOTER}`,
  },
  {
    id: "sales-details-shared",
    label: "Details shared",
    pool: "sales",
    body: `Hi {muaName},

Sharing a quick overview of how Olready works:

1. We receive bridal and event enquiries
2. Our team verifies leads through a 3-stage process
3. Verified leads go live on the platform
4. Artists can filter leads by city, budget, event date and event type
5. On selected plans, our RMs help coordinate the booking process

The best way to understand this is through a quick live demo.

Can we schedule your demo today or tomorrow?${FOOTER}`,
  },
  {
    id: "sales-demo-scheduled",
    label: "Demo scheduled confirmation",
    pool: "sales",
    body: `Hi {muaName},

Your *Olready LIVE demo* is scheduled for {scheduledTime}.

In this 15-minute walkthrough, we'll show you:
✨ How leads come into Olready
✨ How we verify them
✨ How you can filter relevant enquiries
✨ How artists access and engage with leads
✨ How RM support works on selected plans

Looking forward to showing you the platform live.${FOOTER}`,
  },
  {
    id: "sales-demo-done",
    label: "Demo done — follow up",
    pool: "sales",
    body: `Hi {muaName},

Thank you for taking the time to attend the *Olready LIVE demo*.

We hope the platform flow was clear — from verified enquiries coming in, to filters by city, budget, event date and event type, to how artists can access and engage with relevant leads.

Olready is built for ambitious artists who want more visibility, better opportunities and a structured way to grow.

Would you like our team to guide you on the best plan fit for your city and business goals?${FOOTER}`,
  },
  {
    id: "sales-senior-call",
    label: "Senior call required",
    pool: "sales",
    body: `Hi {muaName},

Thank you for your interest in Olready.

To help you make the right decision, we'll arrange a short call with our senior team. They'll understand your city, category, current business flow and guide you on the best way to use Olready.

This will help you choose the right growth path instead of randomly selecting a plan.

Can we schedule the senior call today?${FOOTER}`,
  },
  {
    id: "sales-confirm",
    label: "Confirm — verbal confirmation",
    pool: "sales",
    body: `Hi {muaName},

Thank you for confirming your interest in joining Olready.

We're excited to have you as part of a premium league of ambitious artists.

Next steps:
1. Payment confirmation
2. Profile details collection
3. Platform training
4. Plan activation
5. Access to relevant verified enquiries

Once this is done, your Olready journey begins.${FOOTER}`,
  },
  {
    id: "sales-payment-followup",
    label: "Payment follow-up",
    pool: "sales",
    body: `Hi {muaName},

Just a quick reminder to complete your Olready activation process.

Once payment is confirmed, we'll start your onboarding, profile setup and training so you can begin accessing relevant verified enquiries on the platform.

Please share the payment confirmation once done.${FOOTER}`,
  },
  {
    id: "sales-deal-closed",
    label: "Deal closed — welcome",
    pool: "sales",
    body: `Hi {muaName},

Welcome to *Olready.in — Your Smart Beauty Club* ✨

We're excited to have you onboard as part of our artist network.

The next step is your onboarding and training. Our team will help collect your profile details, explain how lead access works, guide you through lead filters, and show you how to use the platform properly.

Let's grow together.${FOOTER}`,
  },
  {
    id: "sales-rejected",
    label: "Rejected — graceful exit",
    pool: "sales",
    body: `Hi {muaName},

No problem at all.

Thank you for taking the time to understand Olready.

We'll stay connected, and whenever you feel ready to explore verified bridal/event enquiries and grow your visibility, our team will be happy to help.

Wishing you lots of success.${FOOTER}`,
  },
  {
    id: "sales-renewal",
    label: "Lapsed / renewal",
    pool: "sales",
    body: `Hi {muaName},

Your Olready plan has ended, and we'd love to reconnect.

During your next phase, our team can help you review your previous experience, understand what worked, what didn't, and suggest the best way forward.

Olready is built to support artists with verified enquiries, visibility and structured lead access.

Can we schedule a quick renewal discussion?${FOOTER}`,
  },
  {
    id: "sales-demo-no-show",
    label: "Demo no-show — reschedule",
    pool: "sales",
    body: `Hi {muaName},

We had your *Olready LIVE demo* scheduled, but looks like you may have got busy.

No worries at all — we understand artists have packed schedules.

This demo is important because before discussing any plan, we want you to first see how Olready works live: verified enquiries, filters by city/budget/event date, lead access, and RM coordination on selected plans.

Can we reschedule your 15-minute demo for today or tomorrow?${FOOTER}`,
  },
  {
    id: "rm-mua-initial",
    label: "RM — initial contact to MUA",
    pool: "rmMua",
    body: `Hi {muaName},

Team Olready has a verified bridal enquiry that may match your profile for {city}.

We'd love to share the requirement details and check your availability. Please let us know if you're interested and we can take this forward.${FOOTER}`,
  },
  {
    id: "rm-mua-offer",
    label: "RM — offer / profile sent",
    pool: "rmMua",
    body: `Hi {muaName},

Sharing details of a verified bridal enquiry from Olready that may fit your style and city.

Please review the requirement and let us know your availability and comfort on budget. Team Olready is here if you need any clarification.${FOOTER}`,
  },
  {
    id: "rm-mua-followup",
    label: "RM — follow up with MUA",
    pool: "rmMua",
    body: `Hi {muaName},

Just checking in on the Olready bridal enquiry we shared with you.

Please let us know if you'd like to take this forward or if you need any more details from our side.${FOOTER}`,
  },
  {
    id: "rm-mua-negotiating",
    label: "RM — negotiating with MUA",
    pool: "rmMua",
    body: `Hi {muaName},

Following up on the bridal enquiry from Olready.

If budget, location or event date needs adjustment, please share what works for you and we'll try to align with the bride's requirement.${FOOTER}`,
  },
  {
    id: "rm-mua-selected",
    label: "RM — bride selected MUA",
    pool: "rmMua",
    body: `Hi {muaName},

Great news — the bride is interested in moving forward with you for this Olready enquiry.

Please keep your phone reachable so we can coordinate the next steps smoothly.${FOOTER}`,
  },
  {
    id: "rm-bride-ack",
    label: "Bride — new lead acknowledgement",
    pool: "rmBride",
    body: `Hi {brideName},

Thank you for sharing your makeup requirement with Olready. We know this is an important decision, and our team will help you find relevant makeup artist options based on your event, city, budget comfort and style preference.

Can we just confirm a couple of details before we suggest profiles?${FOOTER}`,
  },
  {
    id: "rm-bride-confirm-req",
    label: "Bride — requirement confirmation",
    pool: "rmBride",
    body: `Hi {brideName},

Can we just confirm a couple of things so we can recommend the right artists? Which event is this for, which city will it be in, and do you already have a preferred makeup style or artist in mind?${FOOTER}`,
  },
  {
    id: "rm-bride-multi-event",
    label: "Bride — multi-event clarification",
    pool: "rmBride",
    body: `Hi {brideName},

Since weddings often have more than one function, please tell us which events you need makeup for — Haldi, Mehndi, Sangeet, Wedding, Reception, family/group makeup or anything else. This helps us suggest artists more accurately.${FOOTER}`,
  },
  {
    id: "rm-bride-after-verify",
    label: "Bride — after verification",
    pool: "rmBride",
    body: `Hi {brideName},

Thank you for confirming the details. Team Olready will now review your requirement and share it with relevant artists who match your event, location, budget comfort and style preference. We will keep the suggestions focused so you are not overwhelmed.${FOOTER}`,
  },
  {
    id: "rm-bride-profiles",
    label: "Bride — profile sharing",
    pool: "rmBride",
    body: `Hi {brideName},

Sharing a few makeup artist profiles that may fit your requirement. Please review their work, style, availability and comfort. You can speak to the artists directly, and Team Olready is here if you need help comparing options.${FOOTER}`,
  },
  {
    id: "rm-bride-no-response",
    label: "Bride — no response after profiles",
    pool: "rmBride",
    body: `Hi {brideName},

Just checking if you got a chance to review the makeup artist profiles shared by Olready. If these do not match your style or budget comfort, we can look for more suitable options for you.${FOOTER}`,
  },
  {
    id: "rm-bride-concern",
    label: "Bride — concern or confusion",
    pool: "rmBride",
    body: `Hi {brideName},

No worries at all — choosing the right makeup artist can feel confusing. Share what is not feeling right: style, budget, location, availability or comfort. We will try to guide you better and suggest more relevant options.${FOOTER}`,
  },
  {
    id: "rm-bride-urgent",
    label: "Bride — urgent event",
    pool: "rmBride",
    body: `Hi {brideName},

Thank you for sharing. Since your event is close, artist availability may be limited, but Team Olready will try to help you quickly with relevant available options. Please keep your phone reachable so artists can connect without delay.${FOOTER}`,
  },
  {
    id: "rm-bride-closing",
    label: "Bride — closing line",
    pool: "rmBride",
    body: `Hi {brideName},

You focus on your big day. We will help you find the right artist. For any help, reach Team Olready at 8699889901.${FOOTER}`,
  },
  {
    id: "sales-demo-done-soft",
    label: "Demo done — soft nudge",
    pool: "sales",
    body: `Hi {muaName},

Just checking in after your Olready demo.

You saw how verified bridal/event enquiries come into the system and how artists can filter and access leads that match their requirements.

The next step is simple — we can help you choose the plan that fits your city, category and growth target.

Should we connect for 5 minutes and take this forward?${FOOTER}`,
  },
  {
    id: "sales-demo-done-strong",
    label: "Demo done — stronger nudge",
    pool: "sales",
    body: `Hi {muaName},

Hope you got a clear idea of how Olready works.

Since the platform is built around verified enquiries, smart filters and artist visibility, the sooner your profile is active, the sooner you can start exploring relevant leads.

Let's take the next step and activate the plan that fits your business best.

Can we connect today?${FOOTER}`,
  },
  {
    id: "sales-after-senior-call",
    label: "After senior call",
    pool: "sales",
    body: `Hi {muaName},

Thank you for speaking with our senior team.

Based on your profile, city and business goals, we feel Olready can help you improve visibility and connect with more relevant bridal/event enquiries.

We can now move ahead with the plan discussed and start your onboarding.

Shall we proceed?${FOOTER}`,
  },
  {
    id: "sales-onboarding-details",
    label: "Onboarding details required",
    pool: "sales",
    body: `Hi {muaName},

To start your Olready onboarding, please share the following details:

1. Makeup artist / business name
2. City and working locations
3. Instagram profile link
4. Email ID
5. Business address
6. Best contact number
7. Portfolio/profile pictures if available

Once received, we'll move ahead with your profile setup and training.${FOOTER}`,
  },
  {
    id: "sales-training-scheduled",
    label: "Training scheduled",
    pool: "sales",
    body: `Hi {muaName},

Your Olready platform training is scheduled for {scheduledTime}.

In this session, we'll show you:
✨ Your profile link
✨ How lead unlock works
✨ How to check city, budget and event date
✨ Lead reversal process
✨ Role of RM support
✨ How to view and engage with leads

Please keep 15–20 minutes free.${FOOTER}`,
  },
  {
    id: "sales-training-done",
    label: "Training done",
    pool: "sales",
    body: `Hi {muaName},

Your Olready training is complete.

You now know how to view your profile, check leads, use filters, understand lead budgets, unlock enquiries and raise lead-related concerns if needed.

Our team will now complete the final activation steps and update you once your plan is live.${FOOTER}`,
  },
  {
    id: "sales-plan-activated",
    label: "Plan activated",
    pool: "sales",
    body: `Hi {muaName},

Your Olready plan is now active ✨

You can start accessing relevant verified bridal and event enquiries as per your plan access.

Please remember:
✨ Check the platform regularly
✨ Use filters properly
✨ Engage with leads professionally
✨ Report any eligible lead issue within the required timeline
✨ Stay connected with your RM for support, wherever applicable

Welcome to the Olready family.${FOOTER}`,
  },
  {
    id: "sales-re-engagement",
    label: "Re-engagement — previous artist",
    pool: "sales",
    body: `Hi {muaName},

We're reaching out from *Olready.in*.

We understand that your earlier experience may not have delivered the business outcome you expected, and we genuinely value that feedback.

Olready has been working on improving the artist experience — better lead verification, clearer filters, stronger follow-up processes and a more structured RM support system on selected plans.

We'd love to reconnect and show you how the platform currently works.

Can we schedule a quick walkthrough?${FOOTER}`,
  },
  {
    id: "feedback-ask",
    label: "Add feedback — post-event call",
    pool: "feedback",
    body: `Hi {brideName},

Hope your celebrations in {city} went beautifully ✨

Team Olready would love a quick call to hear how everything went — your makeup experience, artist coordination, and anything we can do better.

When is a good time to connect for 5 minutes?${FOOTER}`,
  },
  {
    id: "feedback-follow-up",
    label: "Feedback — follow-up",
    pool: "feedback",
    body: `Hi {brideName},

Following up from Team Olready — we tried reaching you for a short post-event feedback call.

No rush at all. Whenever you have 5 minutes, please let us know a good time and we'll connect.${FOOTER}`,
  },
  {
    id: "feedback-poor-experience",
    label: "Poor experience — empathy & care",
    pool: "feedback",
    body: `Hi {brideName},

Thank you for sharing your honest feedback with Team Olready.

We're sorry your experience did not meet expectations. Your concern is important to us and our care team is reviewing it so we can respond properly.

Please keep your phone reachable — we'll call you shortly to understand and help.${FOOTER}`,
  },
  {
    id: "feedback-congratulations",
    label: "Congratulations — positive wrap-up",
    pool: "feedback",
    body: `Hi {brideName},

Congratulations on your wedding! ✨

It was wonderful hearing that things went well. Thank you for trusting Olready.

If you know any friends or family planning their makeup, we'd be grateful if you share their contact — we'll take good care of them too.${FOOTER}`,
  },
  {
    id: "care-ack",
    label: "Care — ticket acknowledgement",
    pool: "care",
    body: `Hi {muaName},

Thank you for reaching out to *Team Olready Care* regarding ticket {ticketNumber}.

We have received your concern and a care specialist is reviewing it. We will get back to you with an update within our SLA window.

If you have any documents or screenshots related to this issue, please share them when we connect.${FOOTER}`,
  },
  {
    id: "care-request-info",
    label: "Care — request info / proof",
    pool: "care",
    body: `Hi {muaName},

Team Olready Care is reviewing ticket {ticketNumber}.

To help us investigate faster, could you please share:
• Lead name / phone (if applicable)
• Date of the issue
• Any screenshots or ledger details you have

We appreciate your patience.${FOOTER}`,
  },
  {
    id: "care-callback-scheduled",
    label: "Care — callback scheduled",
    pool: "care",
    body: `Hi {muaName},

Regarding ticket {ticketNumber} — we have scheduled a callback from Team Olready Care.

Please keep your phone reachable. If this time does not work, reply here with a better slot.${FOOTER}`,
  },
  {
    id: "care-investigation-update",
    label: "Care — investigation in progress",
    pool: "care",
    body: `Hi {muaName},

Quick update on ticket {ticketNumber}: our care team is actively investigating with Sales / RM teams.

We will share findings and next steps once the review is complete. Thank you for your patience.${FOOTER}`,
  },
  {
    id: "care-reversal-review",
    label: "Care — lead reversal under review",
    pool: "care",
    body: `Hi {muaName},

We received your lead reversal request (ticket {ticketNumber}).

Our team is matching your ledger against CRM records and routing this for admin review. We will confirm how many leads qualify once the review is done.${FOOTER}`,
  },
  {
    id: "care-resolution-closed",
    label: "Care — ticket resolved",
    pool: "care",
    body: `Hi {muaName},

Your care ticket {ticketNumber} has been reviewed and closed.

If you need further clarification, reply here or email care@olready.in with your ticket number.${FOOTER}`,
  },
  {
    id: "sales-re-engagement-soft",
    label: "Re-engagement — softer version",
    pool: "sales",
    body: `Hi {muaName},

Hope you're doing well.

We wanted to reconnect with you from *Olready.in*.

Our platform and internal processes have evolved, especially around lead verification, artist filters, lead visibility and RM coordination.

We'd love to show you the current Olready flow and understand how we can support your business better this time.

Can we connect for a quick 10–15 minute call?${FOOTER}`,
  },
];

export const SALES_STAGE_DEFAULT_TEMPLATE: Partial<Record<PipelineStage, string>> = {
  Untouched: "sales-first-outreach",
  "Not Connected": "sales-not-connected-1",
  "Call Back": "sales-callback-scheduled",
  "Follow Up": "sales-follow-up",
  "Details Shared": "sales-details-shared",
  "Demo Scheduled": "sales-demo-scheduled",
  "Demo Done": "sales-demo-done",
  "Senior Call": "sales-senior-call",
  "Senior Call Done": "sales-follow-up",
  Confirm: "sales-confirm",
  "Deal Closed": "sales-deal-closed",
  Onboarding: "sales-deal-closed",
  Rejected: "sales-rejected",
};

export const RM_PUSH_STAGE_DEFAULT_TEMPLATE: Partial<Record<MuaPushStage, string>> = {
  initialContact: "rm-mua-initial",
  offerSent: "rm-mua-offer",
  followUpDone: "rm-mua-followup",
  negotiating: "rm-mua-negotiating",
  brideSelected: "rm-mua-selected",
};

export const RM_PUSH_BRIDE_DEFAULT_TEMPLATE: Partial<Record<MuaPushStage, string>> = {
  initialContact: "rm-bride-ack",
  offerSent: "rm-bride-profiles",
  followUpDone: "rm-bride-no-response",
  negotiating: "rm-bride-concern",
  brideSelected: "rm-bride-after-verify",
};

export function templatesForPool(pool: WhatsAppTemplatePool): WhatsAppTemplate[] {
  return WHATSAPP_TEMPLATES.filter((t) => t.pool === pool);
}

export function getTemplateById(id: string): WhatsAppTemplate | undefined {
  return WHATSAPP_TEMPLATES.find((t) => t.id === id);
}

export function defaultTemplateIdForSalesStage(stage: PipelineStage | null | undefined): string {
  if (!stage) return "sales-first-outreach";
  return SALES_STAGE_DEFAULT_TEMPLATE[stage] ?? "sales-follow-up";
}

export function defaultTemplateIdForPushStage(stage: MuaPushStage | null | undefined): string {
  if (!stage) return "rm-mua-initial";
  return RM_PUSH_STAGE_DEFAULT_TEMPLATE[stage] ?? "rm-mua-followup";
}

export function defaultBrideTemplateId(pushStage?: MuaPushStage | null): string {
  if (pushStage) return RM_PUSH_BRIDE_DEFAULT_TEMPLATE[pushStage] ?? "rm-bride-profiles";
  return "rm-bride-profiles";
}

export function defaultCareTemplateId(): string {
  return "care-ack";
}

export function defaultFeedbackTemplateId(): string {
  return "feedback-ask";
}
