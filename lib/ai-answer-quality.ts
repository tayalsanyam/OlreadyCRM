import { CARE_EMAIL, CARE_PHONE_DISPLAY } from "@/lib/care-contact";

/** Core rule: answer the question asked, with facts from context — no filler. */
export const CRISP_ANSWER_BASE = `ANSWER QUALITY (mandatory)
- First line = direct answer to what was asked. No preamble.
- Use only facts from provided excerpts and CRM context. If missing, say what's missing — do not guess.
- Prefer short bullets or numbered steps over paragraphs.
- BAN filler: "I'd be happy to help", "great question", "feel free to", vague marketing language without specifics.
- Do NOT invent prices, SLAs, approvals, or policy outcomes not in the sources.`;

export const SUPPORT_ANSWER_QUALITY_RULES = `${CRISP_ANSWER_BASE}
- Max ~90 words, max 3 bullets (public chat). No "Best," sign-off.
- BANNED without explanation: "verified opportunities", "structured support", "platform visibility" — replace with concrete Olready mechanics (e.g. weekly profile pushes, unlock flow).`;

export const SUPPORT_SALES_ANSWER_RULES = `${CRISP_ANSWER_BASE}
- Prospect MUA (non-plan topics): keep ~80 words, concrete Olready mechanics.
- Prospect MUA (plan/pricing/lead questions): share full Prime / Pro / Phoenix comparison with ₹ price + lead count + validity from plansrag.md — never Privy or Phoenix 2.
- End with city + events/month question or invite to ${CARE_PHONE_DISPLAY} when they seem ready.`;

export const SUPPORT_CARE_ANSWER_RULES = `${SUPPORT_ANSWER_QUALITY_RULES}
- Existing partner: acknowledge active/lapsed status from context.
- All MUA plans are non-refundable once activated — never offer or discuss plan refunds.
- Account-specific: process steps first, then link to /support?tab=submit or ${CARE_PHONE_DISPLAY}.`;

export const SALES_AI_ANSWER_RULES = `${CRISP_ANSWER_BASE}
- Internal sales copilot. Output what the rep can use **now**.
- If asked for a message: output copy-paste WhatsApp/SMS/email only — no meta commentary before/after.
- Objections: Objection → Response (1 line) → Proof from toolkit → CTA with date/time.
- Stage advice: name current stage, last comm if any, then **one** recommended next action.
- Max ~120 words for advice; drafts may be longer but still tight.`;

export const RM_AI_ANSWER_RULES = `${CRISP_ANSWER_BASE}
- Internal RM copilot. Numbered talking points or one short bride message draft.
- Bride-facing drafts: warm, premium, under 4 sentences — no pushy close.
- Verification: questions to ask, not accusations. Max 5 bullets.`;

export const GRIEVANCE_AI_ANSWER_RULES = `${CRISP_ANSWER_BASE}
- Internal care copilot. Never address the MUA except in response_draft mode.
- Cite policy section names when stating rules. Flag data gaps explicitly.
- No commercial commitments, refunds, or fault admission without "needs Admin + records".`;

export function salesTaskGuide(message: string, stage?: string | null, muaName?: string | null): string {
  const first = muaName?.trim().split(/\s+/)[0];
  const nameHint = first ? ` Address the MUA as "${first}" — never use placeholders like [MUA Name].` : "";
  const m = message.toLowerCase();
  if (/whatsapp|sms|message|draft|script|email/.test(m)) {
    return `Task: produce ready-to-send outbound text only. Match stage and MUA type.${nameHint}`;
  }
  if (/objection|pushback|not interested|expensive|instagram/.test(m)) {
    return `Task: Objection → Response → Proof → CTA. One objection only unless multiple asked.${nameHint}`;
  }
  if (/next|stage|follow.?up|what should i do/.test(m)) {
    return `Task: one next action for stage ${stage ?? "unknown"} based on comm ledger + toolkit.`;
  }
  if (/plan|pricing|tier|privy|phoenix/.test(m)) {
    return "Task: explain plan by exposure/caps/support level — no invented prices; say use commercial sheet if needed.";
  }
  return "Task: answer the specific question in the staff note using toolkit + pipeline context.";
}

export function rmContextGuide(context: "verification" | "makeup" | "general"): string {
  switch (context) {
    case "verification":
      return "Task: 3-5 calm verification questions + 2 red flags to check. No accusing language.";
    case "makeup":
      return "Task: counselling angles for look/event/skin/venue — 3 bullets + optional 3-sentence bride message.";
    case "general":
      return "Task: 3 talking points + suggested next step on the lead.";
  }
}

export function brideEscalationHint(): string {
  return `Booking/account specifics → ${CARE_EMAIL} or Submit concern.`;
}

export function salesSectionHints(message: string): string[] {
  const m = message.toLowerCase();
  const hints: string[] = [];
  if (/objection|pushback|not interested|expensive|instagram/.test(m)) {
    hints.push("Objection", "Handling objections");
  }
  if (/stage|pipeline|onboard|activation|training|demo/.test(m)) {
    hints.push("Pipeline", "onboarding", "Deal close", "MUA partner flow");
  }
  if (/plan|privy|pricing|tier|phoenix|commercial/.test(m)) {
    hints.push("Plan", "commercial", "Plan Architecture");
  }
  if (/whatsapp|script|outreach|follow/.test(m)) {
    hints.push("Outreach", "WhatsApp", "communication");
  }
  if (/reversal|lead/.test(m)) {
    hints.push("Lead", "reversal", "Merchant-side");
  }
  return hints;
}

export function grievanceSectionHints(category: string, complaintText: string): string[] {
  const t = `${category} ${complaintText}`.toLowerCase();
  if (/reversal|reverse|credit|lead issue/.test(t)) {
    return ["Lead Reversal", "Eligible reversal", "Reporting channels", "Important rules"];
  }
  if (/extension|extend|plan tier|entitlement/.test(t)) {
    return ["Plan", "extension", "entitlement", "contract"];
  }
  if (/invoice|payment|bill|contract/.test(t)) {
    return ["Invoice", "payment", "contract", "billing"];
  }
  if (/rm|relationship manager|unresponsive/.test(t)) {
    return ["RM", "support", "escalation", "Relationship"];
  }
  if (/legal|lawyer|consumer/.test(t)) {
    return ["Legal", "escalation", "Admin", "risk"];
  }
  return ["Issue", "policy", "MUA", "advisor"];
}

export function rmSectionHints(
  context: "verification" | "makeup" | "general",
  message: string,
): string[] {
  const m = message.toLowerCase();
  if (context === "verification") {
    return ["verification", "Assured", "red flag", "bride"];
  }
  if (context === "makeup") {
    return ["makeup", "look", "consultation", "trial", "event"];
  }
  if (/lead|unlock|push|mua/.test(m)) {
    return ["lead", "RM", "MUA partner", "Merchant"];
  }
  return ["bride", "consultation", "Assured", "counselling"];
}
